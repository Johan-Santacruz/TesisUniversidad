from __future__ import annotations

from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import threading

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.ai.contracts import AnalysisStage
from app.database import Database
from app.models import Analysis, AnalysisEvent, AnalysisStageRun, User, Video
from app.services.analysis import AnalysisService
from app.services.analysis_state import StageRepository


def _seed_analysis(database: Database) -> Analysis:
    with database.session() as session:
        user = User(
            id="user-stage",
            email="stage@siad.local",
            password_hash="$argon2id$placeholder",
            role="operador",
        )
        session.add(user)
        session.flush()
        video = Video(
            id="video-stage",
            owner_id=user.id,
            filename="stage.mp4",
            media_type="video/mp4",
            size_bytes=1,
            chunk_size=1,
            key_version=1,
            data_kind="demo",
        )
        session.add(video)
        session.flush()
        analysis = Analysis(
            id="analysis-stage",
            video_id=video.id,
            requested_by_id=user.id,
        )
        session.add(analysis)
    return analysis


def test_analysis_has_one_checkpoint_per_stage():
    database = Database("sqlite://")
    database.create_schema()
    analysis = _seed_analysis(database)

    try:
        with pytest.raises(IntegrityError):
            with database.session() as session:
                session.add_all(
                    [
                        AnalysisStageRun(
                            analysis_id=analysis.id,
                            stage="audio",
                            state="pending",
                        ),
                        AnalysisStageRun(
                            analysis_id=analysis.id,
                            stage="audio",
                            state="pending",
                        ),
                    ]
                )
                session.flush()
    finally:
        database.dispose()


def test_claim_and_complete_reserve_monotonic_immutable_events(
    cipher,
    tmp_path: Path,
):
    database_path = tmp_path / "analysis-state.db"
    database = Database(f"sqlite:///{database_path}")
    database.create_schema()
    analysis = _seed_analysis(database)
    repository = StageRepository(database=database, cipher=cipher)
    private_payload = "PRIVATE_STAGE_PAYLOAD_72E1C4"

    try:
        checkpoint = repository.claim(analysis.id, AnalysisStage.AUDIO)
        terminal = repository.complete(
            analysis.id,
            AnalysisStage.AUDIO,
            {"segment_text": private_payload},
        )

        assert (checkpoint.generation, checkpoint.attempt) == (1, 1)
        assert (terminal.sequence, terminal.state) == (2, "completed")
        assert (terminal.generation, terminal.attempt) == (1, 1)
        with database.session() as session:
            stored_analysis = session.get(Analysis, analysis.id)
            events = session.scalars(
                select(AnalysisEvent)
                .where(AnalysisEvent.analysis_id == analysis.id)
                .order_by(AnalysisEvent.sequence)
            ).all()
            stored_checkpoint = session.scalar(
                select(AnalysisStageRun).where(
                    AnalysisStageRun.analysis_id == analysis.id,
                    AnalysisStageRun.stage == AnalysisStage.AUDIO.value,
                )
            )

        assert stored_analysis.next_event_sequence == 3
        assert [event.state for event in events] == ["running", "completed"]
        assert stored_checkpoint.state == "completed"
        assert stored_checkpoint.terminal_event_sequence == terminal.sequence
        assert cipher.decrypt_json(
            f"{analysis.id}:{terminal.sequence}",
            "analysis_event",
            terminal.encrypted_payload(),
        ) == {"segment_text": private_payload}
        database.dispose()
        assert private_payload.encode() not in database_path.read_bytes()
    finally:
        database.dispose()


