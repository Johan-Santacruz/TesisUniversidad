from __future__ import annotations

import pytest

from app.ai.narration import (
    ElevenLabsNarrationAdapter,
    NarrationProviderError,
    build_step_narration,
)
from app.services.narration import NarrationService, NarrationUnavailableError


MP3 = b"ID3\x03\x00\x00\x00" + b"\x00" * 64


class _Client:
    def __init__(self, payload=MP3, calls=None):
        self.payload = payload
        self.calls = calls if calls is not None else []
        self.text_to_speech = self

    def convert(self, **kwargs):
        self.calls.append(kwargs)
        if isinstance(self.payload, Exception):
            raise self.payload
        return self.payload


def _adapter(payload=MP3, calls=None, max_bytes=1024 * 1024):
    return ElevenLabsNarrationAdapter(
        client=_Client(payload, calls),
        voice_id="voz-institucional",
        model="eleven_multilingual_v2",
        max_bytes=max_bytes,
    )


def test_narration_speaks_the_step_in_the_order_the_screen_shows_it():
    """Breaks if the voice reorders action, key point and detail."""
    text = build_step_narration(
        title="Rinda una declaración",
        key_point="Cuente los hechos ante el Ministerio Público",
        instructions="Puede hacerlo en la Personería de su municipio.",
    )

    assert text == (
        "Rinda una declaración. "
        "Cuente los hechos ante el Ministerio Público. "
        "Puede hacerlo en la Personería de su municipio."
    )


def test_narration_refuses_a_step_with_no_text():
    """Breaks if an empty step becomes a paid request for silence."""
    with pytest.raises(ValueError):
        build_step_narration(title="  ", key_point="", instructions="")


def test_adapter_accepts_mp3_and_sends_the_configured_voice():
    calls: list[dict] = []

    audio = _adapter(calls=calls).synthesize("Rinda una declaración.")

    assert audio.mime_type == "audio/mpeg"
    assert calls[0]["voice_id"] == "voz-institucional"
    assert calls[0]["model_id"] == "eleven_multilingual_v2"


@pytest.mark.parametrize(
    "payload, max_bytes",
    [
        (b"", 1024),
        (b"no-es-mp3-en-absoluto", 1024),
        (MP3, 8),
        (RuntimeError("sin red"), 1024),
    ],
)
def test_adapter_converts_every_bad_outcome_into_a_provider_error(payload, max_bytes):
    """Breaks if invalid audio reaches the case screen as if it were speech."""
    with pytest.raises(NarrationProviderError):
        _adapter(payload=payload, max_bytes=max_bytes).synthesize("Un paso.")


def test_repeating_a_step_does_not_pay_the_provider_twice():
    """Breaks if replaying a stop bills another synthesis."""
    calls: list[dict] = []
    service = NarrationService(adapter=_adapter(calls=calls))
    step = {
        "title": "Rinda una declaración",
        "key_point": "Cuente los hechos",
        "instructions": "En la Personería.",
    }

    first = service.narrate_step(step)
    second = service.narrate_step(step)

    assert first is second
    assert len(calls) == 1


def test_service_without_a_provider_says_so_instead_of_failing_late():
    service = NarrationService(adapter=None)

    assert service.available is False
    with pytest.raises(NarrationUnavailableError):
        service.narrate_step({"title": "Rinda una declaración"})


class _ApiError(Exception):
    def __init__(self, message: str):
        super().__init__("ApiError")
        self.body = {"detail": {"type": "authentication_error", "message": message}}


def test_provider_reason_travels_with_the_error():
    """Breaks if a clear provider explanation is replaced by a generic failure."""
    adapter = _adapter(payload=_ApiError("API keys start with 'sk_'"))

    with pytest.raises(NarrationProviderError) as caught:
        adapter.synthesize("Un paso.")

    assert "sk_" in str(caught.value)


def test_a_provider_failure_never_carries_the_credentials():
    """Breaks if the key reaches a log line through the error message."""
    adapter = ElevenLabsNarrationAdapter(
        client=_Client(RuntimeError("boom")),
        voice_id="voz",
        model="modelo",
        max_bytes=1024,
    )

    with pytest.raises(NarrationProviderError) as caught:
        adapter.synthesize("Un paso.")

    assert "voz" not in str(caught.value)
