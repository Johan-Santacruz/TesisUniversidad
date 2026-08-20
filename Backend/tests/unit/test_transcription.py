from __future__ import annotations

import pytest

from app.ai.providers import RawTranscriptChunk, RawTranscriptSegment
from app.services.media import AudioChunk
from app.services.transcription import TranscriptionError, TranscriptionService


class FakeWhisper:
    def __init__(self, results):
        self.results = iter(results)

    def transcribe_chunk(self, audio: bytes, *, filename: str):
        assert audio.startswith(b"RIFF")
        assert filename.endswith(".wav")
        return next(self.results)


def _audio_chunk(index: int, start_ms: int, end_ms: int) -> AudioChunk:
    return AudioChunk(
        index=index,
        start_ms=start_ms,
        end_ms=end_ms,
        wav_bytes=b"RIFF-fake-wav",
    )


def test_transcription_offsets_timestamps_and_assigns_canonical_identity():
    whisper = FakeWhisper(
        [
            RawTranscriptChunk(
                text="Primer fragmento.",
                segments=(
                    RawTranscriptSegment(start_ms=100, end_ms=700, text=" Primero. "),
                    RawTranscriptSegment(start_ms=800, end_ms=1200, text=" Segundo. "),
                ),
            ),
            RawTranscriptChunk(
                text="Segundo fragmento.",
                segments=(
                    RawTranscriptSegment(start_ms=50, end_ms=400, text=" Tercero. "),
                ),
            ),
        ]
    )

    result = TranscriptionService(whisper).transcribe(
        analysis_id="analysis-1",
        video_id="video-1",
        chunks=[
            _audio_chunk(0, 0, 2_000),
            _audio_chunk(1, 2_000, 4_000),
        ],
    )

    assert result.text == "Primer fragmento. Segundo fragmento."
    assert [segment.id for segment in result.segments] == [
        "segment-0000-0000",
        "segment-0000-0001",
        "segment-0001-0000",
    ]
    assert [segment.order_index for segment in result.segments] == [0, 1, 2]
    assert [segment.start_ms for segment in result.segments] == [100, 800, 2050]
    assert [segment.end_ms for segment in result.segments] == [700, 1200, 2400]
    assert all(
        segment.analysis_id == "analysis-1"
        and segment.video_id == "video-1"
        for segment in result.segments
    )


def test_transcription_rejects_no_audio_chunks():
    with pytest.raises(TranscriptionError, match="audio chunks"):
        TranscriptionService(FakeWhisper([])).transcribe(
            analysis_id="analysis-1",
            video_id="video-1",
            chunks=[],
        )


def test_transcription_rejects_blank_provider_text():
    whisper = FakeWhisper(
        [
            RawTranscriptChunk(
                text="   ",
                segments=(
                    RawTranscriptSegment(start_ms=0, end_ms=100, text="texto"),
                ),
            )
        ]
    )

    with pytest.raises(TranscriptionError, match="blank"):
        TranscriptionService(whisper).transcribe(
            analysis_id="analysis-1",
            video_id="video-1",
            chunks=[_audio_chunk(0, 0, 100)],
        )


def test_transcription_rejects_zero_valid_segments():
    whisper = FakeWhisper(
        [
            RawTranscriptChunk(
                text="Texto general.",
                segments=(
                    RawTranscriptSegment(start_ms=0, end_ms=100, text=" "),
                ),
            )
        ]
    )

    with pytest.raises(TranscriptionError, match="segments"):
        TranscriptionService(whisper).transcribe(
            analysis_id="analysis-1",
            video_id="video-1",
            chunks=[_audio_chunk(0, 0, 100)],
        )
