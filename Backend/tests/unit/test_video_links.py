from __future__ import annotations

from pathlib import Path

import pytest

from app.services.video_links import (
    LinkIngestDisabledError,
    RemoteVideo,
    UnsupportedHostError,
    VideoLinkError,
    VideoLinkService,
    VideoTooLongError,
    normalize_link,
)


class DownloaderDeMentira:
    """Cuenta lo que le pidieron: sirve para probar que algo NO se descargó."""

    def __init__(self, *, duration: int = 120) -> None:
        self.duration = duration
        self.probed: list[str] = []
        self.downloaded: list[str] = []

    def probe_duration(self, url: str) -> int:
        self.probed.append(url)
        return self.duration

    def download(self, url: str, destination: Path) -> RemoteVideo:
        self.downloaded.append(url)
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

    assert descargador.probed == []
    assert descargador.downloaded == []


def test_un_video_demasiado_largo_se_rechaza_antes_de_bajarlo():
    """La duración se consulta sin descargar: el tope se aplica antes del gasto."""
    descargador = DownloaderDeMentira(duration=3600)
    servicio = VideoLinkService(
        enabled=True,
        max_duration_seconds=1800,
        downloader=descargador,
    )

    with pytest.raises(VideoTooLongError) as error:
        servicio.fetch("https://youtu.be/E6ikYBkI2QE")

    assert "60 minutos" in str(error.value)
    assert descargador.probed  # sí preguntó
    assert descargador.downloaded == []  # y no bajó nada


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
