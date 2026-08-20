from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.entities import AuditLog
from app.security.crypto import EnvelopeCipher


class AuditService:
    def __init__(self, cipher: EnvelopeCipher) -> None:
        self._cipher = cipher

    def build_record(
        self,
        *,
        actor_id: str | None,
        actor_role: str,
        action: str,
        entity_type: str,
        entity_id: str,
        details: dict[str, Any],
    ) -> AuditLog:
        record_id = str(uuid4())
        payload = self._cipher.encrypt_json(record_id, "audit", details)
        record = AuditLog(
            id=record_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            key_version=payload.key_version,
            nonce=payload.nonce,
            ciphertext=payload.ciphertext,
        )
        return record

    def read_details(self, record: AuditLog) -> dict[str, Any]:
        value = self._cipher.decrypt_json(
            record.id,
            "audit",
            record.encrypted_payload(),
        )
        if not isinstance(value, dict):
            raise TypeError("audit payload must be a JSON object")
        return value

