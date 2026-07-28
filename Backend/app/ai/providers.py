from __future__ import annotations

from io import BytesIO
import json
import time
from typing import Any, Callable, TypeVar

from app.ai.contracts import (
    ProviderAnalysis,
    TranscriptResult,
    TranscriptSegment,
)


T = TypeVar("T")


class ProviderUnavailable(RuntimeError):
    pass


def retry_call(
    operation: Callable[[], T],
    *,
    attempts: int,
    retryable: tuple[type[BaseException], ...],
    delay_seconds: float = 0.05,
) -> T:
    for attempt in range(attempts + 1):
        try:
            return operation()
        except retryable:
            if attempt == attempts:
                raise
            time.sleep(delay_seconds * (attempt + 1))
    raise RuntimeError("retry loop ended unexpectedly")


class WhisperAdapter:
    def __init__(self, *, client: Any, model: str) -> None:
        self.client = client
        self.model = model

    def transcribe(self, video: bytes, *, filename: str) -> TranscriptResult:
        file_payload = (filename, BytesIO(video), "application/octet-stream")
        response = self.client.audio.transcriptions.create(
            file=file_payload,
            model=self.model,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
            language="es",
        )
        segments = [
            TranscriptSegment(
                id=f"segment-{index + 1}",
                start_ms=round(float(segment.start) * 1000),
                end_ms=round(float(segment.end) * 1000),
                text=str(segment.text).strip(),
            )
            for index, segment in enumerate(response.segments or [])
        ]
        return TranscriptResult(text=str(response.text).strip(), segments=segments)


def _analysis_input(segments: list[TranscriptSegment]) -> str:
    return json.dumps(
        {"segments": [segment.model_dump(mode="json") for segment in segments]},
        ensure_ascii=False,
        separators=(",", ":"),
    )


ANALYSIS_INSTRUCTIONS = (
    "Analiza exclusivamente los segmentos suministrados. Devuelve valores "
    "canónicos y evidencia que apunte a identificadores de segmento existentes. "
    "No completes datos ausentes. Las rutas deben usar únicamente source_entry_id "
    "proporcionados por el catálogo oficial."
)


class OpenAIAnalysisAdapter:
    def __init__(self, *, client: Any, model: str) -> None:
        self.client = client
        self.model = model

    def analyze(self, segments: list[TranscriptSegment]) -> ProviderAnalysis:
        response = self.client.responses.parse(
            model=self.model,
            instructions=ANALYSIS_INSTRUCTIONS,
            input=_analysis_input(segments),
            text_format=ProviderAnalysis,
            store=False,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise ProviderUnavailable("OpenAI did not return structured output")
        if parsed.provider != "gpt":
            parsed = parsed.model_copy(update={"provider": "gpt"})
        return parsed


class AnthropicAnalysisAdapter:
    def __init__(self, *, client: Any, model: str) -> None:
        self.client = client
        self.model = model

    def analyze(self, segments: list[TranscriptSegment]) -> ProviderAnalysis:
        response = self.client.messages.parse(
            model=self.model,
            max_tokens=6000,
            system=ANALYSIS_INSTRUCTIONS,
            messages=[{"role": "user", "content": _analysis_input(segments)}],
            output_format=ProviderAnalysis,
        )
        parsed = response.parsed_output
        if parsed is None:
            raise ProviderUnavailable("Anthropic did not return structured output")
        if parsed.provider != "claude":
            parsed = parsed.model_copy(update={"provider": "claude"})
        return parsed
