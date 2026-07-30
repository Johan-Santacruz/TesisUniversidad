from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import case, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.contracts import AnalysisStage
from app.database import Database
from app.models import Analysis, AnalysisEvent, AnalysisStageRun
from app.security.crypto import EnvelopeCipher


VALID_CHECKPOINT_STATES = {"completed", "unavailable"}
RETRYABLE_CHECKPOINT_STATES = {"failed", "invalidated", "partial"}
SAFE_FAILURE_CODES = frozenset(
    {
        "audio_unavailable",
        "classification_unavailable",
        "connection_error",
        "invalid_provider_response",
        "provider_error",
        "provider_not_configured",
        "source_validation_error",
        "stage_error",
        "timeout_error",
        "transcription_unavailable",
    }
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class StageRepository:
    def __init__(
        self,
        *,
        database: Database,
        cipher: EnvelopeCipher,
    ) -> None:
        self.database = database
        self.cipher = cipher

    @staticmethod
    def _checkpoint(
        session: Session,
        analysis_id: str,
        stage: AnalysisStage,
    ) -> AnalysisStageRun | None:
        return session.scalar(
            select(AnalysisStageRun).where(
                AnalysisStageRun.analysis_id == analysis_id,
                AnalysisStageRun.stage == stage.value,
            )
        )

    @staticmethod
    def _reserve_sequence(session: Session, analysis_id: str) -> int:
        next_sequence = session.scalar(
            update(Analysis)
            .where(Analysis.id == analysis_id)
            .values(
                next_event_sequence=Analysis.next_event_sequence + 1,
            )
            .returning(Analysis.next_event_sequence)
        )
        if next_sequence is None:
            raise KeyError(analysis_id)
        return int(next_sequence) - 1

    def _append_event(
        self,
        session: Session,
        *,
        analysis_id: str,
        stage: AnalysisStage,
        state: str,
        generation: int,
        attempt: int,
        payload: dict[str, Any],
    ) -> AnalysisEvent:
        sequence = self._reserve_sequence(session, analysis_id)
        encrypted = self.cipher.encrypt_json(
            f"{analysis_id}:{sequence}",
            "analysis_event",
            payload,
        )
        event = AnalysisEvent(
            analysis_id=analysis_id,
            sequence=sequence,
            stage=stage.value,
            state=state,
            generation=generation,
            attempt=attempt,
            key_version=encrypted.key_version,
            nonce=encrypted.nonce,
            ciphertext=encrypted.ciphertext,
        )
        session.add(event)
        session.flush()
        return event

    def claim(
        self,
        analysis_id: str,
        stage: AnalysisStage,
    ) -> AnalysisStageRun:
        with self.database.session() as session:
            if session.get(Analysis, analysis_id) is None:
                raise KeyError(analysis_id)
            checkpoint: AnalysisStageRun | None = None
            for _ in range(3):
                claimed = session.execute(
                    update(AnalysisStageRun)
                    .where(
                        AnalysisStageRun.analysis_id == analysis_id,
                        AnalysisStageRun.stage == stage.value,
                        AnalysisStageRun.state.in_(
                            {"pending", *RETRYABLE_CHECKPOINT_STATES}
                        ),
                    )
                    .values(
                        state="running",
                        generation=case(
                            (
                                AnalysisStageRun.state.in_(
                                    RETRYABLE_CHECKPOINT_STATES
                                ),
                                AnalysisStageRun.generation + 1,
                            ),
                            else_=AnalysisStageRun.generation,
                        ),
                        attempt=AnalysisStageRun.attempt + 1,
                        started_at=_utc_now(),
                        completed_at=None,
                        failure_code=None,
                        terminal_event_sequence=None,
                    )
                    .returning(AnalysisStageRun.id)
                ).scalar_one_or_none()
                if claimed is not None:
                    checkpoint = session.get(AnalysisStageRun, claimed)
                    break

                checkpoint = self._checkpoint(session, analysis_id, stage)
                if checkpoint is not None:
                    if checkpoint.state == "running":
                        raise ValueError(
                            f"stage {stage.value} is already claimed"
                        )
                    if checkpoint.state in VALID_CHECKPOINT_STATES:
                        raise ValueError(
                            f"stage {stage.value} already has a valid checkpoint"
                        )
                    session.expire(checkpoint)
                    continue

                try:
                    with session.begin_nested():
                        session.add(
                            AnalysisStageRun(
                                analysis_id=analysis_id,
                                stage=stage.value,
                                state="pending",
                                generation=1,
                                attempt=0,
                            )
                        )
                        session.flush()
                except IntegrityError:
                    continue

            if checkpoint is None or checkpoint.state != "running":
                raise ValueError(
                    f"stage {stage.value} could not be claimed"
                )
            self._append_event(
                session,
                analysis_id=analysis_id,
                stage=stage,
                state="running",
                generation=checkpoint.generation,
                attempt=checkpoint.attempt,
                payload={"state": "running"},
            )
            session.execute(
                update(Analysis)
                .where(Analysis.id == analysis_id)
                .values(status="running", current_stage=stage.value)
            )
            session.flush()
            return checkpoint

    @staticmethod
    def _begin_terminal_transition(
        session: Session,
        *,
        analysis_id: str,
        stage: AnalysisStage,
        generation: int,
        attempt: int,
        state: str,
        failure_code: str | None,
    ) -> tuple[int, int, int]:
        transitioned = session.execute(
            update(AnalysisStageRun)
            .where(
                AnalysisStageRun.analysis_id == analysis_id,
                AnalysisStageRun.stage == stage.value,
                AnalysisStageRun.state == "running",
                AnalysisStageRun.generation == generation,
                AnalysisStageRun.attempt == attempt,
            )
            .values(
                state=state,
                completed_at=_utc_now(),
                failure_code=failure_code,
                terminal_event_sequence=None,
            )
            .returning(
                AnalysisStageRun.id,
                AnalysisStageRun.generation,
                AnalysisStageRun.attempt,
            )
        ).one_or_none()
        if transitioned is None:
            raise ValueError(
                f"stage {stage.value} does not match the claimed execution"
            )
        return (
            int(transitioned.id),
            int(transitioned.generation),
            int(transitioned.attempt),
        )

    def complete(
        self,
        analysis_id: str,
        stage: AnalysisStage,
        payload: dict[str, Any],
        *,
        generation: int,
        attempt: int,
    ) -> AnalysisEvent:
        with self.database.session() as session:
            checkpoint_id, generation, attempt = self._begin_terminal_transition(
                session,
                analysis_id=analysis_id,
                stage=stage,
                generation=generation,
                attempt=attempt,
                state="completed",
                failure_code=None,
            )
            event = self._append_event(
                session,
                analysis_id=analysis_id,
                stage=stage,
                state="completed",
                generation=generation,
                attempt=attempt,
                payload=payload,
            )
            session.execute(
                update(AnalysisStageRun)
                .where(
                    AnalysisStageRun.id == checkpoint_id,
                    AnalysisStageRun.state == "completed",
                    AnalysisStageRun.generation == generation,
                    AnalysisStageRun.attempt == attempt,
                )
                .values(terminal_event_sequence=event.sequence)
            )
            session.flush()
            return event

    def fail(
        self,
        analysis_id: str,
        stage: AnalysisStage,
        code: str,
        *,
        generation: int,
        attempt: int,
    ) -> AnalysisEvent:
        failure_code = code if code in SAFE_FAILURE_CODES else "stage_error"
        with self.database.session() as session:
            checkpoint_id, generation, attempt = self._begin_terminal_transition(
                session,
                analysis_id=analysis_id,
                stage=stage,
                generation=generation,
                attempt=attempt,
                state="failed",
                failure_code=failure_code,
            )
            event = self._append_event(
                session,
                analysis_id=analysis_id,
                stage=stage,
                state="failed",
                generation=generation,
                attempt=attempt,
                payload={
                    "state": "failed",
                    "error_code": failure_code,
                },
            )
            session.execute(
                update(AnalysisStageRun)
                .where(
                    AnalysisStageRun.id == checkpoint_id,
                    AnalysisStageRun.state == "failed",
                    AnalysisStageRun.generation == generation,
                    AnalysisStageRun.attempt == attempt,
                )
                .values(terminal_event_sequence=event.sequence)
            )
            session.execute(
                update(Analysis)
                .where(Analysis.id == analysis_id)
                .values(status="failed", failure_code=failure_code)
            )
            session.flush()
            return event

    def invalidate_descendants(
        self,
        analysis_id: str,
        stage: AnalysisStage,
    ) -> list[AnalysisStage]:
        stages = list(AnalysisStage)
        descendants = stages[stages.index(stage) + 1 :]
        if not descendants:
            return []

        with self.database.session() as session:
            checkpoints = session.scalars(
                select(AnalysisStageRun).where(
                    AnalysisStageRun.analysis_id == analysis_id,
                    AnalysisStageRun.stage.in_(
                        descendant.value for descendant in descendants
                    ),
                )
            ).all()
            by_stage = {checkpoint.stage: checkpoint for checkpoint in checkpoints}
            invalidated: list[AnalysisStage] = []
            for descendant in descendants:
                checkpoint = by_stage.get(descendant.value)
                if checkpoint is None or checkpoint.state == "invalidated":
                    continue
                event = self._append_event(
                    session,
                    analysis_id=analysis_id,
                    stage=descendant,
                    state="invalidated",
                    generation=checkpoint.generation,
                    attempt=checkpoint.attempt,
                    payload={
                        "state": "invalidated",
                        "upstream_stage": stage.value,
                    },
                )
                checkpoint.state = "invalidated"
                checkpoint.completed_at = _utc_now()
                checkpoint.failure_code = None
                checkpoint.terminal_event_sequence = event.sequence
                invalidated.append(descendant)
            session.flush()
            return invalidated

    def first_invalid(self, analysis_id: str) -> AnalysisStage | None:
        with self.database.session() as session:
            checkpoints = session.scalars(
                select(AnalysisStageRun).where(
                    AnalysisStageRun.analysis_id == analysis_id
                )
            ).all()
            by_stage = {checkpoint.stage: checkpoint for checkpoint in checkpoints}
            for stage in AnalysisStage:
                checkpoint = by_stage.get(stage.value)
                if (
                    checkpoint is None
                    or checkpoint.state not in VALID_CHECKPOINT_STATES
                ):
                    return stage
            return None
