from __future__ import annotations

from dataclasses import dataclass
from typing import Any


MP3_SIGNATURES = (b"ID3", b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")


def _provider_reason(exc: Exception) -> str:
    """The provider's own explanation, never the credentials used to get it."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        detail = body.get("detail")
        if isinstance(detail, dict) and isinstance(detail.get("message"), str):
            return detail["message"]
        if isinstance(detail, str):
            return detail
    return f"{type(exc).__name__}"


class NarrationProviderError(RuntimeError):
    """The narration provider returned no usable audio."""


@dataclass(frozen=True)
class NarratedAudio:
    data: bytes
    mime_type: str


def build_step_narration(*, title: str, key_point: str, instructions: str) -> str:
    """Compose what the voice says for one stop of the route.

    The order is the one the screen uses: the action first, then the single
    thing that cannot fail, then the detail. Whoever listens instead of reading
    receives the same hierarchy.
    """
    parts = [part.strip() for part in (title, key_point, instructions) if part and part.strip()]
    if not parts:
        raise ValueError("a step with no text cannot be narrated")
    spoken = ". ".join(part.rstrip(".") for part in parts)
    return f"{spoken}."


class ElevenLabsNarrationAdapter:
    def __init__(
        self,
        *,
        client: Any,
        voice_id: str,
        model: str,
        max_bytes: int,
    ) -> None:
        self.client = client
        self.voice_id = voice_id
        self.model = model
        self.max_bytes = max_bytes

    def synthesize(self, text: str) -> NarratedAudio:
        try:
            stream = self.client.text_to_speech.convert(
                voice_id=self.voice_id,
                model_id=self.model,
                text=text,
                output_format="mp3_44100_128",
            )
            data = stream if isinstance(stream, bytes) else b"".join(stream)
        except Exception as exc:
            # El proveedor suele decir exactamente que pasa ("la clave debe
            # empezar por sk_"). Tragarse ese texto obliga a adivinar una
            # configuracion equivocada, asi que viaja en el error.
            raise NarrationProviderError(
                f"narration request failed: {_provider_reason(exc)}"
            ) from exc
        if not data:
            raise NarrationProviderError("narration provider returned no audio")
        if len(data) > self.max_bytes:
            raise NarrationProviderError("narration audio exceeds the size limit")
        if not data.startswith(MP3_SIGNATURES):
            raise NarrationProviderError("narration audio is not MP3")
        return NarratedAudio(data=data, mime_type="audio/mpeg")
