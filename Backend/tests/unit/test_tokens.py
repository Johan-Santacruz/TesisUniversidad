from __future__ import annotations

from datetime import timedelta

import pytest

from app.security.tokens import InvalidTokenType


def test_access_token_contains_role_and_short_lifetime(token_service):
    encoded = token_service.issue_access("user-1", "operador")
    claims = token_service.verify_access(encoded)

    assert claims.subject == "user-1"
    assert claims.role == "operador"
    assert claims.token_type == "access"
    assert claims.expires_at - claims.issued_at == timedelta(minutes=15)


def test_refresh_token_is_not_accepted_as_access(token_service):
    refresh = token_service.issue_refresh("user-1", "session-1")

    with pytest.raises(InvalidTokenType):
        token_service.verify_access(refresh)


def test_access_token_is_not_accepted_as_refresh(token_service):
    access = token_service.issue_access("user-1", "admin")

    with pytest.raises(InvalidTokenType):
        token_service.verify_refresh(access)


def test_refresh_token_has_eight_hour_lifetime_and_session_id(token_service):
    encoded = token_service.issue_refresh("user-1", "session-1")
    claims = token_service.verify_refresh(encoded)

    assert claims.session_id == "session-1"
    assert claims.expires_at - claims.issued_at == timedelta(hours=8)

