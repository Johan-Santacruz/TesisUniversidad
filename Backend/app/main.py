from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import admin, auth
from app.config import Settings, get_settings
from app.database import Database
from app.models import User
from app.security.crypto import EnvelopeCipher
from app.security.passwords import PasswordService
from app.security.tokens import TokenService
from app.services.audit import AuditService
from app.services.auth import AuthService


def create_app(
    *,
    settings: Settings | None = None,
    database: Database | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app_database = database or Database(app_settings.database_url)
    password_service = (
        PasswordService(time_cost=1, memory_cost_kib=8192)
        if app_settings.siad_env == "test"
        else PasswordService()
    )
    token_service = TokenService(
        secret=app_settings.jwt_key_bytes,
        issuer=app_settings.jwt_issuer,
        access_minutes=app_settings.access_token_minutes,
        refresh_hours=app_settings.refresh_token_hours,
    )
    cipher = EnvelopeCipher(
        keys={app_settings.key_version: app_settings.encryption_key_bytes},
        current_version=app_settings.key_version,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        app_database.create_schema()
        app_settings.storage_dir.mkdir(parents=True, exist_ok=True)
        if app_settings.demo_users_enabled:
            with app_database.session() as session:
                existing = session.scalar(
                    select(User).where(User.email == app_settings.demo_admin_email.lower())
                )
                if existing is None:
                    session.add(
                        User(
                            id=str(uuid4()),
                            email=app_settings.demo_admin_email.lower(),
                            password_hash=password_service.hash(
                                app_settings.demo_admin_password.get_secret_value()
                            ),
                            role="admin",
                        )
                    )
        yield

    application = FastAPI(
        title="SIAD API",
        version="0.2.0",
        lifespan=lifespan,
        docs_url="/docs" if app_settings.siad_env != "production" else None,
        redoc_url=None,
    )
    application.state.settings = app_settings
    application.state.database = app_database
    application.state.passwords = password_service
    application.state.tokens = token_service
    application.state.cipher = cipher
    application.state.auth = AuthService(
        passwords=password_service,
        tokens=token_service,
        refresh_hours=app_settings.refresh_token_hours,
    )
    application.state.audit = AuditService(cipher)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[app_settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(auth.router, prefix=app_settings.api_prefix)
    application.include_router(admin.router, prefix=app_settings.api_prefix)

    @application.get("/health", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application
