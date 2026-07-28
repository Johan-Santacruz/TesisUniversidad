from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect
from typer.testing import CliRunner

from app.database import Database
from app.models import Base


def test_initial_alembic_migration_matches_sqlalchemy_metadata(tmp_path: Path):
    database_path = tmp_path / "migrated.db"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.attributes["database_url"] = f"sqlite:///{database_path}"

    command.upgrade(config, "head")

    database = Database(f"sqlite:///{database_path}")
    actual_tables = set(inspect(database.engine).get_table_names())
    assert set(Base.metadata.tables).issubset(actual_tables)
    database.dispose()


def test_openapi_export_contains_the_complete_public_contract(client):
    from scripts.export_openapi import build_openapi

    schema = build_openapi(client.app)

    required_paths = {
        "/api/v1/auth/token",
        "/api/v1/auth/refresh",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
        "/api/v1/videos",
        "/api/v1/videos/{video_id}/stream",
        "/api/v1/videos/{video_id}/analyses",
        "/api/v1/analyses/{analysis_id}/events",
        "/api/v1/cases/{case_id}",
        "/api/v1/cases/{case_id}/facts/{fact_id}",
        "/api/v1/cases/{case_id}/approve",
        "/api/v1/sources",
        "/api/v1/users",
    }
    assert required_paths.issubset(schema["paths"])
    assert schema["components"]["schemas"]["RouteType"]["enum"] == [
        "emergency",
        "housing_stabilization",
        "return_relocation",
    ]
    assert schema["components"]["schemas"]["AnalysisStage"]["enum"] == [
        "audio",
        "transcription",
        "people_places",
        "dates_facts",
        "classification",
        "sources",
        "timeline",
        "routes",
    ]


def test_openapi_export_can_write_to_an_explicit_contract_path(
    client,
    tmp_path,
):
    from scripts.export_openapi import write_openapi

    destination = tmp_path / "openapi.json"
    write_openapi(client.app, destination)

    assert destination.read_text(encoding="utf-8").startswith("{\n")


def test_non_interactive_cli_manages_users_and_sources(
    tmp_path: Path,
    settings_factory,
):
    from app.cli import app

    settings = settings_factory(
        database_url=f"sqlite:///{tmp_path / 'cli.db'}",
        storage_dir=tmp_path / "cli-storage",
        demo_users_enabled=False,
    )
    database = Database(settings.database_url)
    database.create_schema()
    database.dispose()
    runner = CliRunner()
    environment = {
        "SIAD_SIAD_ENV": "test",
        "SIAD_DATABASE_URL": settings.database_url,
        "SIAD_STORAGE_DIR": str(settings.storage_dir),
        "SIAD_ENCRYPTION_MASTER_KEY": settings.encryption_master_key.get_secret_value(),
        "SIAD_JWT_SECRET_KEY": settings.jwt_secret_key.get_secret_value(),
        "SIAD_DEMO_USERS_ENABLED": "false",
    }

    created = runner.invoke(
        app,
        [
            "users",
            "create",
            "--email",
            "cli@siad.local",
            "--password",
            "Clave-CLI-Segura-2026!",
            "--role",
            "operador",
        ],
        env=environment,
    )
    assert created.exit_code == 0, created.output
    assert "cli@siad.local" in runner.invoke(
        app, ["users", "list"], env=environment
    ).output
    assert runner.invoke(
        app, ["sources", "seed"], env=environment
    ).exit_code == 0
    assert "uariv-crav-popayan" in runner.invoke(
        app, ["sources", "list"], env=environment
    ).output
