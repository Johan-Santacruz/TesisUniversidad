from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

import jwt
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.entities import RefreshSession, User
from app.security.passwords import PasswordService
from app.security.tokens import TokenClaims, TokenService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _token_hash(token_id: str) -> str:
    return hashlib.sha256(token_id.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class SessionTokens:
    access_token: str
    refresh_token: str
    user: User


class AuthenticationError(ValueError):
    pass


class AuthService:
    def __init__(
        self,
        *,
        passwords: PasswordService,
        tokens: TokenService,
        refresh_hours: int,
    ) -> None:
        self.passwords = passwords
        self.tokens = tokens
        self.refresh_hours = refresh_hours

    def authenticate(self, session: Session, email: str, password: str) -> User:
        normalized = email.strip().lower()
        user = session.scalar(select(User).where(User.email == normalized))
        if (
            user is None
            or not user.is_active
            or not self.passwords.verify(password, user.password_hash)
        ):
            raise AuthenticationError("invalid credentials")
        return user

    def _new_tokens(
        self,
        session: Session,
        user: User,
        *,
        rotated_from_id: str | None = None,
    ) -> SessionTokens:
        session_id = str(uuid4())
        refresh = self.tokens.issue_refresh(user.id, session_id)
        claims = self.tokens.verify_refresh(refresh)
        session.add(
            RefreshSession(
                id=session_id,
                user_id=user.id,
                token_jti_hash=_token_hash(claims.token_id),
                expires_at=claims.expires_at,
                rotated_from_id=rotated_from_id,
            )
        )
        return SessionTokens(
            access_token=self.tokens.issue_access(user.id, user.role),
            refresh_token=refresh,
            user=user,
        )

    def login(self, session: Session, email: str, password: str) -> SessionTokens:
        user = self.authenticate(session, email, password)
        return self._new_tokens(session, user)

    def _active_refresh_session(
        self,
        session: Session,
        encoded: str,
    ) -> tuple[TokenClaims, RefreshSession, User]:
        try:
            claims = self.tokens.verify_refresh(encoded)
        except (jwt.PyJWTError, ValueError, KeyError) as exc:
            raise AuthenticationError("invalid refresh token") from exc
        if not claims.session_id:
            raise AuthenticationError("refresh session is missing")
        stored = session.get(RefreshSession, claims.session_id)
        if (
            stored is None
            or stored.revoked_at is not None
            or _as_utc(stored.expires_at) <= _utc_now()
            or stored.token_jti_hash != _token_hash(claims.token_id)
        ):
            raise AuthenticationError("refresh session is inactive")
        user = session.get(User, claims.subject)
        if user is None or not user.is_active:
            raise AuthenticationError("user is inactive")
        return claims, stored, user

    def rotate(self, session: Session, encoded: str) -> SessionTokens:
        _, stored, user = self._active_refresh_session(session, encoded)
        stored.revoked_at = _utc_now()
        session.flush()
        return self._new_tokens(session, user, rotated_from_id=stored.id)

    def revoke(self, session: Session, encoded: str | None) -> None:
        if not encoded:
            return
        try:
            claims = self.tokens.verify_refresh(encoded)
        except (jwt.PyJWTError, ValueError, KeyError):
            return
        if claims.session_id:
            stored = session.get(RefreshSession, claims.session_id)
            if stored is not None and stored.revoked_at is None:
                stored.revoked_at = _utc_now()

    def revoke_user_sessions(self, session: Session, user_id: str) -> None:
        session.execute(
            update(RefreshSession)
            .where(
                RefreshSession.user_id == user_id,
                RefreshSession.revoked_at.is_(None),
            )
            .values(revoked_at=_utc_now())
        )

