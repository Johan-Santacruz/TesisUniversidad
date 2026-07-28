from __future__ import annotations

import base64
from collections.abc import Callable
from pathlib import Path

import pytest


def encoded_key(fill: bytes) -> str:
    return base64.urlsafe_b64encode(fill * 32).decode("ascii")


@pytest.fixture
def settings_factory(tmp_path: Path) -> Callable[..., object]:
    def factory(**overrides: object) -> object:
        from app.config import Settings

        values: dict[str, object] = {
            "siad_env": "test",
            "database_url": f"sqlite:///{tmp_path / 'siad-test.db'}",
            "storage_dir": tmp_path / "storage",
            "encryption_master_key": encoded_key(b"E"),
            "jwt_secret_key": encoded_key(b"J"),
            "key_version": 1,
            "real_data_enabled": False,
            "openai_zdr_confirmed": False,
            "anthropic_zdr_confirmed": False,
            "institutional_authorization_id": None,
        }
        values.update(overrides)
        return Settings(**values)

    return factory


@pytest.fixture
def cipher():
    from app.security.crypto import EnvelopeCipher

    return EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)


@pytest.fixture
def token_service():
    from app.security.tokens import TokenService

    return TokenService(secret=b"J" * 32, issuer="siad-test")

