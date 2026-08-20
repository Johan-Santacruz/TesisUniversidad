from __future__ import annotations

import subprocess

import pytest

from app.services.media import MediaPipeline, NoAudioTrackError


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


def test_ffmpeg_extracts_bounded_wav_audio_through_streaming_pipes_only():
    video = _synthetic_video_with_audio()
    service = type(
        "StreamingVideoService",
        (),
        {
            "settings": type("Settings", (), {"storage_dir": "/storage"})(),
            "iter_plain_chunks": lambda self, _: iter(
                video[index : index + 127]
                for index in range(0, len(video), 127)
            ),
        },
    )()

    chunks = list(
        MediaPipeline(service).iter_audio_chunks(
            type(
                "Video",
                (),
                {
                    "id": "video-1",
                    "media_type": "video/mp4",
                    "size_bytes": len(video),
                },
            )()
        )
    )

    assert chunks
    assert chunks[0].wav_bytes.startswith(b"RIFF")
    assert chunks[0].wav_bytes != video
    assert b"ftyp" not in chunks[0].wav_bytes[:64]


def test_video_without_a_readable_audio_track_is_rejected():
    invalid = b"\x00\x00\x00\x18ftyp-invalid-video"
    service = type(
        "StreamingVideoService",
        (),
        {
            "settings": type("Settings", (), {"storage_dir": "/storage"})(),
            "iter_plain_chunks": lambda self, _: iter([invalid]),
        },
    )()

    with pytest.raises(NoAudioTrackError):
        list(
            MediaPipeline(service).iter_audio_chunks(
                type(
                    "Video",
                    (),
                    {
                        "id": "video-1",
                        "media_type": "video/mp4",
                        "size_bytes": len(invalid),
                    },
                )()
            )
        )
