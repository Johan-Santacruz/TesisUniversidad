from __future__ import annotations

from io import BytesIO
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace

import pytest

from PIL import Image

from app.services.media import MediaValidator
from app.services.memory_video import MemoryVideoRenderer


def test_renderer_appends_a_silent_seven_second_closing(media_fixture_factory):
    """Breaks if the renderer omits the closing or does not normalize audio."""
    original = media_fixture_factory(duration_seconds=0.4)
    image = Image.new("RGB", (1536, 864), "#304860")
    image_output = BytesIO()
    image.save(image_output, format="PNG")
    video = SimpleNamespace(media_type="video/mp4")
    renderer = MemoryVideoRenderer(
        video_service=SimpleNamespace(iter_plain_chunks=lambda _: iter([original])),
        media_validator=MediaValidator(),
        max_video_bytes=20 * 1024 * 1024,
    )
    rendered = BytesIO()

    metadata = renderer.render(video, image_output.getvalue(), rendered)

    assert 7_300 <= metadata.duration_ms <= 7_700
    assert metadata.media_type == "video/mp4"
    assert metadata.audio_stream_count == 1
    decoded = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-map",
            "0:v:0",
            "-map",
            "0:a:0",
            "-f",
            "null",
            "-",
        ],
        input=rendered.getvalue(),
        capture_output=True,
        check=False,
    )
    assert decoded.returncode == 0, decoded.stderr.decode()

    with tempfile.NamedTemporaryFile(suffix=".mp4") as rendered_file:
        rendered_file.write(rendered.getvalue())
        rendered_file.flush()
        pcm = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-sseof",
                "-7",
                "-i",
                rendered_file.name,
                "-map",
                "0:a:0",
                "-f",
                "s16le",
                "-",
            ],
            capture_output=True,
            check=False,
        )
    assert pcm.returncode == 0, pcm.stderr.decode()
    assert pcm.stdout
    assert max(abs(int.from_bytes(pcm.stdout[index:index + 2], "little", signed=True))
               for index in range(0, len(pcm.stdout) - 1, 2)) <= 32


def test_renderer_keeps_the_original_testimony_audible(media_fixture_factory):
    """Breaks if the closing silences or replaces the original audio track."""
    original = media_fixture_factory(duration_seconds=1.0)
    image = BytesIO()
    Image.new("RGB", (1536, 864), "#304860").save(image, format="PNG")
    renderer = MemoryVideoRenderer(
        video_service=SimpleNamespace(iter_plain_chunks=lambda _: iter([original])),
        media_validator=MediaValidator(),
        max_video_bytes=20 * 1024 * 1024,
    )
    rendered = BytesIO()

    renderer.render(SimpleNamespace(media_type="video/mp4"), image.getvalue(), rendered)

    with tempfile.NamedTemporaryFile(suffix=".mp4") as rendered_file:
        rendered_file.write(rendered.getvalue())
        rendered_file.flush()
        testimony = subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-t",
                "1.0",
                "-i",
                rendered_file.name,
                "-map",
                "0:a:0",
                "-f",
                "s16le",
                "-",
            ],
            capture_output=True,
            check=False,
        )
    assert testimony.returncode == 0, testimony.stderr.decode()
    # El tono de 440 Hz del testimonio sigue ahí: el cierre añade silencio al
    # final, no lo impone sobre el audio original.
    assert max(
        abs(int.from_bytes(testimony.stdout[index:index + 2], "little", signed=True))
        for index in range(0, len(testimony.stdout) - 1, 2)
    ) > 1_000


def test_renderer_pads_a_square_original_without_stretching(media_fixture_factory):
    """Breaks if original testimony is stretched instead of letterboxed."""
    original = media_fixture_factory(duration_seconds=0.4, color="blue")
    image = BytesIO()
    Image.new("RGB", (1536, 864), "#304860").save(image, format="PNG")
    renderer = MemoryVideoRenderer(
        video_service=SimpleNamespace(iter_plain_chunks=lambda _: iter([original])),
        media_validator=MediaValidator(),
        max_video_bytes=20 * 1024 * 1024,
    )
    rendered = BytesIO()

    renderer.render(SimpleNamespace(media_type="video/mp4"), image.getvalue(), rendered)
    frame = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "0.1",
            "-i", "pipe:0", "-frames:v", "1", "-vf", "scale=8:8",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        input=rendered.getvalue(),
        capture_output=True,
        check=False,
    )
    assert frame.returncode == 0, frame.stderr.decode()
    assert len(frame.stdout) == 8 * 8 * 3
    top_left = frame.stdout[:3]
    center = frame.stdout[((4 * 8 + 4) * 3):((4 * 8 + 4) * 3 + 3)]
    assert max(top_left) < 60
    assert center[2] > 80


def test_renderer_rejects_a_non_png_image_even_when_pillow_can_decode_it(
    media_fixture_factory,
):
    """Breaks if a JPEG can cross the PNG-only renderer boundary."""
    original = media_fixture_factory(duration_seconds=0.4)
    jpeg = BytesIO()
    Image.new("RGB", (1536, 864), "#304860").save(jpeg, format="JPEG")
    renderer = MemoryVideoRenderer(
        video_service=SimpleNamespace(iter_plain_chunks=lambda _: iter([original])),
        media_validator=MediaValidator(),
        max_video_bytes=20 * 1024 * 1024,
    )

    with pytest.raises(ValueError, match="valid PNG"):
        renderer.render(SimpleNamespace(media_type="video/mp4"), jpeg.getvalue(), BytesIO())


def test_renderer_removes_plaintext_files_after_a_render_failure(media_fixture_factory):
    """Breaks if a failed FFmpeg input leaves decrypted media behind."""
    original = media_fixture_factory(duration_seconds=0.4)
    observed: list[Path] = []
    renderer = MemoryVideoRenderer(
        video_service=SimpleNamespace(iter_plain_chunks=lambda _: iter([original])),
        media_validator=MediaValidator(),
        max_video_bytes=20 * 1024 * 1024,
        on_temporary_directory=observed.append,
    )

    with pytest.raises(ValueError):
        renderer.render(SimpleNamespace(media_type="video/mp4"), b"not a png", BytesIO())

    assert len(observed) == 1
    assert not observed[0].exists()
