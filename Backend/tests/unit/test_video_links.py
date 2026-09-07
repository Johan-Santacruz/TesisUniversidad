from __future__ import annotations

from pathlib import Path

import pytest

from app.services.video_links import (
    DownloadFailedError,
    LinkIngestDisabledError,
    RemoteVideo,
    UnsupportedHostError,
    VideoLinkError,
    VideoLinkService,
    VideoTooLongError,
    YtDlpDownloader,
    normalize_link,
)


class DownloaderDeMentira:
    """Cuenta lo que le pidieron: sirve para probar que algo NO se descargó."""

    def __init__(self, *, duration: int = 120) -> None:
        self.duration = duration
        self.calls: list[str] = []

    def fetch(self, url: str, destination: Path, max_seconds: int) -> RemoteVideo:
        self.calls.append(url)
        if self.duration > max_seconds:
            raise VideoTooLongError(
                f"El video dura {self.duration // 60} minutos y el máximo son "
                f"{max_seconds // 60}."
            )
        archivo = destination / "video.mp4"
        archivo.write_bytes(b"video")
        return RemoteVideo(path=archivo, title="Testimonio", duration_seconds=self.duration)


@pytest.mark.parametrize(
    "entrada",
    [
        "https://www.youtube.com/watch?v=E6ikYBkI2QE",
        "https://youtu.be/E6ikYBkI2QE",
        "https://m.youtube.com/watch?v=E6ikYBkI2QE",
        "https://www.youtube.com/shorts/E6ikYBkI2QE",
        # Sin esquema: es como queda al copiar de la barra de algunos navegadores.
        "youtube.com/watch?v=E6ikYBkI2QE",
        # Con lista, marca de tiempo y campaña: todo eso sobra para la descarga.
        "https://www.youtube.com/watch?v=E6ikYBkI2QE&list=PL123&t=42s&si=abc",
    ],
)
def test_normalize_link_reduce_todas_las_formas_a_una(entrada):
    assert normalize_link(entrada) == "https://www.youtube.com/watch?v=E6ikYBkI2QE"


@pytest.mark.parametrize(
    "entrada",
    ["https://vimeo.com/12345678", "https://ejemplo.com/watch?v=E6ikYBkI2QE"],
)
def test_normalize_link_rechaza_otros_hosts(entrada):
    with pytest.raises(UnsupportedHostError):
        normalize_link(entrada)


@pytest.mark.parametrize(
    "entrada",
    ["", "   ", "https://www.youtube.com/", "https://www.youtube.com/watch?v="],
)
def test_normalize_link_rechaza_lo_que_no_apunta_a_un_video(entrada):
    with pytest.raises(VideoLinkError):
        normalize_link(entrada)


def test_el_servicio_apagado_no_toca_la_red():
    descargador = DownloaderDeMentira()
    servicio = VideoLinkService(
        enabled=False,
        max_duration_seconds=1800,
        downloader=descargador,
    )

    with pytest.raises(LinkIngestDisabledError):
        servicio.fetch("https://youtu.be/E6ikYBkI2QE")

    assert descargador.calls == []


def test_un_video_demasiado_largo_se_rechaza(tmp_path):
    """El tope viaja hasta el descargador, que lo aplica antes de traer nada."""
    descargador = DownloaderDeMentira(duration=3600)
    servicio = VideoLinkService(
        enabled=True,
        max_duration_seconds=1800,
        downloader=descargador,
    )

    with pytest.raises(VideoTooLongError) as error:
        with servicio.fetch("https://youtu.be/E6ikYBkI2QE"):
            pass

    assert "60 minutos" in str(error.value)
    assert not list(tmp_path.iterdir())  # no quedó ningún archivo suelto


def test_el_temporal_desaparece_al_salir_del_contexto():
    servicio = VideoLinkService(
        enabled=True,
        max_duration_seconds=1800,
        downloader=DownloaderDeMentira(),
    )

    with servicio.fetch("https://youtu.be/E6ikYBkI2QE") as descarga:
        ruta = descarga.video.path
        assert descarga.source.read() == b"video"
        assert ruta.exists()

    assert not ruta.exists()


# ── La sesión: cookies para que YouTube no pida verificación ───────────────


def test_sin_cookies_la_peticion_va_anonima(tmp_path):
    descargador = YtDlpDownloader(max_bytes=1024)

    opciones = descargador._options(tmp_path, 1800)

    assert "cookiefile" not in opciones
    assert "cookiesfrombrowser" not in opciones


def test_el_archivo_de_cookies_llega_a_yt_dlp(tmp_path):
    galletas = tmp_path / "youtube-cookies.txt"
    galletas.write_text("# Netscape HTTP Cookie File\n", encoding="utf-8")
    descargador = YtDlpDownloader(max_bytes=1024, cookie_file=galletas)

    opciones = descargador._options(tmp_path, 1800)

    assert opciones["cookiefile"] == str(galletas)


def test_un_archivo_de_cookies_que_no_existe_se_explica(tmp_path):
    descargador = YtDlpDownloader(max_bytes=1024, cookie_file=tmp_path / "no-esta.txt")

    with pytest.raises(DownloadFailedError) as error:
        descargador._options(tmp_path, 1800)

    assert "no-esta.txt" in str(error.value)


def test_el_navegador_llega_como_tupla(tmp_path):
    """yt-dlp espera (navegador, perfil, contenedor, palabra), no una cadena."""
    descargador = YtDlpDownloader(max_bytes=1024, cookies_from_browser="chrome")

    opciones = descargador._options(tmp_path, 1800)

    assert opciones["cookiesfrombrowser"] == ("chrome",)


def test_el_tope_de_duracion_lo_aplica_el_filtro_de_yt_dlp(tmp_path):
    """Un solo viaje: el rechazo por duración ocurre sin una petición aparte."""
    descargador = YtDlpDownloader(max_bytes=1024)
    filtro = descargador._options(tmp_path, 600)["match_filter"]

    assert filtro({"duration": 300}) is None
    assert "60 minutos" in filtro({"duration": 3600})
