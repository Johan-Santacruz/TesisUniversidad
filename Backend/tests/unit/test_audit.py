from __future__ import annotations

from app.models import AuditLog
from app.services.audit import AuditService


def test_audit_details_are_encrypted_at_rest(cipher):
    audit = AuditService(cipher)
    record = audit.build_record(
        actor_id="user-1",
        actor_role="operador",
        action="fact_corrected",
        entity_type="fact",
        entity_id="fact-1",
        details={"reason": "Dato sensible de prueba"},
    )

    assert b"Dato sensible de prueba" not in record.ciphertext
    assert audit.read_details(record) == {"reason": "Dato sensible de prueba"}
    assert isinstance(record, AuditLog)

