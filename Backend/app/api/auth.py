from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, get_session
from app.config import Settings
from app.schemas import TokenResponse, UserRead
from app.services.auth import AuthenticationError, AuthService, SessionTokens


router = APIRouter(prefix="/auth", tags=["authentication"])
REFRESH_COOKIE = "siad_refresh"


def get_auth_service(request: Request) -> AuthService:
    return request.app.state.auth


def get_settings_from_app(request: Request) -> Settings:
    return request.app.state.settings


def _set_refresh_cookie(
    response: Response,
    tokens: SessionTokens,
    settings: Settings,
) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        tokens.refresh_token,
        max_age=settings.refresh_token_hours * 3600,
        httponly=True,
        secure=settings.siad_env == "production",
        samesite="lax",
        path=f"{settings.api_prefix}/auth",
    )


def _token_response(tokens: SessionTokens, settings: Settings) -> TokenResponse:
    return TokenResponse(
        access_token=tokens.access_token,
        expires_in=settings.access_token_minutes * 60,
        user=UserRead.model_validate(tokens.user),
    )


@router.post("/token", response_model=TokenResponse)
def login(
    response: Response,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings_from_app)],
) -> TokenResponse:
    try:
        tokens = auth.login(session, form.username, form.password)
    except AuthenticationError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _set_refresh_cookie(response, tokens, settings)
    return _token_response(tokens, settings)


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings_from_app)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> TokenResponse:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No hay sesión renovable")
    try:
        tokens = auth.rotate(session, refresh_token)
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Sesión renovable inválida")
    _set_refresh_cookie(response, tokens, settings)
    return _token_response(tokens, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    session: Annotated[Session, Depends(get_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings_from_app)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
) -> None:
    auth.revoke(session, refresh_token)
    response.delete_cookie(
        REFRESH_COOKIE,
        path=f"{settings.api_prefix}/auth",
        httponly=True,
        samesite="lax",
    )


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> User:
    return user
