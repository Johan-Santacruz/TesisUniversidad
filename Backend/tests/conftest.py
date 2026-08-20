from __future__ import annotations

import base64
from collections.abc import Callable
from pathlib import Path
import shutil
import subprocess

import pytest


def encoded_key(fill: bytes) -> str:
    return base64.urlsafe_b64encode(fill * 32).decode("ascii")


@pytest.fixture(autouse=True)
def _no_ambient_provider_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep an exported provider key out of every test."""
    for name in ("SENDA_OPENAI_API_KEY", "SENDA_ANTHROPIC_API_KEY"):
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def settings_factory(tmp_path: Path) -> Callable[..., object]:
    def factory(**overrides: object) -> object:
        from app.config import Settings

        values: dict[str, object] = {
            "senda_env": "test",
            "database_url": f"sqlite:///{tmp_path / 'senda-test.db'}",
            "storage_dir": tmp_path / "storage",
            "encryption_master_key": encoded_key(b"E"),
            "jwt_secret_key": encoded_key(b"J"),
            "key_version": 1,
            # Sin credenciales, salvo que la prueba las pida explícitamente.
            "openai_api_key": None,
            "anthropic_api_key": None,
            # La suite fija su propio administrador. Heredar el de la
            # configuración la ataba a la cuenta de demostración: cambiar esa
            # cuenta rompía cada prueba de integración que inicia sesión, sin
            # que el cambio tuviera nada que ver con lo que prueban.
            "demo_admin_email": "admin@senda.local",
            "demo_admin_password": "Cambiar-Esta-Clave-2026!",
        }
        values.update(overrides)
        # `_env_file=None` impide que el `.env` de la máquina entre en las
        # pruebas: sin esto, una clave real convierte una prueba del camino
        # "sin proveedor" en una llamada facturada al proveedor.
        return Settings(_env_file=None, **values)

    return factory


@pytest.fixture
def cipher():
    from app.security.crypto import EnvelopeCipher

    return EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)


@pytest.fixture
def token_service():
    from app.security.tokens import TokenService

    return TokenService(secret=b"J" * 32, issuer="senda-test")


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
        "username": "admin@senda.local",
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
            "email": "operador@senda.local",
            "password": "Clave-Operador-2026!",
            "role": "operador",
        },
    )
    assert created.status_code == 201
    admin_client.headers.pop("Authorization")
    login = client.post(
        "/api/v1/auth/token",
        data={
            "username": "operador@senda.local",
            "password": "Clave-Operador-2026!",
        },
    )
    assert login.status_code == 200
    client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    return client


@pytest.fixture
def media_fixture_factory(tmp_path_factory) -> Callable[..., bytes]:
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg is required for media fixture generation")
    fixture_dir = tmp_path_factory.mktemp("media-fixtures")

    def factory(
        *,
        container: str = "mp4",
        audio: bool = True,
        duration_seconds: float = 0.4,
        faststart: bool = True,
        color: str = "black",
    ) -> bytes:
        target = fixture_dir / (
            f"fixture-{container}-{audio}-{duration_seconds}-{faststart}-{color}.{container}"
        )
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c={color}:s=64x64:d={duration_seconds}",
        ]
        if audio:
            command.extend(
                [
                    "-f",
                    "lavfi",
                    "-i",
                    f"sine=frequency=440:duration={duration_seconds}",
                    "-shortest",
                ]
            )
        if container == "mp4":
            command.extend(["-c:v", "mpeg4"])
            if audio:
                command.extend(["-c:a", "aac"])
            if faststart:
                command.extend(["-movflags", "+faststart"])
        elif container == "webm":
            command.extend(["-c:v", "libvpx-vp9", "-deadline", "realtime"])
            if audio:
                command.extend(["-c:a", "libopus"])
        else:
            raise ValueError(container)
        command.append(str(target))
        subprocess.run(command, capture_output=True, check=True)
        return target.read_bytes()

    return factory


@pytest.fixture
def valid_mp4_bytes(media_fixture_factory) -> bytes:
    return media_fixture_factory(container="mp4")


@pytest.fixture
def valid_webm_bytes(media_fixture_factory) -> bytes:
    return media_fixture_factory(container="webm")


@pytest.fixture
def silent_mp4(media_fixture_factory) -> bytes:
    return media_fixture_factory(container="mp4", audio=False)


@pytest.fixture
def tiny_video_bytes(valid_mp4_bytes) -> bytes:
    return valid_mp4_bytes


@pytest.fixture
def corrupt_ftyp_bytes() -> bytes:
    return (
        b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
        + bytes(range(256)) * 8
    )


@pytest.fixture
def chunk_cipher():
    from app.security.crypto import ChunkCipher

    return ChunkCipher(keys={1: b"E" * 32}, current_version=1)
