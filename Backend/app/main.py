from __future__ import annotations

import logging

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.api import admin, analyses, auth, cases, sources, videos
from app.ai.beto import BetoAdapter
from app.ai.memory_images import OpenAIMemoryImageAdapter, OpenAIMemoryPhraseAdapter
from app.ai.narration import ElevenLabsNarrationAdapter
from app.services.media import MediaPipeline
from app.services.transcription import TranscriptionService
from app.ai.providers import (
    AnthropicAnalysisAdapter,
    OpenAIAnalysisAdapter,
    WhisperAdapter,
)
from app.config import Settings, get_settings
from app.database import Database
from app.entities import User
from app.security.crypto import ChunkCipher, EnvelopeCipher
from app.security.passwords import PasswordService
from app.security.tokens import TokenService
from app.services.audit import AuditService
from app.services.analysis import AnalysisService
from app.services.assets import EncryptedAssetStore
from app.services.auth import AuthService
from app.services.cases import CaseService
from app.services.rag import RagCatalog, seed_official_sources
from app.services.readiness import AnalysisReadinessService
from app.services.retention import RetentionService
from app.services.media import MediaValidator
from app.services.memory_images import MemoryImageService
from app.services.narration import NarrationService
from app.services.memory_video import MemoryVideoRenderer
from app.services.purges import PurgeService
from app.services.videos import VideoService
from app.services.video_links import VideoLinkService, YtDlpDownloader


logger = logging.getLogger(__name__)


