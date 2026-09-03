"""Toma un fotograma del testimonio para anclar la imagen conmemorativa.

Sin esto, el cierre se dibuja sólo con la categoría, la subcategoría y la región:
1.500 combinaciones posibles para todo el corpus, así que dos desplazamientos del
mismo departamento reciben una ilustración idéntica. Un fotograma del propio
video le devuelve a la imagen el lugar, la luz y la paleta de ese testimonio y no
de cualquiera.

El fotograma es una referencia, nunca el resultado: el prompt sigue pidiendo
ilustración a mano y mantiene sus prohibiciones. Si aquí no sale nada utilizable,
la generación continúa como antes.
"""
from __future__ import annotations

import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Protocol

from PIL import Image, ImageStat


class ReferenceFrameUnavailable(RuntimeError):
    """No se pudo obtener un fotograma aprovechable del video."""


@dataclass(frozen=True)
class ReferenceFrame:
    data: bytes
    at_seconds: float


class _VideoService(Protocol):
    def iter_plain_chunks(self, video: object) -> Iterator[bytes]: ...


# Un fotograma suelto sale negro más veces de las que uno espera: fundidos de
# entrada, la cámara antes de exponer, un corte. Se prueban varios instantes
# repartidos por la primera mitad y se elige el que más información visual trae.
_SAMPLE_FRACTIONS = (0.08, 0.18, 0.30, 0.42, 0.55)

# Desviación típica del gris por debajo de la cual el cuadro es prácticamente
# plano —negro, blanco o una cortinilla— y no aporta nada como referencia.
_MIN_STDDEV = 12.0

_FRAME_WIDTH = 1024
_MAX_VIDEO_BYTES = 512 * 1024 * 1024


class ReferenceFrameExtractor:
    def __init__(self, *, video_service: _VideoService) -> None:
        self.video_service = video_service

    def extract(self, video: object) -> ReferenceFrame:
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            source = root / "testimonio"
            self._write_source(video, source)
            duration_seconds = _duration(source)
            if duration_seconds <= 0:
                raise ReferenceFrameUnavailable("unknown duration")
            best: tuple[float, bytes, float] | None = None
            for index, fraction in enumerate(_SAMPLE_FRACTIONS):
                at = duration_seconds * fraction
                candidate = root / f"frame-{index}.png"
                if not self._grab(source, at, candidate):
                    continue
                score = _visual_information(candidate)
                if score < _MIN_STDDEV:
                    continue
                if best is None or score > best[0]:
                    best = (score, candidate.read_bytes(), at)
            if best is None:
                raise ReferenceFrameUnavailable("no frame carried enough detail")
            return ReferenceFrame(data=best[1], at_seconds=best[2])

    def _write_source(self, video: object, target: Path) -> None:
        written = 0
        with open(target, "wb") as handle:
            os.chmod(target, 0o600)
            for chunk in self.video_service.iter_plain_chunks(video):
                written += len(chunk)
                if written > _MAX_VIDEO_BYTES:
                    raise ReferenceFrameUnavailable("video exceeds the extraction limit")
                handle.write(chunk)
        if written == 0:
            raise ReferenceFrameUnavailable("video is empty")

    @staticmethod
    def _grab(source: Path, at_seconds: float, target: Path) -> bool:
        command = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            # -ss antes de -i busca por palabra clave: es mucho más rápido y aquí
            # da igual caer unos cuadros antes del instante pedido.
            "-ss", f"{at_seconds:.3f}",
            "-i", str(source),
            "-frames:v", "1",
            "-vf", f"scale={_FRAME_WIDTH}:-2",
            str(target),
        ]
        try:
            completed = subprocess.run(command, capture_output=True, check=False)
        except FileNotFoundError as exc:
            raise ReferenceFrameUnavailable("ffmpeg is unavailable") from exc
        return completed.returncode == 0 and target.exists() and target.stat().st_size > 0


def _duration(source: Path) -> float:
    command = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(source),
    ]
    try:
        completed = subprocess.run(command, capture_output=True, check=False)
    except FileNotFoundError as exc:
        raise ReferenceFrameUnavailable("ffprobe is unavailable") from exc
    if completed.returncode != 0:
        return 0.0
    try:
        return float(completed.stdout.decode("utf-8", "ignore").strip())
    except ValueError:
        return 0.0


def _visual_information(path: Path) -> float:
    """Desviación típica del canal de luminancia.

    Es una medida barata de "cuánto pasa" en el cuadro: un negro tiene casi cero,
    un paisaje con cielo, monte y casa tiene bastante.
    """
    try:
        with Image.open(path) as frame:
            grey = frame.convert("L")
            return float(ImageStat.Stat(grey).stddev[0])
    except (OSError, ValueError, IndexError):
        return 0.0
