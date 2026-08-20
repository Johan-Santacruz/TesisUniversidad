from __future__ import annotations

from pathlib import Path
from io import BytesIO
import os
import shutil
import subprocess
import tempfile
from typing import BinaryIO, Callable, Protocol

from PIL import Image, ImageDraw, ImageFont

from app.services.media import MediaMetadata, MediaToolUnavailableError, MediaValidator


DISCLOSURE = (
    "Imagen representativa generada a partir del contexto documentado del caso. "
    "No corresponde a un registro de los hechos."
)
_WIDTH = 1536
_HEIGHT = 864


class _VideoService(Protocol):
    def iter_plain_chunks(self, video: object): ...


class MemoryVideoRenderer:
    def __init__(
        self,
        *,
        video_service: _VideoService,
        media_validator: MediaValidator,
        max_video_bytes: int,
        on_temporary_directory: Callable[[Path], None] | None = None,
    ) -> None:
        self.video_service = video_service
        self.media_validator = media_validator
        self.max_video_bytes = max_video_bytes
        self.on_temporary_directory = on_temporary_directory

    def render(
        self, video: object, image_bytes: bytes, target: BinaryIO
    ) -> MediaMetadata:
        with tempfile.TemporaryDirectory(prefix="senda-memory-render-") as value:
            directory = Path(value)
            os.chmod(directory, 0o700)
            if self.on_temporary_directory is not None:
                self.on_temporary_directory(directory)
            original = directory / "original.mp4"
            image = directory / "memory.png"
            overlay = directory / "disclosure.png"
            output = directory / "rendered.mp4"
            try:
                self._write_original(video, original)
                self._validate_image(image_bytes)
                self._write_bytes(image, image_bytes)
                self._make_overlay(overlay)
                self._render(original, image, overlay, output)
                with output.open("rb") as rendered:
                    metadata = self.media_validator.validate(
                        rendered, self.max_video_bytes
                    )
                    rendered.seek(0)
                    shutil.copyfileobj(rendered, target)
                target.seek(0)
                return metadata
            finally:
                for path in (original, image, overlay, output):
                    path.unlink(missing_ok=True)

    def _write_original(self, video: object, target: Path) -> None:
        with target.open("xb") as output:
            for chunk in self.video_service.iter_plain_chunks(video):
                output.write(chunk)
        os.chmod(target, 0o600)

    @staticmethod
    def _write_bytes(target: Path, content: bytes) -> None:
        with target.open("xb") as output:
            output.write(content)
        os.chmod(target, 0o600)

    @staticmethod
    def _validate_image(content: bytes) -> None:
        try:
            with Image.open(BytesIO(content)) as approved:
                if approved.format != "PNG":
                    raise ValueError("memory image must be a valid PNG")
                approved.verify()
            with Image.open(BytesIO(content)) as approved:
                if approved.size != (_WIDTH, _HEIGHT):
                    raise ValueError("memory image must be 1536x864")
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("memory image must be a valid PNG") from exc

    @staticmethod
    def _make_overlay(target: Path) -> None:
        canvas = Image.new("RGBA", (_WIDTH, _HEIGHT), (0, 0, 0, 0))
        draw = ImageDraw.Draw(canvas)
        font = ImageFont.load_default(size=34)
        margin = 96
        words = DISCLOSURE.split()
        lines: list[str] = []
        line = ""
        for word in words:
            candidate = f"{line} {word}".strip()
            if draw.textlength(candidate, font=font) <= _WIDTH - 2 * margin:
                line = candidate
            else:
                lines.append(line)
                line = word
        lines.append(line)
        line_height = 52
        panel_height = len(lines) * line_height + 56
        top = _HEIGHT - margin - panel_height
        draw.rounded_rectangle(
            (margin - 28, top - 28, _WIDTH - margin + 28, _HEIGHT - margin + 28),
            radius=16,
            fill=(0, 0, 0, 175),
        )
        for index, text in enumerate(lines):
            draw.text((margin, top + index * line_height), text, font=font, fill="white")
        canvas.save(target, format="PNG")
        os.chmod(target, 0o600)

    @staticmethod
    def _render(original: Path, image: Path, overlay: Path, output: Path) -> None:
        command = [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(original),
            "-loop", "1", "-t", "7", "-i", str(image),
            "-loop", "1", "-t", "7", "-i", str(overlay),
            "-f", "lavfi", "-t", "7", "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-filter_complex",
            "[0:v]scale=1536:864:force_original_aspect_ratio=decrease,"
            "pad=1536:864:(ow-iw)/2:(oh-ih):color=black,setsar=1[v0];"
            "[1:v]scale=1536:864,setsar=1[closing];"
            "[2:v]scale=1536:864[disclosure];"
            "[closing][disclosure]overlay=0:0,setsar=1[v1];"
            "[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];"
            "[3:a]aresample=48000,aformat=channel_layouts=stereo[a1];"
            "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]",
            "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-preset", "veryfast",
            "-c:a", "aac", "-movflags", "+faststart", str(output),
        ]
        try:
            completed = subprocess.run(command, capture_output=True, check=False)
        except FileNotFoundError as exc:
            raise MediaToolUnavailableError("ffmpeg") from exc
        if completed.returncode != 0:
            raise RuntimeError("memory video render failed")
