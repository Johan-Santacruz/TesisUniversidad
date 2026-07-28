from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserRole(StrEnum):
    OPERATOR = "operador"
    VALIDATOR = "validador"
    ADMIN = "admin"


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    role: UserRole
    is_active: bool


class UserList(BaseModel):
    items: list[UserRead]


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=256)
    role: UserRole

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized.count("@") != 1:
            raise ValueError("email must contain one @")
        local, domain = normalized.split("@", 1)
        if not local or not domain:
            raise ValueError("email must contain local and domain parts")
        return normalized


class UserUpdate(BaseModel):
    password: str | None = Field(default=None, min_length=12, max_length=256)
    role: UserRole | None = None
    is_active: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class Message(BaseModel):
    message: str


class DataKind(StrEnum):
    FICTITIOUS = "fictitious"
    REAL = "real"


class VideoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    media_type: str
    size_bytes: int
    data_kind: DataKind
    status: str
    is_demo: bool
    created_at: datetime
