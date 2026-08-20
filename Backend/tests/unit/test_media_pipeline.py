from __future__ import annotations

from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import shutil
import stat

import pytest

from app.services.media import (
    EmptyMediaError,
    MediaPipeline,
    MediaTooLargeError,
    MediaToolUnavailableError,
    MediaValidator,
    NoAudioTrackError,
    UnsupportedMediaError,
)


@pytest.mark.parametrize(
    ("fixture_name", "expected_type"),
    [
        ("valid_mp4_bytes", "video/mp4"),
        ("valid_webm_bytes", "video/webm"),
    ],
)
def test_validator_accepts_decodable_mp4_and_webm_and_rewinds(
    request,
    fixture_name,
    expected_type,
):
    source = BytesIO(request.getfixturevalue(fixture_name))

    metadata = MediaValidator().validate(source, 500 * 1024 * 1024)

    assert metadata.media_type == expected_type
    assert metadata.size_bytes > 0
    assert metadata.duration_ms > 0
    assert metadata.audio_stream_count == 1
    assert source.tell() == 0


def test_validator_rewinds_after_rejecting_signature_only_bytes(
    corrupt_ftyp_bytes,
):
    source = BytesIO(corrupt_ftyp_bytes)

    with pytest.raises(UnsupportedMediaError):
        MediaValidator().validate(source, 500 * 1024 * 1024)

    assert source.tell() == 0


def test_validator_rejects_empty_media_as_a_semantic_upload_error():
    source = BytesIO()

    with pytest.raises(EmptyMediaError):
        MediaValidator().validate(source, 500 * 1024 * 1024)

    assert source.tell() == 0


def test_validator_rejects_oversize_before_invoking_media_tools(
    monkeypatch,
):
    monkeypatch.setattr(
        shutil,
        "which",
        lambda _: (_ for _ in ()).throw(AssertionError("tool invoked")),
    )

    with pytest.raises(MediaTooLargeError):
        MediaValidator().validate(BytesIO(b"x" * 1025), 1024)


def test_validator_rejects_video_without_audio(silent_mp4):
    source = BytesIO(silent_mp4)

    with pytest.raises(NoAudioTrackError):
        MediaValidator().validate(source, 500 * 1024 * 1024)

    assert source.tell() == 0


def test_validator_normalizes_missing_ffprobe(monkeypatch, valid_mp4_bytes):
    real_which = shutil.which
    monkeypatch.setattr(
        shutil,
        "which",
        lambda command: None if command == "ffprobe" else real_which(command),
    )

    with pytest.raises(MediaToolUnavailableError):
        MediaValidator().validate(
            BytesIO(valid_mp4_bytes),
            500 * 1024 * 1024,
        )


def test_media_pipeline_never_requests_whole_plain_video(valid_mp4_bytes):
    video = SimpleNamespace(
        id="video-1",
        media_type="video/mp4",
        size_bytes=len(valid_mp4_bytes),
    )
    video_service = SimpleNamespace(
        iter_plain_chunks=lambda _: iter(
            valid_mp4_bytes[index : index + 257]
            for index in range(0, len(valid_mp4_bytes), 257)
        ),
        open_plain_bytes=Mock(side_effect=AssertionError("forbidden")),
        settings=SimpleNamespace(storage_dir=Path("/application-storage")),
    )

    chunks = list(MediaPipeline(video_service).iter_audio_chunks(video))

    assert chunks
    assert all(len(chunk.wav_bytes) < 25 * 1024 * 1024 for chunk in chunks)
    assert chunks[0].index == 0
    assert chunks[0].start_ms == 0
    assert chunks[0].end_ms > 0
    assert chunks[0].wav_bytes.startswith(b"RIFF")
    video_service.open_plain_bytes.assert_not_called()


def test_video_service_iterates_decrypted_chunks_without_joining(
    chunk_cipher,
    settings_factory,
    tmp_path,
    valid_mp4_bytes,
):
    from app.services.videos import VideoService

    settings = settings_factory(storage_dir=tmp_path)
    encrypted_dir = tmp_path / "videos" / "video-1"
    manifest = chunk_cipher.encrypt_bytes(
        "video-1",
        valid_mp4_bytes,
        encrypted_dir,
        chunk_size=1024,
    )
    video = SimpleNamespace(
        id="video-1",
        size_bytes=len(valid_mp4_bytes),
        chunk_size=1024,
        chunks=[
            SimpleNamespace(
                chunk_index=chunk.chunk_index,
                byte_start=chunk.byte_start,
                byte_end=chunk.byte_end,
                key_version=chunk.key_version,
                nonce=chunk.nonce,
                storage_path=str(chunk.path.relative_to(tmp_path)),
                ciphertext_size=chunk.ciphertext_size,
            )
            for chunk in manifest.chunks
        ],
    )
    service = VideoService(
        settings=settings,
        chunk_cipher=chunk_cipher,
        audit=SimpleNamespace(),
    )

    restored = b"".join(service.iter_plain_chunks(video))

    assert restored == valid_mp4_bytes
    assert len(manifest.chunks) > 1


def test_pipeline_seek_fallback_is_private_and_removed(
    media_fixture_factory,
    tmp_path,
):
    mp4_requiring_seek = media_fixture_factory(
        container="mp4",
        faststart=False,
    )
    video = SimpleNamespace(
        id="video-seek",
        media_type="video/mp4",
        size_bytes=len(mp4_requiring_seek),
    )
    storage_dir = tmp_path / "application-storage"
    storage_dir.mkdir()
    observed: list[tuple[Path, int, int]] = []

    def inspect_temporary_file(path: Path) -> None:
        observed.append(
            (
                path,
                stat.S_IMODE(path.parent.stat().st_mode),
                stat.S_IMODE(path.stat().st_mode),
            )
        )

    reads = 0

    def iter_plain_chunks(_):
        nonlocal reads
        reads += 1
        payload = (
            mp4_requiring_seek[:12]
            if reads == 1
            else mp4_requiring_seek
        )
        return iter(
            payload[index : index + 193]
            for index in range(0, len(payload), 193)
        )

    service = SimpleNamespace(
        iter_plain_chunks=iter_plain_chunks,
        settings=SimpleNamespace(storage_dir=storage_dir),
    )
    pipeline = MediaPipeline(service, on_seek_fallback=inspect_temporary_file)

    chunks = list(pipeline.iter_audio_chunks(video))

    assert chunks
    assert len(observed) == 1
    assert reads == 2
    path, directory_mode, file_mode = observed[0]
    assert directory_mode == 0o700
    assert file_mode == 0o600
    assert storage_dir not in path.parents
    assert not path.exists()
    assert not path.parent.exists()