def test_retry_advances_generation_without_deleting_prior_sse_events(cipher):
    database = Database("sqlite://")
    database.create_schema()
    analysis = _seed_analysis(database)
    repository = StageRepository(database=database, cipher=cipher)

    try:
        repository.claim(analysis.id, AnalysisStage.AUDIO)
        repository.complete(analysis.id, AnalysisStage.AUDIO, {"ok": True})
        repository.claim(analysis.id, AnalysisStage.TRANSCRIPTION)
        first_terminal = repository.complete(
            analysis.id,
            AnalysisStage.TRANSCRIPTION,
            {"artifact_id": "transcript-event-1"},
        )

        invalidated = repository.invalidate_descendants(
            analysis.id,
            AnalysisStage.AUDIO,
        )
        retried = repository.claim(
            analysis.id,
            AnalysisStage.TRANSCRIPTION,
        )
        second_terminal = repository.complete(
            analysis.id,
            AnalysisStage.TRANSCRIPTION,
            {"artifact_id": "transcript-event-2"},
        )

        assert invalidated == [AnalysisStage.TRANSCRIPTION]
        assert (retried.generation, retried.attempt) == (2, 2)
        assert second_terminal.generation == 2
        with database.session() as session:
            events = session.scalars(
                select(AnalysisEvent)
                .where(AnalysisEvent.analysis_id == analysis.id)
                .order_by(AnalysisEvent.sequence)
            ).all()
            checkpoint = session.scalar(
                select(AnalysisStageRun).where(
                    AnalysisStageRun.analysis_id == analysis.id,
                    AnalysisStageRun.stage
                    == AnalysisStage.TRANSCRIPTION.value,
                )
            )

        assert [event.sequence for event in events] == list(
            range(1, len(events) + 1)
        )
        assert first_terminal.id in {event.id for event in events}
        assert len(
            [
                event
                for event in events
                if event.stage == AnalysisStage.TRANSCRIPTION.value
            ]
        ) == 5
        assert checkpoint.generation == 2
        assert checkpoint.terminal_event_sequence == second_terminal.sequence
    finally:
        database.dispose()


def test_first_invalid_returns_the_first_missing_or_nonterminal_stage(cipher):
    database = Database("sqlite://")
    database.create_schema()
    analysis = _seed_analysis(database)
    repository = StageRepository(database=database, cipher=cipher)

    try:
        assert repository.first_invalid(analysis.id) is AnalysisStage.AUDIO
        repository.claim(analysis.id, AnalysisStage.AUDIO)
        repository.complete(analysis.id, AnalysisStage.AUDIO, {"ok": True})
        assert (
            repository.first_invalid(analysis.id)
            is AnalysisStage.TRANSCRIPTION
        )
    finally:
        database.dispose()


def test_fail_records_only_a_safe_failure_code(cipher):
    database = Database("sqlite://")
    database.create_schema()
    analysis = _seed_analysis(database)
    repository = StageRepository(database=database, cipher=cipher)

    try:
        repository.claim(analysis.id, AnalysisStage.SOURCES)
        event = repository.fail(
            analysis.id,
            AnalysisStage.SOURCES,
            "private_identifier",
        )

        with database.session() as session:
            checkpoint = session.scalar(
                select(AnalysisStageRun).where(
                    AnalysisStageRun.analysis_id == analysis.id,
                    AnalysisStageRun.stage == AnalysisStage.SOURCES.value,
                )
            )
        assert event.state == "failed"
        assert checkpoint.failure_code == "stage_error"
    finally:
        database.dispose()


def test_existing_event_writer_keeps_atomic_sequence_counter_in_sync(cipher):
    database = Database("sqlite://")
    database.create_schema()
    analysis = _seed_analysis(database)
    service = AnalysisService(
        database=database,
        cipher=cipher,
        rag=object(),
        beto=object(),
    )

    try:
        sequence = service._append_event(
            analysis.id,
            AnalysisStage.AUDIO,
            {"artifact_id": "legacy-writer-artifact"},
        )

        with database.session() as session:
            stored_analysis = session.get(Analysis, analysis.id)
        assert sequence == 1
        assert stored_analysis.next_event_sequence == 2
    finally:
        database.dispose()


