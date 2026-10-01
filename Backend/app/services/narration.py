from __future__ import annotations

from collections import OrderedDict
from hashlib import sha256
import threading
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

    def __init__(
        self,
        *,
        adapter: Any | None,
        cache_size: int = 64,
        cache_bytes: int = 32 * 1024 * 1024,
    ) -> None:
        self.adapter = adapter
        self._cache: OrderedDict[str, NarratedAudio] = OrderedDict()
        self._cache_size = cache_size
        # Tope también en bytes: cada audio puede pesar hasta 2 MB, y 64 de ellos
        # eran 128 MB de memoria sólo para no repetir una llamada.
        self._cache_bytes = cache_bytes
        self._cached_bytes = 0
        # Las peticiones llegan en hilos distintos: sin candado, dos que
        # escriben a la vez pueden desordenar la caché.
        self._lock = threading.Lock()

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
        with self._lock:
            cached = self._cache.get(key)
            if cached is not None:
                self._cache.move_to_end(key)
                return cached
        try:
            audio = self.adapter.synthesize(text)
        except NarrationProviderError:
            raise
        with self._lock:
            if key not in self._cache:
                self._cache[key] = audio
                self._cached_bytes += len(audio.data)
            while self._cache and (
                len(self._cache) > self._cache_size
                or self._cached_bytes > self._cache_bytes
            ):
                _, evicted = self._cache.popitem(last=False)
                self._cached_bytes -= len(evicted.data)
        return audio
