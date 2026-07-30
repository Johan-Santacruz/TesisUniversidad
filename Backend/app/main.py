from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import admin, analyses, auth, cases, sources, videos
from app.ai.beto import BetoAdapter
from app.ai.providers import (
    AnthropicAnalysisAdapter,
    OpenAIAnalysisAdapter,
    WhisperAdapter,
)
from app.config import Settings, get_settings
from app.database import Database
from app.models import User
from app.security.crypto import ChunkCipher, EnvelopeCipher
from app.security.passwords import PasswordService
from app.security.tokens import TokenService
from app.services.audit import AuditService
from app.services.analysis import AnalysisService
from app.services.auth import AuthService
from app.services.cases import CaseService
from app.services.rag import RagCatalog, seed_official_sources
from app.services.readiness import AnalysisReadinessService
from app.services.retention import RetentionService
from app.services.videos import VideoService


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
        seed_official_sources(app_database)
        application.state.rag = RagCatalog(app_database)
        application.state.cases = CaseService(
            cipher=cipher,
            audit=application.state.audit,
            rag=application.state.rag,
            storage_dir=app_settings.storage_dir,
            retention_days=app_settings.video_retention_days,
        )
        openai_client = None
        anthropic_client = None
        if app_settings.openai_configured:
            from openai import OpenAI

            openai_client = OpenAI(
                api_key=app_settings.openai_api_key.get_secret_value()
            )
        if app_settings.anthropic_configured:
            from anthropic import Anthropic

            anthropic_client = Anthropic(
                api_key=app_settings.anthropic_api_key.get_secret_value()
            )
        application.state.analysis = AnalysisService(
            database=app_database,
            cipher=cipher,
            rag=application.state.rag,
            beto=BetoAdapter.load(app_settings.beto_artifact_dir),
            video_service=application.state.videos,
            whisper=(
                WhisperAdapter(
                    client=openai_client,
                    model=app_settings.whisper_model,
                )
                if openai_client is not None
                else None
            ),
            gpt=(
                OpenAIAnalysisAdapter(
                    client=openai_client,
                    model=app_settings.openai_analysis_model,
                )
                if openai_client is not None
                else None
            ),
            claude=(
                AnthropicAnalysisAdapter(
                    client=anthropic_client,
                    model=app_settings.anthropic_analysis_model,
                )
                if anthropic_client is not None
                else None
            ),
            retry_attempts=app_settings.analysis_retry_attempts,
        )
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
    application.state.retention = RetentionService(
        application.state.audit,
        app_settings.storage_dir,
    )
    application.state.readiness = AnalysisReadinessService(
        settings=app_settings,
        beto_available=lambda: bool(
            getattr(getattr(application.state, "analysis", None), "beto", None)
            and application.state.analysis.beto.classifier is not None
        ),
    )
    application.state.videos = VideoService(
        settings=app_settings,
        chunk_cipher=ChunkCipher(
            keys={app_settings.key_version: app_settings.encryption_key_bytes},
            current_version=app_settings.key_version,
        ),
        envelope_cipher=cipher,
        audit=application.state.audit,
        readiness=application.state.readiness,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=[app_settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(auth.router, prefix=app_settings.api_prefix)
    application.include_router(admin.router, prefix=app_settings.api_prefix)
    application.include_router(videos.router, prefix=app_settings.api_prefix)
    application.include_router(analyses.router, prefix=app_settings.api_prefix)
    application.include_router(cases.router, prefix=app_settings.api_prefix)
    application.include_router(sources.router, prefix=app_settings.api_prefix)

    @application.get("/health", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application
