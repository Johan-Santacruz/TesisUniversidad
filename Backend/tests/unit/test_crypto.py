from __future__ import annotations

from cryptography.exceptions import InvalidTag
import pytest

from app.security.crypto import EncryptedPayload


def test_encrypted_json_round_trips_without_plaintext(cipher):
    value = {
        "person": "Caso ficticio",
        "facts": [{"segment_id": "segment-1", "value": "Popayán"}],
    }

    encrypted = cipher.encrypt_json("case-7", "facts", value)

    assert b"Caso ficticio" not in encrypted.ciphertext
    assert cipher.decrypt_json("case-7", "facts", encrypted) == value


def test_ciphertext_tampering_is_detected(cipher):
    encrypted = cipher.encrypt_json("case-7", "facts", {"value": "ficticio"})
    changed = bytearray(encrypted.ciphertext)
    changed[-1] ^= 1
    damaged = EncryptedPayload(
        key_version=encrypted.key_version,
        nonce=encrypted.nonce,
        ciphertext=bytes(changed),
    )

    with pytest.raises(InvalidTag):
        cipher.decrypt_json("case-7", "facts", damaged)


def test_record_identity_is_authenticated(cipher):
    encrypted = cipher.encrypt_json("case-7", "facts", {"value": "ficticio"})

    with pytest.raises(InvalidTag):
        cipher.decrypt_json("case-8", "facts", encrypted)


def test_unknown_key_version_is_rejected(cipher):
    encrypted = cipher.encrypt_json("case-7", "facts", {"value": "ficticio"})
    unknown = EncryptedPayload(
        key_version=99,
        nonce=encrypted.nonce,
        ciphertext=encrypted.ciphertext,
    )

    with pytest.raises(KeyError, match="99"):
        cipher.decrypt_json("case-7", "facts", unknown)

