from __future__ import annotations

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
    ) -> None:
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
        return self._hasher.hash(password)

    def verify(self, password: str, encoded: str) -> bool:
        try:
            return self._hasher.verify(encoded, password)
        except (VerificationError, InvalidHashError):
            return False

    def needs_rehash(self, encoded: str) -> bool:
        try:
            return self._hasher.check_needs_rehash(encoded)
        except InvalidHashError:
            return True

