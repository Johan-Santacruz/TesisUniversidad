from __future__ import annotations

from collections import OrderedDict
from hashlib import sha256
from typing import Any

from app.ai.narration import (
    NarratedAudio,
    NarrationProviderError,
    build_step_narration,
)


class NarrationUnavailableError(RuntimeError):
    """The route cannot be narrated with the configured provider."""


class NarrationService:
    """Speak one stop of an institutional route.

    The text always comes from the persisted step, never from the request: an
    endpoint that narrated arbitrary input would be an open text-to-speech
    proxy against the project's quota.
    """

    def __init__(self, *, adapter: Any | None, cache_size: int = 64) -> None:
        self.adapter = adapter
        self._cache: OrderedDict[str, NarratedAudio] = OrderedDict()
        self._cache_size = cache_size

    @property
    def available(self) -> bool:
        return self.adapter is not None

    def narrate_step(self, step: dict[str, Any]) -> NarratedAudio:
        if self.adapter is None:
            raise NarrationUnavailableError("narration provider is not configured")
        text = build_step_narration(
            title=str(step.get("title") or ""),
            key_point=str(step.get("key_point") or ""),
            instructions=str(step.get("instructions") or ""),
        )
        # Repetir un paso no vuelve a costar: la voz de un texto idéntico ya
        # está resuelta.
        key = sha256(text.encode("utf-8")).hexdigest()
        cached = self._cache.get(key)
        if cached is not None:
            self._cache.move_to_end(key)
            return cached
        try:
            audio = self.adapter.synthesize(text)
        except NarrationProviderError:
            raise
        self._cache[key] = audio
        if len(self._cache) > self._cache_size:
            self._cache.popitem(last=False)
        return audio
