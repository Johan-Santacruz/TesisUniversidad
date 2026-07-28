from __future__ import annotations

import json
import hmac
import os
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any, BinaryIO

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

    def fingerprint(self, value: str, *, purpose: str) -> str:
        return hmac.digest(
            self._keys[self.current_version],
            f"siad:{purpose}:{value}".encode("utf-8"),
            "sha256",
        ).hex()


class EncryptedChunk(BaseModel):
    model_config = ConfigDict(frozen=True)

    chunk_index: int
    byte_start: int
    byte_end: int
    key_version: int
    nonce: bytes
    path: Path
    ciphertext_size: int


class ChunkManifest(BaseModel):
    model_config = ConfigDict(frozen=True)

    total_size: int
    chunk_size: int
    chunks: tuple[EncryptedChunk, ...]


class ChunkCipher:
    def __init__(self, *, keys: Mapping[int, bytes], current_version: int) -> None:
        if current_version not in keys:
            raise KeyError(f"missing current key version {current_version}")
        for version, key in keys.items():
            if len(key) != 32:
                raise ValueError(f"key version {version} must contain 32 bytes")
        self._keys = dict(keys)
        self.current_version = current_version

    def _derive_key(self, video_id: str, chunk_index: int, version: int) -> bytes:
        return HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=video_id.encode("utf-8"),
            info=f"siad:video-chunk:{chunk_index}:v{version}".encode("utf-8"),
        ).derive(self._keys[version])

    @staticmethod
    def _aad(
        video_id: str,
        chunk_index: int,
        byte_start: int,
        byte_end: int,
        version: int,
    ) -> bytes:
        return (
            f"{video_id}|{chunk_index}|{byte_start}|{byte_end}|{version}"
        ).encode("utf-8")

    def encrypt_stream(
        self,
        video_id: str,
        source: BinaryIO,
        storage_dir: Path,
        *,
        chunk_size: int,
        max_bytes: int | None = None,
    ) -> ChunkManifest:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be positive")
        created_dir = not storage_dir.exists()
        storage_dir.mkdir(parents=True, exist_ok=True)
        if any(storage_dir.iterdir()):
            raise ValueError("storage directory must be empty")
        chunks: list[EncryptedChunk] = []
        total_size = 0
        try:
            while True:
                plaintext = source.read(chunk_size)
                if not plaintext:
                    break
                if max_bytes is not None and total_size + len(plaintext) > max_bytes:
                    raise ValueError("video exceeds configured size limit")
                chunk_index = len(chunks)
                byte_start = total_size
                byte_end = total_size + len(plaintext) - 1
                version = self.current_version
                nonce = os.urandom(12)
                ciphertext = AESGCM(
                    self._derive_key(video_id, chunk_index, version)
                ).encrypt(
                    nonce,
                    plaintext,
                    self._aad(
                        video_id,
                        chunk_index,
                        byte_start,
                        byte_end,
                        version,
                    ),
                )
                path = storage_dir / f"{chunk_index:08d}.bin"
                path.write_bytes(ciphertext)
                chunks.append(
                    EncryptedChunk(
                        chunk_index=chunk_index,
                        byte_start=byte_start,
                        byte_end=byte_end,
                        key_version=version,
                        nonce=nonce,
                        path=path,
                        ciphertext_size=len(ciphertext),
                    )
                )
                total_size += len(plaintext)
        except Exception:
            for chunk in chunks:
                chunk.path.unlink(missing_ok=True)
            if created_dir:
                storage_dir.rmdir()
            raise
        return ChunkManifest(
            total_size=total_size,
            chunk_size=chunk_size,
            chunks=tuple(chunks),
        )

    def encrypt_bytes(
        self,
        video_id: str,
        plaintext: bytes,
        storage_dir: Path,
        *,
        chunk_size: int,
    ) -> ChunkManifest:
        from io import BytesIO

        return self.encrypt_stream(
            video_id,
            BytesIO(plaintext),
            storage_dir,
            chunk_size=chunk_size,
        )

    def _decrypt_chunk(self, video_id: str, chunk: EncryptedChunk) -> bytes:
        if chunk.key_version not in self._keys:
            raise KeyError(f"unknown key version {chunk.key_version}")
        ciphertext = chunk.path.read_bytes()
        return AESGCM(
            self._derive_key(video_id, chunk.chunk_index, chunk.key_version)
        ).decrypt(
            chunk.nonce,
            ciphertext,
            self._aad(
                video_id,
                chunk.chunk_index,
                chunk.byte_start,
                chunk.byte_end,
                chunk.key_version,
            ),
        )

    @staticmethod
    def _validate_range(manifest: ChunkManifest, start: int, end: int) -> None:
        if (
            start < 0
            or end < start
            or start >= manifest.total_size
            or end >= manifest.total_size
        ):
            raise ValueError("range is outside the video")

    def iter_range(
        self,
        video_id: str,
        manifest: ChunkManifest,
        start: int,
        end: int,
    ) -> Iterator[bytes]:
        self._validate_range(manifest, start, end)
        for chunk in manifest.chunks:
            if chunk.byte_end < start or chunk.byte_start > end:
                continue
            plaintext = self._decrypt_chunk(video_id, chunk)
            relative_start = max(start, chunk.byte_start) - chunk.byte_start
            relative_end = min(end, chunk.byte_end) - chunk.byte_start
            yield plaintext[relative_start : relative_end + 1]

    def read_range(
        self,
        video_id: str,
        manifest: ChunkManifest,
        start: int,
        end: int,
    ) -> bytes:
        return b"".join(self.iter_range(video_id, manifest, start, end))
