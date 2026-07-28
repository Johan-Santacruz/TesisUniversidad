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

