"""El fotograma de referencia que ancla la imagen conmemorativa.

Sin él, el cierre se dibuja sólo con categoría, subcategoría y región: dos
testimonios parecidos reciben la misma ilustración.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from app.services.reference_frames import (
    ReferenceFrameExtractor,
    ReferenceFrameUnavailable,
)


pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="ffmpeg y ffprobe son necesarios para extraer el fotograma",
)


class _Video:
    """Un video cualquiera; el extractor sólo lo pasa al servicio de video."""


class _VideoService:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def iter_plain_chunks(self, video: object):
        yield self.data


_CON_IMAGEN = "testsrc=size=320x180:rate=10"
_EN_NEGRO = "color=c=black:size=320x180:rate=10"


def _make_video(target: Path, *, source: str, seconds: int = 4) -> bytes:
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", source,
            "-t", str(seconds), "-pix_fmt", "yuv420p", str(target),
        ],
        check=True,
        capture_output=True,
    )
    return target.read_bytes()


def test_takes_a_frame_that_carries_detail(tmp_path: Path) -> None:
    data = _make_video(tmp_path / "testcard.mp4", source=_CON_IMAGEN)
    extractor = ReferenceFrameExtractor(video_service=_VideoService(data))

    frame = extractor.extract(_Video())

    assert frame.data.startswith(b"\x89PNG\r\n\x1a\n")
    assert frame.at_seconds > 0


def test_a_video_that_is_all_black_yields_no_reference(tmp_path: Path) -> None:
    """El video de demostración es exactamente esto, y no debe romper nada.

    Un cuadro plano no aporta lugar, luz ni paleta: es preferible dibujar sólo
    con el contexto que anclar la ilustración en la nada.
    """
    data = _make_video(tmp_path / "negro.mp4", source=_EN_NEGRO)
    extractor = ReferenceFrameExtractor(video_service=_VideoService(data))

    with pytest.raises(ReferenceFrameUnavailable):
        extractor.extract(_Video())


def test_an_empty_video_yields_no_reference() -> None:
    extractor = ReferenceFrameExtractor(video_service=_VideoService(b""))

    with pytest.raises(ReferenceFrameUnavailable):
        extractor.extract(_Video())


def test_bytes_that_are_not_a_video_yield_no_reference() -> None:
    extractor = ReferenceFrameExtractor(video_service=_VideoService(b"esto no es un video"))

    with pytest.raises(ReferenceFrameUnavailable):
        extractor.extract(_Video())


def test_the_chosen_frame_is_the_one_with_most_detail(tmp_path: Path) -> None:
    """Se prueban varios instantes porque uno suelto sale negro demasiadas veces.

    Aquí el video empieza en negro y termina con imagen: el extractor tiene que
    encontrar la parte con contenido en vez de rendirse en el primer intento.
    """
    negro = _make_video(tmp_path / "a.mp4", source=_EN_NEGRO, seconds=3)
    carta = _make_video(tmp_path / "b.mp4", source=_CON_IMAGEN, seconds=6)
    lista = tmp_path / "lista.txt"
    lista.write_text(f"file '{tmp_path / 'a.mp4'}'\nfile '{tmp_path / 'b.mp4'}'\n")
    unido = tmp_path / "unido.mp4"
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "concat", "-safe", "0", "-i", str(lista), "-c", "copy", str(unido),
        ],
        check=True,
        capture_output=True,
    )
    assert negro and carta
    extractor = ReferenceFrameExtractor(video_service=_VideoService(unido.read_bytes()))

    frame = extractor.extract(_Video())

    assert frame.data.startswith(b"\x89PNG\r\n\x1a\n")
    assert frame.at_seconds >= 3
