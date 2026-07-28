from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

import jwt
from pydantic import BaseModel


Role = Literal["operador", "validador", "admin"]
TokenType = Literal["access", "refresh"]


class InvalidTokenType(ValueError):
    """Raised when an otherwise valid token is used at the wrong boundary."""


class TokenClaims(BaseModel):
    subject: str
    token_type: TokenType
    issued_at: datetime
    expires_at: datetime
    token_id: str
    role: Role | None = None
    session_id: str | None = None


class TokenService:
    def __init__(
        self,
        *,
        secret: bytes,
        issuer: str,
        access_minutes: int = 15,
        refresh_hours: int = 8,
    ) -> None:
        if len(secret) < 32:
            raise ValueError("JWT secret must contain at least 32 bytes")
        self._secret = secret
        self._issuer = issuer
        self._access_minutes = access_minutes
        self._refresh_hours = refresh_hours

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc).replace(microsecond=0)

    def _encode(
        self,
        *,
        subject: str,
        token_type: TokenType,
        lifetime: timedelta,
        role: Role | None = None,
        session_id: str | None = None,
    ) -> str:
        issued_at = self._now()
        expires_at = issued_at + lifetime
        payload = {
            "sub": subject,
            "typ": token_type,
            "iat": issued_at,
            "exp": expires_at,
            "iss": self._issuer,
            "jti": str(uuid4()),
        }
        if role is not None:
            payload["role"] = role
        if session_id is not None:
            payload["sid"] = session_id
        return jwt.encode(payload, self._secret, algorithm="HS256")

    def issue_access(self, subject: str, role: Role) -> str:
        return self._encode(
            subject=subject,
            token_type="access",
            role=role,
            lifetime=timedelta(minutes=self._access_minutes),
        )

    def issue_refresh(self, subject: str, session_id: str) -> str:
        return self._encode(
            subject=subject,
            token_type="refresh",
            session_id=session_id,
            lifetime=timedelta(hours=self._refresh_hours),
        )

    def _decode(self, encoded: str, expected: TokenType) -> TokenClaims:
        payload = jwt.decode(
            encoded,
            self._secret,
            algorithms=["HS256"],
            issuer=self._issuer,
        )
        token_type = payload.get("typ")
        if token_type != expected:
            raise InvalidTokenType(f"expected {expected}, got {token_type}")
        return TokenClaims(
            subject=payload["sub"],
            token_type=token_type,
            issued_at=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
            expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            token_id=payload["jti"],
            role=payload.get("role"),
            session_id=payload.get("sid"),
        )

    def verify_access(self, encoded: str) -> TokenClaims:
        return self._decode(encoded, "access")

    def verify_refresh(self, encoded: str) -> TokenClaims:
        return self._decode(encoded, "refresh")

