from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from app.ai.contracts import TranscriptResult, TranscriptSegment
from app.ai.providers import RawTranscriptChunk
from app.services.media import AudioChunk


class TranscriptionError(ValueError):
    pass


class _Whisper(Protocol):
    def transcribe_chunk(
        self,
        audio: bytes,
        *,
        filename: str,
    ) -> RawTranscriptChunk: ...


class TranscriptionService:
    def __init__(self, whisper: _Whisper) -> None:
        self.whisper = whisper

    def transcribe(
        self,
        *,
        analysis_id: str,
        video_id: str,
        chunks: Iterable[AudioChunk],
    ) -> TranscriptResult:
        saw_chunk = False
        texts: list[str] = []
        segments: list[TranscriptSegment] = []
        for chunk in chunks:
            saw_chunk = True
            raw = self.whisper.transcribe_chunk(
                chunk.wav_bytes,
                filename=f"audio-{chunk.index:04d}.wav",
            )
            text = raw.text.strip()
            if not text:
                raise TranscriptionError("provider returned blank text")
            texts.append(text)
            for local_index, segment in enumerate(raw.segments):
                segment_text = segment.text.strip()
                if (
                    not segment_text
                    or segment.start_ms < 0
                    or segment.end_ms < segment.start_ms
                ):
                    continue
                segments.append(
                    TranscriptSegment(
                        id=(
                            f"segment-{chunk.index:04d}-"
                            f"{local_index:04d}"
                        ),
                        analysis_id=analysis_id,
                        video_id=video_id,
                        order_index=len(segments),
                        start_ms=chunk.start_ms + segment.start_ms,
                        end_ms=chunk.start_ms + segment.end_ms,
                        text=segment_text,
                    )
                )
        if not saw_chunk:
            raise TranscriptionError("transcription requires audio chunks")
        if not segments:
            raise TranscriptionError("provider returned zero valid segments")
        return TranscriptResult(text=" ".join(texts), segments=segments)
