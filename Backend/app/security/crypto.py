from __future__ import annotations

import json
import os
from collections.abc import Mapping
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from pydantic import BaseModel, ConfigDict


class EncryptedPayload(BaseModel):
    model_config = ConfigDict(frozen=True)

    key_version: int
    nonce: bytes
    ciphertext: bytes


class EnvelopeCipher:
    def __init__(self, *, keys: Mapping[int, bytes], current_version: int) -> None:
        if current_version not in keys:
            raise KeyError(f"missing current key version {current_version}")
        for version, key in keys.items():
            if len(key) != 32:
                raise ValueError(f"key version {version} must contain 32 bytes")
        self._keys = dict(keys)
        self.current_version = current_version

    def _derive_key(self, record_id: str, purpose: str, version: int) -> bytes:
        master = self._keys[version]
        return HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=record_id.encode("utf-8"),
            info=f"siad:{purpose}:v{version}".encode("utf-8"),
        ).derive(master)

    @staticmethod
    def _aad(record_id: str, purpose: str, version: int) -> bytes:
        return f"{record_id}|{purpose}|{version}".encode("utf-8")

    def encrypt_bytes(self, record_id: str, purpose: str, plaintext: bytes) -> EncryptedPayload:
        version = self.current_version
        nonce = os.urandom(12)
        cipher = AESGCM(self._derive_key(record_id, purpose, version))
        ciphertext = cipher.encrypt(nonce, plaintext, self._aad(record_id, purpose, version))
        return EncryptedPayload(
            key_version=version,
            nonce=nonce,
            ciphertext=ciphertext,
        )

    def decrypt_bytes(
        self,
        record_id: str,
        purpose: str,
        payload: EncryptedPayload,
    ) -> bytes:
        if payload.key_version not in self._keys:
            raise KeyError(f"unknown key version {payload.key_version}")
        cipher = AESGCM(
            self._derive_key(record_id, purpose, payload.key_version)
        )
        return cipher.decrypt(
            payload.nonce,
            payload.ciphertext,
            self._aad(record_id, purpose, payload.key_version),
        )

    def encrypt_json(
        self,
        record_id: str,
        purpose: str,
        value: Any,
    ) -> EncryptedPayload:
        plaintext = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        return self.encrypt_bytes(record_id, purpose, plaintext)

    def decrypt_json(
        self,
        record_id: str,
        purpose: str,
        payload: EncryptedPayload,
    ) -> Any:
        plaintext = self.decrypt_bytes(record_id, purpose, payload)
        return json.loads(plaintext.decode("utf-8"))

