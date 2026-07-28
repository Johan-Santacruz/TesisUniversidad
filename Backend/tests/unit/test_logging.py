from __future__ import annotations

import logging

from app.logging import SafeLogger


def test_sensitive_fields_are_dropped_from_structured_logs(caplog):
    logger = SafeLogger(logging.getLogger("siad.tests.logging"))
    caplog.set_level(logging.INFO, logger="siad.tests.logging")

    logger.info(
        "analysis_failed",
        case_id="case-1",
        stage="transcription",
        duration_ms=42,
        transcript="nombre y cédula sensibles",
        person_name="Dato sensible",
    )

    assert "analysis_failed" in caplog.text
    assert "case-1" in caplog.text
    assert "nombre y cédula sensibles" not in caplog.text
    assert "Dato sensible" not in caplog.text


def test_unapproved_nested_values_never_reach_logs(caplog):
    logger = SafeLogger(logging.getLogger("siad.tests.logging.nested"))
    caplog.set_level(logging.INFO, logger="siad.tests.logging.nested")

    logger.info(
        "provider_finished",
        provider="openai",
        payload={"transcript": "secreto"},
        error=RuntimeError("también secreto"),
    )

    assert "provider_finished" in caplog.text
    assert "openai" in caplog.text
    assert "secreto" not in caplog.text

