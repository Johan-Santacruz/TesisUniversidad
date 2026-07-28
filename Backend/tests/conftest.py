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


@pytest.fixture
def client(settings_factory):
    from fastapi.testclient import TestClient

    from app.database import Database
    from app.main import create_app

    settings = settings_factory(demo_users_enabled=True)
    database = Database(settings.database_url)
    application = create_app(settings=settings, database=database)
    with TestClient(application) as test_client:
        yield test_client
    database.dispose()


@pytest.fixture
def admin_credentials():
    return {
        "username": "admin@siad.local",
        "password": "Cambiar-Esta-Clave-2026!",
    }


@pytest.fixture
def admin_client(client, admin_credentials):
    response = client.post("/api/v1/auth/token", data=admin_credentials)
    assert response.status_code == 200
    client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return client


@pytest.fixture
def operator_client(admin_client, client):
    created = admin_client.post(
        "/api/v1/users",
        json={
            "email": "operador@siad.local",
            "password": "Clave-Operador-2026!",
            "role": "operador",
        },
    )
    assert created.status_code == 201
    admin_client.headers.pop("Authorization")
    login = client.post(
        "/api/v1/auth/token",
        data={
            "username": "operador@siad.local",
            "password": "Clave-Operador-2026!",
        },
    )
    assert login.status_code == 200
    client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    return client


@pytest.fixture
def tiny_video_bytes() -> bytes:
    # ISO BMFF signature followed by deterministic fictitious bytes.
    return (
        b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
        + bytes(range(256)) * 24
    )


@pytest.fixture
def chunk_cipher():
    from app.security.crypto import ChunkCipher

    return ChunkCipher(keys={1: b"E" * 32}, current_version=1)
