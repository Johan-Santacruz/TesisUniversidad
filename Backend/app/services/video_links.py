"""Traer el testimonio por enlace en vez de por archivo.

El material de prueba de la tesis vive en YouTube —noticieros, la Unidad para
las Víctimas, agencias— y hasta ahora el camino era manual: descargar con
yt-dlp, normalizar con ffmpeg y subir el archivo. Esto hace ese mismo recorrido
del lado del servidor y entrega un descriptor de archivo, que es justo lo que
`VideoService.create` ya sabe recibir. De ahí en adelante no hay ninguna ruta
nueva: el video se valida, se cifra y se analiza igual que uno subido a mano.

Tres decisiones que conviene tener presentes:

  1. **Viene apagado.** `SENDA_LINK_INGEST_ENABLED` es falso por omisión. En un
     dominio público con una cuenta de demostración conocida, un botón que baja
     cualquier URL de YouTube convierte al servidor en un descargador ajeno. Se
     enciende en el equipo de trabajo, donde la descarga es parte del método.
  2. **Sólo YouTube.** No por preferencia sino por alcance: es lo que el corpus
     de pruebas usa, y una lista blanca corta es más fácil de defender que una
     que acepta cualquier host que yt-dlp reconozca.
  3. **Se mide antes de bajar.** La duración se consulta sin descargar y se
     rechaza ahí lo que exceda el tope. Bajar 40 minutos para descubrir después
     que no cabía gasta el ancho de banda del servidor y el tiempo de quien
     espera.

Nada de esto sortea las restricciones de YouTube: descargar va contra sus
términos de servicio, y desde la IP de un centro de datos la plataforma suele
pedir verificación y devolver un error. Es una herramienta de trabajo para el
material propio de la investigación, no un servicio de descarga.

**La sesión.** YouTube exige verificación por tasa: las peticiones anónimas
seguidas desde una misma IP acaban topándose con "confirma que no eres un
robot". Se puede evitar dándole una sesión iniciada, de dos maneras:

  - `SENDA_LINK_COOKIES_FROM_BROWSER=chrome` lee las cookies del navegador de
    la propia máquina. Sirve en un equipo de trabajo y no en un servidor, donde
    no hay navegador.
  - `SENDA_LINK_COOKIES_FILE=/secretos/youtube-cookies.txt` apunta a un archivo
    de cookies exportado. Es el camino del servidor.

Ese archivo es una sesión de Google viva: quien lo lea entra a esa cuenta. En
un servidor, úsalo con una cuenta desechable, nunca con la personal, y ten
presente que YouTube puede sancionar la cuenta por acceso automatizado desde la
IP de un centro de datos. Va montado de sólo lectura y fuera del contexto de
construcción de la imagen, para que no quede horneado en ninguna capa.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import parse_qs, urlparse
import re
import tempfile


# Hosts de YouTube y nada más. `youtu.be` lleva el identificador en la ruta.
ALLOWED_HOSTS = frozenset({
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
    "www.youtu.be",
})


class VideoLinkError(ValueError):
    """Error de ingesta por enlace con un motivo legible para quien lo pegó."""


class LinkIngestDisabledError(VideoLinkError):
    pass


class UnsupportedHostError(VideoLinkError):
    pass


class VideoTooLongError(VideoLinkError):
    pass


class DownloadFailedError(VideoLinkError):
    pass


class DownloaderUnavailableError(VideoLinkError):
    pass


@dataclass(frozen=True)
class RemoteVideo:
    """Lo que quedó en disco tras la descarga, con lo poco que se sabe de él."""

    path: Path
    title: str
    duration_seconds: int


def normalize_link(raw: str) -> str:
    """Valida el enlace y lo devuelve limpio, o explica por qué no sirve.

    Se recorta a esquema, host y el identificador del video: una URL de YouTube
    trae listas de reproducción, marcas de tiempo y parámetros de campaña que no
    aportan nada a la descarga y sí ensucian el registro de auditoría.
    """
    candidate = (raw or "").strip()
    if not candidate:
        raise VideoLinkError("Pega el enlace del video.")
    if "://" not in candidate:
        # Un pegado desde la barra del navegador a veces llega sin esquema.
        candidate = f"https://{candidate}"

    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"}:
        raise VideoLinkError("El enlace tiene que empezar por https.")

    host = (parsed.hostname or "").lower()
    if host not in ALLOWED_HOSTS:
        raise UnsupportedHostError(
            "Por ahora sólo se aceptan enlaces de YouTube.",
        )

    if host in {"youtu.be", "www.youtu.be"}:
        video_id = parsed.path.lstrip("/").split("/")[0]
    elif parsed.path == "/watch":
        video_id = (parse_qs(parsed.query).get("v") or [""])[0]
    elif parsed.path.startswith(("/shorts/", "/embed/", "/live/")):
        video_id = parsed.path.split("/")[2] if len(parsed.path.split("/")) > 2 else ""
    else:
        video_id = ""

    # Los identificadores de YouTube son once caracteres del alfabeto de URL. Se
    # toma la primera tirada válida y se descarta el resto: un enlace compartido
    # a veces llega con la marca de tiempo pegada al identificador y sin el "?"
    # que la separaría, y rechazarlo por eso sería quisquilloso de más.
    video_id = _leading_id(video_id)
    if len(video_id) < 8:
        raise VideoLinkError("Ese enlace no apunta a un video de YouTube.")

    return f"https://www.youtube.com/watch?v={video_id}"


def _leading_id(value: str) -> str:
    matched = re.match(r"[A-Za-z0-9_-]+", value or "")
    return matched.group(0) if matched else ""


class Downloader(Protocol):
    """El descargador real y el de las pruebas entran por aquí."""

    def fetch(self, url: str, destination: Path, max_seconds: int) -> RemoteVideo:
        ...


class YtDlpDownloader:
    """Envuelve yt-dlp con el mismo perfil con el que se armó el corpus.

    El formato se limita a 480p en MP4 por la misma razón que en el guion
    manual: es la calidad con la que se transcribió y clasificó todo el material
    de prueba, y mantiene los archivos lejos del tope de 500 MB.

    Una sola extracción por intento. Antes eran dos —una para medir la duración
    y otra para bajar—, y eso duplicaba la tasa de peticiones, que es
    justamente lo que dispara la verificación de YouTube. El tope de duración lo
    aplica ahora el propio yt-dlp con un filtro, antes de empezar a descargar.
    """

    FORMAT = "bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]/b[ext=mp4]/b"

    def __init__(
        self,
        *,
        max_bytes: int,
        socket_timeout: int = 30,
        cookie_file: Path | None = None,
        cookies_from_browser: str = "",
    ) -> None:
        self.max_bytes = max_bytes
        self.socket_timeout = socket_timeout
        self.cookie_file = cookie_file
        self.cookies_from_browser = cookies_from_browser

    def _module(self):
        # Importación diferida: la aplicación arranca sin yt-dlp instalado y
        # sólo falla —con un motivo claro— quien use la ingesta por enlace.
        try:
            import yt_dlp
        except ImportError as exc:  # pragma: no cover - depende del entorno
            raise DownloaderUnavailableError(
                "La descarga por enlace no está instalada en este servidor.",
            ) from exc
        return yt_dlp

    def _sesion(self) -> dict:
        """Cookies, si las hay. Sin ellas la petición va anónima."""
        if self.cookie_file:
            if not self.cookie_file.exists():
                raise DownloadFailedError(
                    f"No existe el archivo de cookies {self.cookie_file}.",
                )
            return {"cookiefile": str(self.cookie_file)}
        if self.cookies_from_browser:
            # yt-dlp espera una tupla: (navegador, perfil, contenedor, palabra).
            return {"cookiesfrombrowser": (self.cookies_from_browser,)}
        return {}

    def _options(self, destination: Path, max_seconds: int) -> dict:
        def filtro(info, *, incomplete=False):
            duracion = info.get("duration") or 0
            if duracion and duracion > max_seconds:
                # Devolver un texto le dice a yt-dlp que salte este video. No
                # lanza nada: sigue adelante y entrega la información sin haber
                # descargado. El rechazo se convierte en error más abajo.
                return _demasiado_largo(int(duracion), max_seconds)
            return None

        return {
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "noplaylist": True,
            "socket_timeout": self.socket_timeout,
            "retries": 2,
            "format": self.FORMAT,
            "merge_output_format": "mp4",
            "max_filesize": self.max_bytes,
            "outtmpl": str(destination / "%(id)s.%(ext)s"),
            "match_filter": filtro,
        } | self._sesion()

    def fetch(self, url: str, destination: Path, max_seconds: int) -> RemoteVideo:
        yt_dlp = self._module()
        # YouTube devuelve 403 de vez en cuando sobre la URL del medio, incluso
        # para un video público que acaba de bajarse bien. Un segundo intento
        # convierte ese fallo en un tropiezo invisible; si vuelve a fallar, el
        # motivo sube tal cual.
        ultimo: Exception | None = None
        info = None
        path: Path | None = None
        for _ in range(2):
            try:
                with yt_dlp.YoutubeDL(self._options(destination, max_seconds)) as downloader:
                    info = downloader.extract_info(url, download=True)
                    if info is None:
                        raise DownloadFailedError("YouTube no devolvió el video.")
                    # El filtro ya impidió la descarga; aquí se le pone nombre.
                    duracion = int(info.get("duration") or 0)
                    if duracion and duracion > max_seconds:
                        raise VideoTooLongError(_demasiado_largo(duracion, max_seconds))
                    path = Path(downloader.prepare_filename(info))
                break
            except VideoLinkError:
                raise
            except Exception as exc:
                ultimo = exc
        else:
            raise DownloadFailedError(_readable(ultimo)) from ultimo

        assert path is not None and info is not None
        if not path.exists():
            # Con merge_output_format el nombre final puede cambiar de extensión.
            candidatos = sorted(destination.glob("*"), key=lambda p: p.stat().st_size)
            if not candidatos:
                raise DownloadFailedError("La descarga no dejó ningún archivo.")
            path = candidatos[-1]

        return RemoteVideo(
            path=path,
            title=str(info.get("title") or "").strip(),
            duration_seconds=int(info.get("duration") or 0),
        )


def _demasiado_largo(duracion: int, tope: int) -> str:
    return (
        f"El video dura {duracion // 60} minutos y el máximo son {tope // 60}. "
        "Recorta el fragmento que quieras analizar y súbelo como archivo."
    )


def _readable(error: Exception | None) -> str:
    """El mensaje de yt-dlp, recortado y sin rastros de la consola."""
    message = str(error or "").replace("\x1b[0;31mERROR:\x1b[0m", "").strip()
    if "403" in message or "Forbidden" in message:
        return (
            "YouTube rechazó la descarga de este video. Vuelve a intentarlo; si "
            "insiste, descárgalo y súbelo como archivo."
        )
    if "Sign in to confirm" in message or "bot" in message.lower():
        return (
            "YouTube pidió verificación para esta descarga. Suele pasar cuando "
            "la petición sale de un servidor: descarga el video y súbelo como "
            "archivo."
        )
    if "Private video" in message or "unavailable" in message.lower():
        return "El video no está disponible públicamente."
    return message[:300] or "No se pudo descargar el video."


class VideoLinkService:
    """Descarga el enlace y lo deja listo para `VideoService.create`."""

    def __init__(
        self,
        *,
        enabled: bool,
        max_duration_seconds: int,
        downloader: Downloader,
    ) -> None:
        self.enabled = enabled
        self.max_duration_seconds = max_duration_seconds
        self.downloader = downloader

    def fetch(self, raw_url: str):
        """Devuelve un contexto con el archivo abierto; al salir se borra.

        Se entrega abierto y no como ruta porque el temporal se destruye con el
        contexto: quien lo recibe lo lee dentro, que es lo que hace el servicio
        de video al cifrarlo.
        """
        if not self.enabled:
            raise LinkIngestDisabledError(
                "La ingesta por enlace está desactivada en este servidor.",
            )
        url = normalize_link(raw_url)
        return _DownloadedFile(self.downloader, url, self.max_duration_seconds)


class _DownloadedFile:
    """Contexto que baja el video, lo abre y limpia el temporal al salir."""

    def __init__(self, downloader: Downloader, url: str, max_seconds: int) -> None:
        self.downloader = downloader
        self.url = url
        self.max_seconds = max_seconds
        self._directory: tempfile.TemporaryDirectory | None = None
        self._handle = None
        self.video: RemoteVideo | None = None

    def __enter__(self):
        self._directory = tempfile.TemporaryDirectory(prefix="senda-enlace-")
        try:
            self.video = self.downloader.fetch(
                self.url,
                Path(self._directory.name),
                self.max_seconds,
            )
            self._handle = self.video.path.open("rb")
        except BaseException:
            # Si la descarga falla, el temporal se limpia aquí: __exit__ no
            # llega a ejecutarse cuando __enter__ es el que revienta.
            self._directory.cleanup()
            self._directory = None
            raise
        return self

    def __exit__(self, *exception: object) -> None:
        if self._handle is not None:
            self._handle.close()
        if self._directory is not None:
            self._directory.cleanup()

    @property
    def source(self):
        if self._handle is None:
            raise RuntimeError("El archivo sólo existe dentro del contexto.")
        return self._handle
