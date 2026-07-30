from __future__ import annotations

import base64
from functools import lru_cache
from pathlib import Path
import unicodedata

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _decode_32_byte_key(value: str | SecretStr) -> bytes:
    raw = value.get_secret_value() if isinstance(value, SecretStr) else value
    try:
        decoded = base64.urlsafe_b64decode(raw.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise ValueError("must be URL-safe base64") from exc
    if len(decoded) != 32:
        raise ValueError("must decode to exactly 32 bytes")
    return decoded


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SIAD_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    siad_env: str = "development"
    api_prefix: str = "/api/v1"
    frontend_origin: str = "http://localhost:5173"
    database_url: str = "sqlite:///./data/siad.db"
    storage_dir: Path = Path("./data/storage")

    encryption_master_key: SecretStr
    jwt_secret_key: SecretStr
    key_version: int = Field(default=1, ge=1)
    jwt_issuer: str = "siad"
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_hours: int = Field(default=8, ge=1, le=24)

    real_data_enabled: bool = False
    openai_zdr_confirmed: bool = False
    anthropic_zdr_confirmed: bool = False
    institutional_authorization_id: str | None = None

    openai_api_key: SecretStr | None = None
    anthropic_api_key: SecretStr | None = None
    openai_analysis_model: str = "gpt-5.6-terra"
    anthropic_analysis_model: str = "claude-sonnet-5"
    whisper_model: str = "whisper-1"
    analysis_retry_attempts: int = Field(default=2, ge=0, le=5)
    beto_artifact_dir: Path = Path("./models/violencia_classifier_artifacts")

    video_chunk_bytes: int = Field(default=1024 * 1024, ge=64 * 1024)
    max_video_bytes: int = Field(default=500 * 1024 * 1024, ge=1024)
    video_retention_days: int = Field(default=7, ge=1, le=365)
    demo_users_enabled: bool = True
    demo_admin_email: str = "admin@siad.local"
    demo_admin_password: SecretStr = SecretStr("Cambiar-Esta-Clave-2026!")

    @field_validator("encryption_master_key", "jwt_secret_key")
    @classmethod
    def validate_encoded_key(cls, value: SecretStr) -> SecretStr:
        _decode_32_byte_key(value)
        return value

    @field_validator("institutional_authorization_id", mode="before")
    @classmethod
    def normalize_institutional_authorization_id(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            return unicodedata.normalize("NFKC", value).strip()
        return value

    @property
    def encryption_key_bytes(self) -> bytes:
        return _decode_32_byte_key(self.encryption_master_key)

    @property
    def jwt_key_bytes(self) -> bytes:
        return _decode_32_byte_key(self.jwt_secret_key)

    @property
    def openai_configured(self) -> bool:
        return _secret_is_configured(self.openai_api_key)

    @property
    def anthropic_configured(self) -> bool:
        return _secret_is_configured(self.anthropic_api_key)

    @property
    def real_data_controls_ready(self) -> bool:
        return all(
            (
                self.real_data_enabled,
                self.openai_zdr_confirmed,
                self.anthropic_zdr_confirmed,
                bool(self.institutional_authorization_id),
            )
        )

    @property
    def real_data_ready(self) -> bool:
        """Backward-compatible name for the non-secret real-data controls."""
        return self.real_data_controls_ready


def _secret_is_configured(value: SecretStr | None) -> bool:
    if value is None:
        return False
    return bool(unicodedata.normalize("NFKC", value.get_secret_value()).strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
