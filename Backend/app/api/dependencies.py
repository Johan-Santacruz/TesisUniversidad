from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import Database
from app.models import User
from app.schemas import UserRole
from app.security.tokens import TokenService


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")


def get_database(request: Request) -> Database:
    return request.app.state.database


def get_session(
    database: Annotated[Database, Depends(get_database)],
) -> Iterator[Session]:
    with database.session() as session:
        yield session


def get_token_service(request: Request) -> TokenService:
    return request.app.state.tokens


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[Session, Depends(get_session)],
    token_service: Annotated[TokenService, Depends(get_token_service)],
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión inválida o vencida",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        claims = token_service.verify_access(token)
    except (jwt.PyJWTError, ValueError, KeyError):
        raise credentials_error
    user = session.get(User, claims.subject)
    if user is None or not user.is_active or user.role != claims.role:
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed: UserRole):
    allowed_values = {role.value for role in allowed}
    allowed_values.add(UserRole.ADMIN.value)

    def dependency(user: CurrentUser) -> User:
        if user.role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El rol no tiene permiso para esta acción",
            )
        return user

    return dependency


require_operator = require_roles(UserRole.OPERATOR)
require_validator = require_roles(UserRole.VALIDATOR)
require_admin = require_roles(UserRole.ADMIN)

OperatorUser = Annotated[User, Depends(require_operator)]
ValidatorUser = Annotated[User, Depends(require_validator)]
AdminUser = Annotated[User, Depends(require_admin)]

