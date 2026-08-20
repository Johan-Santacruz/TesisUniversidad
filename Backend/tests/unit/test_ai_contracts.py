from __future__ import annotations

from types import SimpleNamespace

from pydantic import ValidationError
import pytest

from app.ai.contracts import (
    EvidenceRef,
    Origin,
    ProviderAnalysis,
    ProviderSignal,
)
from app.ai.providers import WhisperAdapter
from app.ai.providers import (
    AnthropicAnalysisAdapter,
    OpenAIAnalysisAdapter,
    retry_call,
)


def test_provider_contract_rejects_untyped_extra_fields():
    with pytest.raises(ValidationError):
        ProviderAnalysis.model_validate(
            {
                "provider": "gpt",
                "signals": [],
                "timeline": [],
                "routes": [],
                "invented_risk_map": {"amenaza": "alto"},
            }
        )


def test_signal_requires_typed_evidence():
    signal = ProviderSignal(
        key="urgency",
        label="Urgency",
        display_value="",
        value="high",
        origin=Origin.INFERRED,
        evidence=[
            EvidenceRef(segment_id="segment-1", start_ms=1000, end_ms=3500)
        ],
    )

    assert signal.model_dump(mode="json") == {
        "key": "urgency",
        "label": "Urgency",
        "display_value": "",
        "value": "high",
        "origin": "inferred",
        "evidence": [
            {"segment_id": "segment-1", "start_ms": 1000, "end_ms": 3500}
        ],
    }


def test_whisper_chunk_requests_verbose_segments_and_preserves_local_timestamps():
    captured: dict[str, object] = {}

    class Transcriptions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                text="Testimonio ficticio.",
                segments=[
                    SimpleNamespace(
                        id=0,
                        start=1.25,
                        end=3.5,
                        text=" Testimonio ficticio. ",
                    )
                ],
            )

    client = SimpleNamespace(
        audio=SimpleNamespace(transcriptions=Transcriptions())
    )
    adapter = WhisperAdapter(client=client, model="whisper-1")

    result = adapter.transcribe_chunk(b"audio-ficticio", filename="chunk-0000.wav")

    assert captured["model"] == "whisper-1"
    assert captured["response_format"] == "verbose_json"
    assert captured["timestamp_granularities"] == ["segment"]
    assert result.segments[0].start_ms == 1250
    assert result.segments[0].end_ms == 3500
    assert result.segments[0].text == "Testimonio ficticio."


def test_provider_name_is_limited_to_the_two_independent_readers():
    with pytest.raises(ValidationError):
        ProviderAnalysis(
            provider="beto",
            signals=[],
            timeline=[],
            routes=[],
        )


def test_openai_uses_strict_parse_with_storage_disabled():
    captured: dict[str, object] = {}
    parsed = ProviderAnalysis(
        provider="gpt",
        signals=[],
        timeline=[],
        routes=[],
    )

    class Responses:
        def parse(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(output_parsed=parsed)

    adapter = OpenAIAnalysisAdapter(
        client=SimpleNamespace(responses=Responses()),
        model="gpt-5.6-terra",
    )

    result = adapter.analyze([])

    assert result == parsed
    assert captured["model"] == "gpt-5.6-terra"
    assert captured["text_format"] is ProviderAnalysis
    assert captured["store"] is False


def test_anthropic_uses_independent_strict_parse_contract():
    captured: dict[str, object] = {}
    parsed = ProviderAnalysis(
        provider="claude",
        signals=[],
        timeline=[],
        routes=[],
    )

    class Messages:
        def parse(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(parsed_output=parsed)

    adapter = AnthropicAnalysisAdapter(
        client=SimpleNamespace(messages=Messages()),
        model="claude-sonnet-5",
    )

    result = adapter.analyze([])

    assert result == parsed
    assert captured["model"] == "claude-sonnet-5"
    assert captured["output_format"] is ProviderAnalysis
    assert captured["max_tokens"] == 6000


def test_retry_call_recovers_from_two_retryable_timeouts():
    calls = 0

    def operation():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise TimeoutError("provider timeout")
        return "structured-result"

    result = retry_call(
        operation,
        attempts=2,
        retryable=(TimeoutError,),
        delay_seconds=0,
    )

    assert result == "structured-result"
    assert calls == 3


def test_retry_call_propagates_after_the_configured_limit():
    calls = 0

    def operation():
        nonlocal calls
        calls += 1
        raise TimeoutError("provider timeout")

    with pytest.raises(TimeoutError):
        retry_call(
            operation,
            attempts=1,
            retryable=(TimeoutError,),
            delay_seconds=0,
        )

    assert calls == 2
