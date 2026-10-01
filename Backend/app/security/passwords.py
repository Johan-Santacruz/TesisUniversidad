from __future__ import annotations

import threading

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from argon2.low_level import Type


class PasswordService:
    def __init__(
        self,
        *,
        time_cost: int = 3,
        memory_cost_kib: int = 65_536,
        parallelism: int = 2,
        max_concurrent: int = 2,
    ) -> None:
        # Cada hash reserva `memory_cost_kib` de RAM —64 MB por omisión—, y el
        # inicio de sesión no pide credenciales para intentarlo. Sin tope, una
        # ráfaga de intentos simultáneos ocupaba un hash por hilo del servidor:
        # cuarenta a la vez son 2.5 GB. Los que sobran esperan su turno.
        self._slots = threading.BoundedSemaphore(max_concurrent)
        self._hasher = PasswordHasher(
            time_cost=time_cost,
            memory_cost=memory_cost_kib,
            parallelism=parallelism,
            hash_len=32,
            salt_len=16,
            type=Type.ID,
        )

    def hash(self, password: str) -> str:
        if len(password) < 12:
            raise ValueError("password must contain at least 12 characters")
        with self._slots:
            return self._hasher.hash(password)

    def verify(self, password: str, encoded: str) -> bool:
        try:
            with self._slots:
                return self._hasher.verify(encoded, password)
        except (VerificationError, InvalidHashError):
            return False

    def needs_rehash(self, encoded: str) -> bool:
        try:
            return self._hasher.check_needs_rehash(encoded)
        except InvalidHashError:
            return True

