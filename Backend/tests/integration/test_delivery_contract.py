from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, inspect, text
from typer.testing import CliRunner

from app.database import Database
from app.models import Base


def _columns(
    inspector,
    table_name: str,
) -> set[tuple[str, str, bool, int]]:
    return {
        (
            column["name"],
            str(column["type"]).upper(),
            bool(column["nullable"]),
            int(column["primary_key"]),
        )
        for column in inspector.get_columns(table_name)
    }


def _unique_constraints(inspector, table_name: str) -> set[tuple[str, ...]]:
    constraints = {
        tuple(constraint["column_names"])
        for constraint in inspector.get_unique_constraints(table_name)
    }
    unique_indexes = {
        tuple(index["column_names"])
        for index in inspector.get_indexes(table_name)
        if index["unique"] and index["column_names"]
    }
    return constraints | unique_indexes


def _indexes(inspector, table_name: str) -> set[tuple[bool, tuple[str, ...]]]:
    unique_columns = _unique_constraints(inspector, table_name)
    return {
        (
            tuple(index["column_names"]) in unique_columns,
            tuple(index["column_names"]),
        )
        for index in inspector.get_indexes(table_name)
        if index["column_names"]
    }


def _foreign_keys(
    inspector,
    table_name: str,
) -> set[tuple[tuple[str, ...], str, tuple[str, ...], str | None]]:
    return {
        (
            tuple(foreign_key["constrained_columns"]),
            foreign_key["referred_table"],
            tuple(foreign_key["referred_columns"]),
            foreign_key["options"].get("ondelete"),
        )
        for foreign_key in inspector.get_foreign_keys(table_name)
    }


def test_alembic_head_matches_sqlalchemy_metadata(tmp_path: Path):
    database_path = tmp_path / "migrated.db"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.attributes["database_url"] = f"sqlite:///{database_path}"

    command.upgrade(config, "head")

    database = Database(f"sqlite:///{database_path}")
    actual = inspect(database.engine)
    expected_engine = create_engine("sqlite://")
    Base.metadata.create_all(expected_engine)
    expected = inspect(expected_engine)

    expected_tables = set(Base.metadata.tables)
    assert expected_tables.issubset(actual.get_table_names())
    for table_name in expected_tables:
        assert _columns(actual, table_name) == _columns(
            expected, table_name
        )
        assert _unique_constraints(actual, table_name) == _unique_constraints(
            expected, table_name
        )
        assert _indexes(actual, table_name) == _indexes(expected, table_name)
        assert _foreign_keys(actual, table_name) == _foreign_keys(
            expected, table_name
        )

    expected_engine.dispose()
    database.dispose()


def test_pipeline_migration_aborts_when_a_video_has_duplicate_analyses(
    tmp_path: Path,
):
    database_path = tmp_path / "duplicate-analyses.db"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.attributes["database_url"] = f"sqlite:///{database_path}"
    command.upgrade(config, "0001_initial")

    engine = create_engine(f"sqlite:///{database_path}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (
                    id, email, password_hash, role, is_active,
                    created_at, updated_at
                ) VALUES (
                    'migration-user', 'migration@siad.local',
                    '$argon2id$placeholder', 'operador', 1,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO videos (
                    id, owner_id, filename, media_type, size_bytes, chunk_size,
                    key_version, data_kind, status, is_demo,
                    created_at, updated_at
                ) VALUES (
                    'migration-video', 'migration-user', 'migration.mp4',
                    'video/mp4', 1, 1, 1, 'demo', 'uploaded', 1,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            )
        )
        for analysis_id in ("migration-analysis-1", "migration-analysis-2"):
            connection.execute(
                text(
                    """
                    INSERT INTO analyses (
                        id, video_id, requested_by_id, status,
                        created_at, updated_at
                    ) VALUES (
                        :analysis_id, 'migration-video', 'migration-user',
                        'queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    """
                ),
                {"analysis_id": analysis_id},
            )

    with pytest.raises(
        RuntimeError,
        match="duplicate analyses exist for one or more videos",
    ):
        command.upgrade(config, "head")
    engine.dispose()


def test_pipeline_migration_preserves_events_and_backfills_next_sequence(
    tmp_path: Path,
):
    database_path = tmp_path / "existing-analysis.db"
    config = Config(str(Path(__file__).parents[2] / "alembic.ini"))
    config.attributes["database_url"] = f"sqlite:///{database_path}"
    command.upgrade(config, "0001_initial")

    engine = create_engine(f"sqlite:///{database_path}")
    with engine.begin() as connection:
        connection.execute(
            text(
                """
                INSERT INTO users (
                    id, email, password_hash, role, is_active,
                    created_at, updated_at
                ) VALUES (
                    'existing-user', 'existing@siad.local',
                    '$argon2id$placeholder', 'operador', 1,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO videos (
                    id, owner_id, filename, media_type, size_bytes, chunk_size,
                    key_version, data_kind, status, is_demo,
                    created_at, updated_at
                ) VALUES (
                    'existing-video', 'existing-user', 'existing.mp4',
                    'video/mp4', 1, 1, 1, 'demo', 'uploaded', 1,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            )
        )
        connection.execute(
            text(
                """
                INSERT INTO analyses (
                    id, video_id, requested_by_id, status,
                    created_at, updated_at
                ) VALUES (
                    'existing-analysis', 'existing-video', 'existing-user',
                    'running', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            )
        )
        for sequence, state in ((1, "running"), (2, "completed")):
            connection.execute(
                text(
                    """
                    INSERT INTO analysis_events (
                        analysis_id, sequence, stage, state, occurred_at,
                        key_version, nonce, ciphertext
                    ) VALUES (
                        'existing-analysis', :sequence, 'audio', :state,
                        CURRENT_TIMESTAMP, 1, zeroblob(12), X'00'
                    )
                    """
                ),
                {"sequence": sequence, "state": state},
            )

    command.upgrade(config, "head")
    with engine.connect() as connection:
        next_sequence = connection.scalar(
            text(
                """
                SELECT next_event_sequence
                FROM analyses
                WHERE id = 'existing-analysis'
                """
            )
        )
        events = connection.execute(
            text(
                """
                SELECT sequence, generation, attempt
                FROM analysis_events
                WHERE analysis_id = 'existing-analysis'
                ORDER BY sequence
                """
            )
        ).all()

    assert next_sequence == 3
    assert events == [(1, 1, 1), (2, 1, 1)]
    engine.dispose()


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
