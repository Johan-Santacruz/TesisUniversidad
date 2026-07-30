from __future__ import annotations

import base64

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_real_data_stays_blocked_until_every_control_is_present(settings_factory):
    settings = settings_factory(
        real_data_enabled=True,
        openai_zdr_confirmed=True,
        anthropic_zdr_confirmed=False,
        institutional_authorization_id="ACTA-2026-07",
    )

    assert settings.real_data_ready is False


def test_real_data_is_ready_only_with_zdr_and_institutional_authorization(
    settings_factory,
):
    settings = settings_factory(
        real_data_enabled=True,
        openai_zdr_confirmed=True,
        anthropic_zdr_confirmed=True,
        institutional_authorization_id="ACTA-2026-07",
    )

    assert settings.real_data_ready is True


def test_real_controls_reject_blank_keys_and_authorization(settings_factory):
    settings = settings_factory(
        real_data_enabled=True,
        openai_zdr_confirmed=True,
        anthropic_zdr_confirmed=True,
        institutional_authorization_id="   ",
        openai_api_key="",
        anthropic_api_key=" ",
    )

    assert settings.openai_configured is False
    assert settings.anthropic_configured is False
    assert settings.real_data_controls_ready is False


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