def test_start_rejects_a_second_analysis_for_the_same_video(cipher):
    database = Database("sqlite://")
    database.create_schema()
    analysis = _seed_analysis(database)
    service = AnalysisService(
        database=database,
        cipher=cipher,
        rag=object(),
        beto=object(),
    )

    try:
        with pytest.raises(
            ValueError,
            match="video already has a durable analysis",
        ):
            with database.session() as session:
                video = session.get(Video, analysis.video_id)
                user = session.get(User, analysis.requested_by_id)
                service.start(session, video=video, user=user)
    finally:
        database.dispose()


def test_concurrent_terminal_transitions_allow_exactly_one_winner(
    cipher,
    tmp_path: Path,
):
    database = Database(f"sqlite:///{tmp_path / 'stage-race.db'}")
    database.create_schema()
    analysis = _seed_analysis(database)
    StageRepository(database=database, cipher=cipher).claim(
        analysis.id,
        AnalysisStage.AUDIO,
    )
    checkpoint_barrier = threading.Barrier(2)

    class SynchronizedRepository(StageRepository):
        def _checkpoint(self, session, analysis_id, stage):
            checkpoint = super()._checkpoint(session, analysis_id, stage)
            if checkpoint is not None and checkpoint.state == "running":
                checkpoint_barrier.wait(timeout=5)
            return checkpoint

    def complete_stage():
        repository = SynchronizedRepository(database=database, cipher=cipher)
        try:
            return repository.complete(
                analysis.id,
                AnalysisStage.AUDIO,
                {"winner": "completed"},
            )
        except Exception as exception:
            return exception

    def fail_stage():
        repository = SynchronizedRepository(database=database, cipher=cipher)
        try:
            return repository.fail(
                analysis.id,
                AnalysisStage.AUDIO,
                "provider_error",
            )
        except Exception as exception:
            return exception

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = [
                future.result()
                for future in (
                    executor.submit(complete_stage),
                    executor.submit(fail_stage),
                )
            ]

        assert len(
            [outcome for outcome in outcomes if isinstance(outcome, AnalysisEvent)]
        ) == 1
        assert len(
            [outcome for outcome in outcomes if isinstance(outcome, ValueError)]
        ) == 1
        with database.session() as session:
            terminal_events = session.scalars(
                select(AnalysisEvent).where(
                    AnalysisEvent.analysis_id == analysis.id,
                    AnalysisEvent.state.in_({"completed", "failed"}),
                )
            ).all()
        assert len(terminal_events) == 1
    finally:
        database.dispose()


def test_concurrent_claims_create_one_running_attempt(
    cipher,
    tmp_path: Path,
):
    database = Database(f"sqlite:///{tmp_path / 'claim-race.db'}")
    database.create_schema()
    analysis = _seed_analysis(database)
    start_barrier = threading.Barrier(2)

    def claim_stage():
        repository = StageRepository(database=database, cipher=cipher)
        start_barrier.wait(timeout=5)
        try:
            return repository.claim(analysis.id, AnalysisStage.AUDIO)
        except Exception as exception:
            return exception

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = [
                future.result()
                for future in (
                    executor.submit(claim_stage),
                    executor.submit(claim_stage),
                )
            ]

        assert len(
            [
                outcome
                for outcome in outcomes
                if isinstance(outcome, AnalysisStageRun)
            ]
        ) == 1
        assert len(
            [outcome for outcome in outcomes if isinstance(outcome, ValueError)]
        ) == 1
        with database.session() as session:
            events = session.scalars(
                select(AnalysisEvent).where(
                    AnalysisEvent.analysis_id == analysis.id,
                    AnalysisEvent.stage == AnalysisStage.AUDIO.value,
                    AnalysisEvent.state == "running",
                )
            ).all()
            checkpoints = session.scalars(
                select(AnalysisStageRun).where(
                    AnalysisStageRun.analysis_id == analysis.id,
                    AnalysisStageRun.stage == AnalysisStage.AUDIO.value,
                )
            ).all()
        assert len(events) == 1
        assert len(checkpoints) == 1
        assert (checkpoints[0].generation, checkpoints[0].attempt) == (1, 1)
    finally:
        database.dispose()
