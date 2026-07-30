from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from app.ai.contracts import AnalysisStage, ModelInvocationReferences
from app.database import Database
from app.models import Analysis, Base, ModelInvocation, User, Video
from app.services.analysis_state import StageRepository
from app.services.model_trace import ModelInvocationTraceService


def test_model_invocation_metadata_keeps_sensitive_references_encrypted():
    table = Base.metadata.tables["model_invocations"]

    assert {
        "key_version",
        "nonce",
        "ciphertext",
    }.issubset(table.columns.keys())
    assert "prompt" not in table.columns
    assert "response" not in table.columns
    assert "exception_message" not in table.columns


def _seed_analysis(database: Database) -> Analysis:
    with database.session() as session:
        user = User(
            id="user-trace",
            email="trace@siad.local",
            password_hash="$argon2id$placeholder",
            role="operador",
        )
        session.add(user)
        session.flush()
        video = Video(
            id="video-trace",
            owner_id=user.id,
            filename="trace.mp4",
            media_type="video/mp4",
            size_bytes=1,
            chunk_size=1,
            key_version=1,
            data_kind="demo",
        )
        session.add(video)
        session.flush()
        analysis = Analysis(
            id="analysis-trace",
            video_id=video.id,
            requested_by_id=user.id,
        )
        session.add(analysis)
    return analysis


def test_invoke_encrypts_reference_ids_and_does_not_persist_result_body(
    cipher,
    tmp_path: Path,
):
    database_path = tmp_path / "trace-success.db"
    database = Database(f"sqlite:///{database_path}")
    database.create_schema()
    analysis = _seed_analysis(database)
    service = ModelInvocationTraceService(database=database, cipher=cipher)
    stages = StageRepository(database=database, cipher=cipher)
    stages.claim(analysis.id, AnalysisStage.PEOPLE_PLACES)
    private_result = "PRIVATE_RESULT_BODY_25A47D"
    result_payload = {"segment_text": private_result}

    try:
        result = service.invoke(
            analysis_id=analysis.id,
            stage=AnalysisStage.PEOPLE_PLACES,
            provider="gpt",
            model="provider-model",
            prompt_version="facts-v1",
            attempt=1,
            input_segment_ids=["PRIVATE_SEGMENT_ID_91C3"],
            input_source_ids=["PRIVATE_SOURCE_ID_82B4"],
            operation=lambda: result_payload,
            result_event=lambda payload: stages.complete(
                analysis.id,
                AnalysisStage.PEOPLE_PLACES,
                payload,
            ),
        )

        with database.session() as session:
            invocation = session.scalar(select(ModelInvocation))
        references = ModelInvocationReferences.model_validate(
            cipher.decrypt_json(
                invocation.id,
                "model_invocation",
                invocation.encrypted_payload(),
            )
        )

        assert result == result_payload
        assert invocation.status == "completed"
        assert invocation.error_code is None
        assert references == ModelInvocationReferences(
            input_segment_ids=["PRIVATE_SEGMENT_ID_91C3"],
            input_source_ids=["PRIVATE_SOURCE_ID_82B4"],
            result_event_sequence=2,
        )
        database.dispose()
        database_bytes = database_path.read_bytes()
        assert private_result.encode() not in database_bytes
        assert b"PRIVATE_SEGMENT_ID_91C3" not in database_bytes
        assert b"PRIVATE_SOURCE_ID_82B4" not in database_bytes
    finally:
        database.dispose()


def test_invoke_reduces_exception_messages_to_safe_class_codes(
    cipher,
    tmp_path: Path,
):
    database_path = tmp_path / "trace-failure.db"
    database = Database(f"sqlite:///{database_path}")
    database.create_schema()
    analysis = _seed_analysis(database)
    service = ModelInvocationTraceService(database=database, cipher=cipher)
    private_message = "PRIVATE_EXCEPTION_MESSAGE_67F10B"

    def fail_provider() -> None:
        raise RuntimeError(private_message)

    try:
        with pytest.raises(RuntimeError, match=private_message):
            service.invoke(
                analysis_id=analysis.id,
                stage=AnalysisStage.ROUTES,
                provider="claude",
                model="provider-model",
                prompt_version="routes-v1",
                attempt=2,
                input_segment_ids=[],
                input_source_ids=["source-public-id"],
                operation=fail_provider,
                result_event=lambda _: pytest.fail(
                    "failed operations must not create result events"
                ),
            )

        with database.session() as session:
            invocation = session.scalar(select(ModelInvocation))
        assert invocation.status == "failed"
        assert invocation.error_code == "runtime_error"
        assert invocation.completed_at is not None
        assert invocation.duration_ms is not None
        database.dispose()
        assert private_message.encode() not in database_path.read_bytes()
    finally:
        database.dispose()
