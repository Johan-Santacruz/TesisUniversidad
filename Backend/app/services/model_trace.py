from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime, timezone
import re
import time
from typing import TypeVar
from uuid import uuid4

from sqlalchemy import select

from app.ai.contracts import (
    AnalysisStage,
    ModelInvocationReferences,
)
from app.database import Database
from app.models import AnalysisEvent, ModelInvocation
from app.security.crypto import EnvelopeCipher


T = TypeVar("T")
SAFE_EXCEPTION_CODES: tuple[tuple[type[BaseException], str], ...] = (
    (TimeoutError, "timeout_error"),
    (ConnectionError, "connection_error"),
    (ValueError, "value_error"),
    (RuntimeError, "runtime_error"),
)
SAFE_TRACE_IDENTIFIER = re.compile(r"^[a-z0-9][a-z0-9._:/-]*$")
TERMINAL_EVENT_STATES = {"completed", "failed", "partial", "unavailable"}
TRACE_IDENTIFIER_LIMITS = {
    "provider": 32,
    "model": 128,
    "prompt_version": 64,
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _error_code(exception: Exception) -> str:
    for exception_type, code in SAFE_EXCEPTION_CODES:
        if isinstance(exception, exception_type):
            return code
    return "provider_error"


def _validate_identifier(field_name: str, value: str) -> str:
    limit = TRACE_IDENTIFIER_LIMITS[field_name]
    if (
        not value
        or len(value) > limit
        or SAFE_TRACE_IDENTIFIER.fullmatch(value) is None
    ):
        raise ValueError(f"{field_name} must be a safe identifier")
    return value


class ModelInvocationTraceService:
    def __init__(
        self,
        *,
        database: Database,
        cipher: EnvelopeCipher,
    ) -> None:
        self.database = database
        self.cipher = cipher

    def invoke(
        self,
        *,
        analysis_id: str,
        stage: AnalysisStage,
        provider: str,
        model: str,
        prompt_version: str,
        generation: int,
        attempt: int,
        input_segment_ids: Sequence[str],
        input_source_ids: Sequence[str],
        operation: Callable[[], T],
        result_event: Callable[[T], AnalysisEvent],
    ) -> T:
        safe_provider = _validate_identifier("provider", provider)
        safe_model = _validate_identifier("model", model)
        safe_prompt_version = _validate_identifier(
            "prompt_version",
            prompt_version,
        )
        if generation < 1 or attempt < 1:
            raise ValueError("generation and attempt must be positive")
        invocation_id = str(uuid4())
        started_at = _utc_now()
        started_clock = time.monotonic()
        references = ModelInvocationReferences(
            input_segment_ids=list(input_segment_ids),
            input_source_ids=list(input_source_ids),
            result_event_sequence=None,
        )
        encrypted = self.cipher.encrypt_json(
            invocation_id,
            "model_invocation",
            references.model_dump(mode="json"),
        )
        with self.database.session() as session:
            session.add(
                ModelInvocation(
                    id=invocation_id,
                    analysis_id=analysis_id,
                    stage=stage.value,
                    provider=safe_provider,
                    model=safe_model,
                    prompt_version=safe_prompt_version,
                    attempt=attempt,
                    status="running",
                    error_code=None,
                    started_at=started_at,
                    completed_at=None,
                    duration_ms=None,
                    key_version=encrypted.key_version,
                    nonce=encrypted.nonce,
                    ciphertext=encrypted.ciphertext,
                )
            )

        try:
            result = operation()
            event = result_event(result)
            with self.database.session() as session:
                stored_event = session.scalar(
                    select(AnalysisEvent).where(
                        AnalysisEvent.id == event.id,
                        AnalysisEvent.analysis_id == analysis_id,
                        AnalysisEvent.stage == stage.value,
                    )
                )
            if stored_event is None:
                raise ValueError(
                    "result event must belong to the invocation analysis and stage"
                )
            if stored_event.state not in TERMINAL_EVENT_STATES:
                raise ValueError("result event must be a terminal result event")
            if (
                stored_event.generation != generation
                or stored_event.attempt != attempt
            ):
                raise ValueError(
                    "result event does not match the invocation execution identity"
                )
        except Exception as exception:
            completed_at = _utc_now()
            duration_ms = max(
                0,
                round((time.monotonic() - started_clock) * 1000),
            )
            with self.database.session() as session:
                invocation = session.get(ModelInvocation, invocation_id)
                if invocation is None:
                    raise RuntimeError("model invocation trace disappeared")
                invocation.status = "failed"
                invocation.error_code = _error_code(exception)
                invocation.completed_at = completed_at
                invocation.duration_ms = duration_ms
            raise

        completed_at = _utc_now()
        duration_ms = max(
            0,
            round((time.monotonic() - started_clock) * 1000),
        )
        completed_references = references.model_copy(
            update={"result_event_sequence": stored_event.sequence}
        )
        completed_encrypted = self.cipher.encrypt_json(
            invocation_id,
            "model_invocation",
            completed_references.model_dump(mode="json"),
        )
        with self.database.session() as session:
            invocation = session.get(ModelInvocation, invocation_id)
            if invocation is None:
                raise RuntimeError("model invocation trace disappeared")
            invocation.status = "completed"
            invocation.completed_at = completed_at
            invocation.duration_ms = duration_ms
            invocation.set_encrypted_payload(completed_encrypted)
        return result
