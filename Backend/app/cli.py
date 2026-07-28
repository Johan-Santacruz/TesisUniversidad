from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import typer
from sqlalchemy import select, update

from app.config import Settings, get_settings
from app.database import Database
from app.models import RefreshSession, SourceEntry, User
from app.schemas import UserRole
from app.security.crypto import EnvelopeCipher
from app.security.passwords import PasswordService
from app.services.audit import AuditService
from app.services.rag import RagCatalog, seed_official_sources
from app.services.retention import RetentionService


app = typer.Typer(help="Administración local y no interactiva de SIAD.")
users_app = typer.Typer(help="Gestionar usuarios.")
sources_app = typer.Typer(help="Gestionar el catálogo RAG.")
retention_app = typer.Typer(help="Ejecutar la política de retención.")
app.add_typer(users_app, name="users")
app.add_typer(sources_app, name="sources")
app.add_typer(retention_app, name="retention")


def _runtime() -> tuple[Settings, Database]:
    settings = get_settings()
    return settings, Database(settings.database_url)


def _passwords(settings: Settings) -> PasswordService:
    if settings.siad_env == "test":
        return PasswordService(time_cost=1, memory_cost_kib=8192)
    return PasswordService()


@users_app.command("create")
def create_user(
    email: str = typer.Option(...),
    password: str = typer.Option(..., hide_input=True),
    role: UserRole = typer.Option(...),
) -> None:
    settings, database = _runtime()
    normalized = email.strip().lower()
    with database.session() as session:
        if session.scalar(select(User).where(User.email == normalized)) is not None:
            raise typer.BadParameter("Ya existe un usuario con ese correo")
        session.add(
            User(
                id=str(uuid4()),
                email=normalized,
                password_hash=_passwords(settings).hash(password),
                role=role.value,
            )
        )
    database.dispose()
    typer.echo(f"Usuario creado: {normalized} ({role.value})")


@users_app.command("list")
def list_users() -> None:
    _, database = _runtime()
    with database.session() as session:
        users = list(session.scalars(select(User).order_by(User.email)))
        for user in users:
            typer.echo(f"{user.email}\t{user.role}\t{'active' if user.is_active else 'disabled'}")
    database.dispose()


@users_app.command("disable")
def disable_user(email: str = typer.Option(...)) -> None:
    settings, database = _runtime()
    with database.session() as session:
        user = session.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            raise typer.BadParameter("Usuario no encontrado")
        user.is_active = False
        session.execute(
            update(RefreshSession)
            .where(
                RefreshSession.user_id == user.id,
                RefreshSession.revoked_at.is_(None),
            )
            .values(revoked_at=datetime.now(timezone.utc))
        )
    database.dispose()
    typer.echo("Usuario deshabilitado")


@users_app.command("password")
def rotate_password(
    email: str = typer.Option(...),
    password: str = typer.Option(..., hide_input=True),
) -> None:
    settings, database = _runtime()
    with database.session() as session:
        user = session.scalar(select(User).where(User.email == email.strip().lower()))
        if user is None:
            raise typer.BadParameter("Usuario no encontrado")
        user.password_hash = _passwords(settings).hash(password)
        for refresh in user.sessions:
            if refresh.revoked_at is None:
                refresh.revoked_at = datetime.now(timezone.utc)
    database.dispose()
    typer.echo("Contraseña rotada y sesiones revocadas")


@sources_app.command("seed")
def seed_sources() -> None:
    _, database = _runtime()
    count = seed_official_sources(database)
    database.dispose()
    typer.echo(f"Fuentes oficiales sembradas: {count}")


@sources_app.command("list")
def list_sources() -> None:
    _, database = _runtime()
    with database.session() as session:
        entries = list(
            session.scalars(select(SourceEntry).order_by(SourceEntry.id))
        )
        for entry in entries:
            typer.echo(f"{entry.id}\t{entry.status}\t{entry.entity}")
    database.dispose()


@retention_app.command("run")
def run_retention() -> None:
    settings, database = _runtime()
    cipher = EnvelopeCipher(
        keys={settings.key_version: settings.encryption_key_bytes},
        current_version=settings.key_version,
    )
    service = RetentionService(AuditService(cipher), settings.storage_dir)
    with database.session() as session:
        deleted = service.delete_due_videos(
            session,
            now=datetime.now(timezone.utc),
        )
    database.dispose()
    typer.echo(f"Videos eliminados: {deleted}")


if __name__ == "__main__":
    app()
