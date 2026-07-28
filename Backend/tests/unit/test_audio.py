from __future__ import annotations

import subprocess

import pytest

from app.services.analysis import NoAudioError, extract_audio_in_memory


def _synthetic_video_with_audio() -> bytes:
    process = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=64x64:d=0.25",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=0.25",
            "-shortest",
            "-c:v",
            "mpeg4",
            "-c:a",
            "aac",
            "-movflags",
            "frag_keyframe+empty_moov",
            "-f",
            "mp4",
            "pipe:1",
        ],
        capture_output=True,
        check=True,
    )
    return process.stdout


def test_ffmpeg_extracts_audio_through_memory_pipes_only():
    video = _synthetic_video_with_audio()

    audio = extract_audio_in_memory(video)

    assert len(audio) > 100
    assert audio != video
    assert b"ftyp" not in audio[:64]


def test_video_without_a_readable_audio_track_is_rejected():
    with pytest.raises(NoAudioError):
        extract_audio_in_memory(b"\x00\x00\x00\x18ftyp-invalid-video")
