from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from uuid import UUID

from app.security.crypto import EncryptedPayload, EnvelopeCipher


@dataclass(frozen=True)
class StoredAsset:
    key_version: int
    nonce: bytes
    storage_path: str
    plaintext_size: int
    ciphertext_size: int


class EncryptedAssetStore:
    _asset_root_name = "memory-images"
    _asset_file_name = "asset.bin"

    def __init__(self, *, cipher: EnvelopeCipher, storage_dir: Path) -> None:
        self.cipher = cipher
        self.storage_dir = Path(storage_dir)

    @staticmethod
    def _canonical_asset_id(asset_id: str) -> str:
        try:
            return str(UUID(asset_id))
        except (AttributeError, TypeError, ValueError) as exc:
            raise ValueError("asset_id must be a UUID") from exc

    @classmethod
    def _relative_path(cls, canonical_asset_id: str) -> Path:
        return Path(cls._asset_root_name) / canonical_asset_id / cls._asset_file_name

    @classmethod
    def _validate_stored_path(cls, storage_path: str) -> Path:
        try:
            relative_path = Path(storage_path)
        except TypeError as exc:
            raise ValueError("invalid storage path") from exc
        if relative_path.is_absolute() or len(relative_path.parts) != 3:
            raise ValueError("invalid storage path")
        if relative_path.parts[0] != cls._asset_root_name:
            raise ValueError("invalid storage path")
        try:
            canonical_asset_id = cls._canonical_asset_id(relative_path.parts[1])
        except ValueError as exc:
            raise ValueError("invalid storage path") from exc
        expected = cls._relative_path(canonical_asset_id)
        if relative_path != expected or relative_path.parts[2] != cls._asset_file_name:
            raise ValueError("invalid storage path")
        return relative_path

    @staticmethod
    def _close(fd: int | None) -> None:
        if fd is not None:
            os.close(fd)

    @staticmethod
    def _directory_open_flags() -> int:
        no_follow = getattr(os, "O_NOFOLLOW", None)
        if no_follow is None:
            raise OSError("secure asset storage requires O_NOFOLLOW support")
        return (
            os.O_RDONLY
            | getattr(os, "O_DIRECTORY", 0)
            | no_follow
            | getattr(os, "O_CLOEXEC", 0)
        )

    @classmethod
    def _open_directory(cls, path: str, *, dir_fd: int | None = None) -> int:
        flags = cls._directory_open_flags()
        if dir_fd is None:
            return os.open(path, flags)
        return os.open(path, flags, dir_fd=dir_fd)

    @classmethod
    def _file_open_flags(cls, flags: int) -> int:
        no_follow = getattr(os, "O_NOFOLLOW", None)
        if no_follow is None:
            raise OSError("secure asset storage requires O_NOFOLLOW support")
        return flags | no_follow | getattr(os, "O_CLOEXEC", 0)

    def _open_storage_directory(self, *, create: bool) -> int:
        if create:
            self.storage_dir.mkdir(parents=True, exist_ok=True)
        return self._open_directory(os.fspath(self.storage_dir))

    def write(self, asset_id: str, purpose: str, data: bytes) -> StoredAsset:
        canonical_asset_id = self._canonical_asset_id(asset_id)
        encrypted = self.cipher.encrypt_bytes(canonical_asset_id, purpose, data)
        relative_path = self._relative_path(canonical_asset_id)
        storage_fd: int | None = None
        asset_root_fd: int | None = None
        asset_dir_fd: int | None = None
        file_fd: int | None = None
        asset_dir_created = False
        target_created = False

        try:
            storage_fd = self._open_storage_directory(create=True)
            try:
                os.mkdir(self._asset_root_name, mode=0o700, dir_fd=storage_fd)
            except FileExistsError:
                pass
            asset_root_fd = self._open_directory(
                self._asset_root_name, dir_fd=storage_fd
            )
            os.mkdir(canonical_asset_id, mode=0o700, dir_fd=asset_root_fd)
            asset_dir_created = True
            asset_dir_fd = self._open_directory(
                canonical_asset_id, dir_fd=asset_root_fd
            )
            file_fd = os.open(
                self._asset_file_name,
                self._file_open_flags(os.O_WRONLY | os.O_CREAT | os.O_EXCL),
                0o600,
                dir_fd=asset_dir_fd,
            )
            target_created = True
            with os.fdopen(file_fd, "wb") as handle:
                file_fd = None
                handle.write(encrypted.ciphertext)
        except Exception:
            if target_created and asset_dir_fd is not None:
                try:
                    os.unlink(self._asset_file_name, dir_fd=asset_dir_fd)
                except OSError:
                    pass
            if asset_dir_created and asset_root_fd is not None:
                try:
                    os.rmdir(canonical_asset_id, dir_fd=asset_root_fd)
                except OSError:
                    pass
            raise
        finally:
            self._close(file_fd)
            self._close(asset_dir_fd)
            self._close(asset_root_fd)
            self._close(storage_fd)

        return StoredAsset(
            key_version=encrypted.key_version,
            nonce=encrypted.nonce,
            storage_path=relative_path.as_posix(),
            plaintext_size=len(data),
            ciphertext_size=len(encrypted.ciphertext),
        )

    def read(self, asset_id: str, purpose: str, asset: StoredAsset) -> bytes:
        canonical_asset_id = self._canonical_asset_id(asset_id)
        relative_path = self._validate_stored_path(asset.storage_path)
        if relative_path != self._relative_path(canonical_asset_id):
            raise ValueError("storage path does not match asset_id")
        storage_fd: int | None = None
        asset_root_fd: int | None = None
        asset_dir_fd: int | None = None
        file_fd: int | None = None

        try:
            storage_fd = self._open_storage_directory(create=False)
            asset_root_fd = self._open_directory(
                self._asset_root_name, dir_fd=storage_fd
            )
            asset_dir_fd = self._open_directory(
                canonical_asset_id, dir_fd=asset_root_fd
            )
            file_fd = os.open(
                self._asset_file_name,
                self._file_open_flags(os.O_RDONLY),
                dir_fd=asset_dir_fd,
            )
            with os.fdopen(file_fd, "rb") as handle:
                file_fd = None
                ciphertext = handle.read()
        finally:
            self._close(file_fd)
            self._close(asset_dir_fd)
            self._close(asset_root_fd)
            self._close(storage_fd)

        payload = EncryptedPayload(
            key_version=asset.key_version,
            nonce=asset.nonce,
            ciphertext=ciphertext,
        )
        return self.cipher.decrypt_bytes(canonical_asset_id, purpose, payload)

    def delete(self, asset_id: str, asset: StoredAsset) -> None:
        relative_path = self._validate_stored_path(asset.storage_path)
        canonical_asset_id = self._canonical_asset_id(asset_id)
        if relative_path != self._relative_path(canonical_asset_id):
            raise ValueError("storage path does not match asset_id")
        storage_fd: int | None = None
        asset_root_fd: int | None = None
        asset_dir_fd: int | None = None

        try:
            try:
                storage_fd = self._open_storage_directory(create=False)
                asset_root_fd = self._open_directory(
                    self._asset_root_name, dir_fd=storage_fd
                )
                asset_dir_fd = self._open_directory(
                    canonical_asset_id, dir_fd=asset_root_fd
                )
            except FileNotFoundError:
                return
            try:
                os.unlink(self._asset_file_name, dir_fd=asset_dir_fd)
            except FileNotFoundError:
                pass
            try:
                os.rmdir(canonical_asset_id, dir_fd=asset_root_fd)
            except OSError:
                pass
        finally:
            self._close(asset_dir_fd)
            self._close(asset_root_fd)
            self._close(storage_fd)