def _require_current_schema(database: Database) -> None:
    """Refuse to start on a database that is behind the migration head."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    from sqlalchemy import inspect, text

    root = Path(__file__).resolve().parents[1]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    head = ScriptDirectory.from_config(config).get_current_head()
    if head is None:
        return
    with database.engine.connect() as connection:
        if "alembic_version" not in inspect(connection).get_table_names():
            # Base nueva: `create_schema()` la levanta completa y `alembic
            # stamp head` la deja registrada. No hay nada desactualizado.
            return
        current = connection.scalar(text("SELECT version_num FROM alembic_version"))
    if current != head:
        raise RuntimeError(
            "La base de datos está en la migración "
            f"{current!r} y el código espera {head!r}. "
            "Ejecute: cd Backend && .venv/bin/alembic upgrade head"
        )


def create_app(
    *,
    settings: Settings | None = None,
    database: Database | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app_database = database or Database(app_settings.database_url)
    password_service = (
        PasswordService(time_cost=1, memory_cost_kib=8192)
        if app_settings.senda_env == "test"
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
        # `create_schema()` crea las tablas que faltan pero nunca altera las que
        # ya existen: una migracion pendiente dejaba la app arrancando "bien" y
        # fallando despues con un error cripitico en runtime. Fallar aqui, con
        # el comando exacto, cuesta un minuto en vez de una tarde.
        _require_current_schema(app_database)
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
            purges=application.state.purges,
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
        narration_adapter = None
        if app_settings.narration_configured:
            try:
                from elevenlabs.client import ElevenLabs

                narration_adapter = ElevenLabsNarrationAdapter(
                    client=ElevenLabs(
                        api_key=app_settings.elevenlabs_api_key.get_secret_value()
                    ),
                    voice_id=app_settings.elevenlabs_voice_id,
                    model=app_settings.elevenlabs_model,
                    max_bytes=app_settings.narration_max_bytes,
                )
            except ImportError:
                # Degradar en silencio esta bien cuando nadie pidio la voz;
                # aqui la clave y el timbre estan puestos, asi que callar haria
                # creer que la guia funciona. La app levanta igual.
                logger.warning(
                    "narration_provider_unavailable",
                    extra={"reason": "elevenlabs package is not installed"},
                )
                narration_adapter = None
        application.state.narration = NarrationService(adapter=narration_adapter)
        application.state.memory_images = MemoryImageService(
            database=app_database,
            cipher=cipher,
            assets=EncryptedAssetStore(cipher=cipher, storage_dir=app_settings.storage_dir),
            adapter=(
                OpenAIMemoryImageAdapter(
                    client=openai_client,
                    max_bytes=app_settings.memory_image_max_bytes,
                    model=app_settings.openai_image_model,
                )
                if openai_client is not None
                else None
            ),
            # La frase la escribe el modelo de texto, no el de imagen.
            phrase_adapter=(
                OpenAIMemoryPhraseAdapter(
                    client=openai_client,
                    model=app_settings.openai_analysis_model,
                )
                if openai_client is not None
                else None
            ),
            audit=application.state.audit,
            model=app_settings.openai_image_model,
            prompt_version=app_settings.memory_image_prompt_version,
            demo_image_path=Path(__file__).parent / "data" / "demo-memory-image.png",
            video_service=application.state.videos,
            renderer=MemoryVideoRenderer(
                video_service=application.state.videos,
                media_validator=MediaValidator(),
                max_video_bytes=app_settings.max_video_bytes,
            ),
            purges=application.state.purges,
        )
        application.state.analysis = AnalysisService(
            database=app_database,
            cipher=cipher,
            rag=application.state.rag,
            beto=BetoAdapter.load(app_settings.beto_artifact_dir),
            video_service=application.state.videos,
            media=MediaPipeline(application.state.videos),
            transcription=(
                TranscriptionService(
                    WhisperAdapter(
                        client=openai_client,
                        model=app_settings.whisper_model,
                    )
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
            memory_images=application.state.memory_images,
            retry_attempts=app_settings.analysis_retry_attempts,
        )
        if app_settings.demo_users_enabled:
            demo_email = app_settings.demo_admin_email.lower()
            demo_password = app_settings.demo_admin_password.get_secret_value()
            with app_database.session() as session:
                existing = session.scalar(select(User).where(User.email == demo_email))
                if existing is None:
                    session.add(
                        User(
                            id=str(uuid4()),
                            email=demo_email,
                            password_hash=password_service.hash(demo_password),
                            role="admin",
                        )
                    )
                elif not password_service.verify(demo_password, existing.password_hash):
                    # Sembrar solo cuando falta la cuenta dejaba la clave del
                    # .env sin efecto en cuanto se cambiaba: la persona editaba
                    # el archivo, reiniciaba y seguia sin poder entrar, sin
                    # ningun mensaje que explicara por que. Reconciliar la
                    # cuenta la vuelve el reflejo de la configuracion.
                    existing.password_hash = password_service.hash(demo_password)
                    existing.role = "admin"
                    existing.is_active = True
        try:
            application.state.purges.process_pending()
        except Exception:
            # A malformed or temporarily unavailable durable job must not make
            # the API unavailable; it remains retryable for retention/startup.
            pass
        yield

    application = FastAPI(
        title="SENDA API",
        version="0.2.0",
        lifespan=lifespan,
        docs_url="/docs" if app_settings.senda_env != "production" else None,
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
    application.state.purges = PurgeService(
        database=app_database,
        cipher=cipher,
        assets=EncryptedAssetStore(cipher=cipher, storage_dir=app_settings.storage_dir),
        storage_dir=app_settings.storage_dir,
    )
    application.state.retention = RetentionService(
        application.state.audit,
        application.state.purges,
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
        audit=application.state.audit,
        media_validator=MediaValidator(),
        purges=application.state.purges,
    )
    # La descarga por enlace se construye siempre; lo que decide si funciona es
    # el interruptor de configuración, que el propio servicio consulta.
    application.state.video_links = VideoLinkService(
        enabled=app_settings.link_ingest_enabled,
        max_duration_seconds=app_settings.link_ingest_max_seconds,
        downloader=YtDlpDownloader(
            max_bytes=app_settings.max_video_bytes,
            cookie_file=app_settings.link_cookies_file,
            cookies_from_browser=app_settings.link_cookies_from_browser,
        ),
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
