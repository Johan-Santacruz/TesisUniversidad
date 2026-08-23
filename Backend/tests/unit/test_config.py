from __future__ import annotations

import base64

import pytest
from pydantic import ValidationError


def test_blank_provider_keys_are_not_configured(settings_factory):
    settings = settings_factory(openai_api_key="", anthropic_api_key=" ")

    assert settings.openai_configured is False
    assert settings.anthropic_configured is False


def test_blank_provider_keys_do_not_construct_clients(settings_factory, monkeypatch):
    from fastapi.testclient import TestClient

    from app.database import Database
    from app.main import create_app

    constructed: list[str] = []

    def record_openai_construction(**_: object) -> object:
        constructed.append("openai")
        return object()

    def record_anthropic_construction(**_: object) -> object:
        constructed.append("anthropic")
        return object()

    monkeypatch.setattr("openai.OpenAI", record_openai_construction)
    monkeypatch.setattr("anthropic.Anthropic", record_anthropic_construction)
    settings = settings_factory(openai_api_key="", anthropic_api_key=" ")
    database = Database(settings.database_url)

    with TestClient(create_app(settings=settings, database=database)):
        assert constructed == []

    database.dispose()


def test_memory_image_adapter_receives_the_configured_model(settings_factory, monkeypatch):
    from fastapi.testclient import TestClient

    from app.database import Database
    from app.main import create_app

    class FakeOpenAI:
        def __init__(self, **_: object) -> None:
            self.images = object()

    monkeypatch.setattr("openai.OpenAI", FakeOpenAI)
    settings = settings_factory(
        openai_api_key=base64.urlsafe_b64encode(b"O" * 32).decode(),
        openai_image_model="configured-image-model",
    )
    database = Database(settings.database_url)

    application = create_app(settings=settings, database=database)
    with TestClient(application):
        assert application.state.memory_images.model == "configured-image-model"
        assert application.state.memory_images.adapter.model == "configured-image-model"
    database.dispose()


@pytest.mark.parametrize(
    "field,value",
    [
        ("encryption_master_key", ""),
        ("encryption_master_key", base64.urlsafe_b64encode(b"short").decode()),
        ("jwt_secret_key", "not-base64"),
    ],
)
def test_invalid_startup_keys_are_rejected(settings_factory, field, value):
    with pytest.raises(ValidationError):
        settings_factory(**{field: value})


def test_provider_model_defaults_match_the_approved_contract(settings_factory):
    settings = settings_factory()

    assert settings.openai_analysis_model == "gpt-5.6-terra"
    assert settings.anthropic_analysis_model == "claude-sonnet-5"
    assert settings.whisper_model == "whisper-1"


def test_memory_image_defaults_match_the_approved_contract(settings_factory):
    settings = settings_factory()

    assert settings.openai_image_model == "gpt-image-2"
    assert settings.memory_image_max_bytes == 10 * 1024 * 1024
    assert settings.memory_image_prompt_version == "memory-image-v1"
    assert settings.memory_closing_seconds == 7


@pytest.mark.parametrize(
    "field,value",
    [
        ("memory_image_max_bytes", 1024 * 1024 - 1),
        ("memory_image_max_bytes", 25 * 1024 * 1024 + 1),
        ("memory_closing_seconds", 6),
        ("memory_closing_seconds", 8),
    ],
)
def test_memory_image_settings_reject_values_outside_the_contract(
    settings_factory, field, value
):
    with pytest.raises(ValidationError):
        settings_factory(**{field: value})


def test_app_refuses_to_start_on_a_database_behind_the_migrations(tmp_path):
    """Breaks if a pending migration only surfaces as a runtime SQL error."""
    import pytest
    from sqlalchemy import text

    from app.database import Database
    from app.main import _require_current_schema

    database = Database(f"sqlite:///{tmp_path / 'stale.db'}")
    database.create_schema()
    with database.engine.begin() as connection:
        connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
        connection.execute(
            text("INSERT INTO alembic_version VALUES ('0001_initial')")
        )

    with pytest.raises(RuntimeError, match="alembic upgrade head"):
        _require_current_schema(database)
    database.dispose()


def test_a_brand_new_database_starts_without_complaining(tmp_path):
    """Breaks if a first run is mistaken for an out-of-date deployment."""
    from app.database import Database
    from app.main import _require_current_schema

    database = Database(f"sqlite:///{tmp_path / 'fresh.db'}")
    database.create_schema()

    _require_current_schema(database)
    database.dispose()
