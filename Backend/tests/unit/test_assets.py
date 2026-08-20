from __future__ import annotations

import os
import stat
from pathlib import Path

import pytest

from app.security.crypto import EnvelopeCipher
from app.services import assets
from app.services.assets import EncryptedAssetStore, StoredAsset


ASSET_ID = "123e4567-e89b-12d3-a456-426614174000"
PNG = b"\x89PNG\r\n\x1a\nPNG-PRIVATE-MARKER"


def test_write_stores_one_encrypted_asset_and_read_round_trips(
    cipher: EnvelopeCipher, tmp_path: Path
):
    storage_dir = tmp_path / "storage"
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)

    stored = store.write(ASSET_ID, purpose="memory-image", data=PNG)

    asset_dir = storage_dir / "memory-images" / ASSET_ID
    files = list(asset_dir.glob("*.bin"))
    assert files == [asset_dir / "asset.bin"]
    assert stored.storage_path == f"memory-images/{ASSET_ID}/asset.bin"
    assert not Path(stored.storage_path).is_absolute()
    assert stored.plaintext_size == len(PNG)
    assert stored.ciphertext_size == len(PNG) + 16
    assert files[0].stat().st_size == stored.ciphertext_size
    assert stat.S_IMODE(files[0].stat().st_mode) == 0o600
    assert PNG not in files[0].read_bytes()
    assert b"PNG-PRIVATE-MARKER" not in files[0].read_bytes()
    assert store.read(ASSET_ID, purpose="memory-image", asset=stored) == PNG


def test_duplicate_asset_write_fails_without_creating_another_file(
    cipher: EnvelopeCipher, tmp_path: Path
):
    store = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path / "storage")
    store.write(ASSET_ID, purpose="memory-image", data=PNG)

    with pytest.raises(FileExistsError):
        store.write(ASSET_ID, purpose="memory-image", data=PNG)

    assert list((tmp_path / "storage" / "memory-images" / ASSET_ID).glob("*.bin")) == [
        tmp_path / "storage" / "memory-images" / ASSET_ID / "asset.bin"
    ]


@pytest.mark.parametrize(
    "asset_id",
    ["not-a-uuid", "../../escape", f"{ASSET_ID}/../escape"],
)
def test_write_rejects_non_uuid_asset_ids(
    cipher: EnvelopeCipher, tmp_path: Path, asset_id: str
):
    store = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path / "storage")

    with pytest.raises(ValueError, match="UUID"):
        store.write(asset_id, purpose="memory-image", data=PNG)

    assert not (tmp_path / "storage").exists()


def test_delete_is_idempotent_and_removes_the_empty_asset_directory(
    cipher: EnvelopeCipher, tmp_path: Path
):
    storage_dir = tmp_path / "storage"
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)
    stored = store.write(ASSET_ID, purpose="memory-image", data=PNG)

    store.delete(ASSET_ID, stored)
    store.delete(ASSET_ID, stored)

    assert not (storage_dir / stored.storage_path).exists()
    assert not (storage_dir / "memory-images" / ASSET_ID).exists()
    assert (storage_dir / "memory-images").is_dir()


def test_delete_rejects_a_descriptor_owned_by_a_different_memory_image(
    cipher: EnvelopeCipher, tmp_path: Path
):
    """Breaks if deleting one case can unlink another case's asset."""
    storage_dir = tmp_path / "storage"
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)
    stored = store.write(ASSET_ID, purpose="memory-image", data=PNG)
    other_id = "123e4567-e89b-12d3-a456-426614174001"

    with pytest.raises(ValueError, match="does not match"):
        store.delete(other_id, stored)

    assert (storage_dir / stored.storage_path).exists()


def test_read_and_delete_reject_traversal_metadata(
    cipher: EnvelopeCipher, tmp_path: Path
):
    store = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path / "storage")
    unsafe = StoredAsset(
        key_version=1,
        nonce=b"N" * 12,
        storage_path="memory-images/../../outside.bin",
        plaintext_size=len(PNG),
        ciphertext_size=len(PNG) + 16,
    )

    with pytest.raises(ValueError, match="storage path"):
        store.read(ASSET_ID, purpose="memory-image", asset=unsafe)
    with pytest.raises(ValueError, match="storage path"):
        store.delete(ASSET_ID, unsafe)


def test_failed_file_creation_cleans_up_partial_file_and_new_directories(
    cipher: EnvelopeCipher, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    storage_dir = tmp_path / "storage"
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)

    def fail_fdopen(*args: object, **kwargs: object):
        raise OSError("simulated file write failure")

    monkeypatch.setattr(assets.os, "fdopen", fail_fdopen)

    with pytest.raises(OSError, match="simulated file write failure"):
        store.write(ASSET_ID, purpose="memory-image", data=PNG)

    assert not (storage_dir / "memory-images" / ASSET_ID / "asset.bin").exists()
    assert not (storage_dir / "memory-images" / ASSET_ID).exists()
    assert (storage_dir / "memory-images").is_dir()


def test_write_does_not_follow_a_symlinked_memory_images_parent(
    cipher: EnvelopeCipher, tmp_path: Path
):
    storage_dir = tmp_path / "storage"
    external_dir = tmp_path / "external"
    external_dir.mkdir()
    sentinel = external_dir / "sentinel.bin"
    sentinel.write_bytes(b"do not create assets here")
    storage_dir.mkdir()
    (storage_dir / "memory-images").symlink_to(external_dir, target_is_directory=True)
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)

    with pytest.raises(OSError):
        store.write(ASSET_ID, purpose="memory-image", data=PNG)

    assert sentinel.read_bytes() == b"do not create assets here"
    assert not (external_dir / ASSET_ID).exists()


def test_read_does_not_follow_a_symlinked_memory_images_parent(
    cipher: EnvelopeCipher, tmp_path: Path
):
    storage_dir = tmp_path / "storage"
    external_dir = tmp_path / "external"
    external_asset_dir = external_dir / ASSET_ID
    external_asset_dir.mkdir(parents=True)
    payload = cipher.encrypt_bytes(ASSET_ID, "memory-image", b"external sentinel")
    sentinel = external_asset_dir / "asset.bin"
    sentinel.write_bytes(payload.ciphertext)
    storage_dir.mkdir()
    (storage_dir / "memory-images").symlink_to(external_dir, target_is_directory=True)
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)
    stored = StoredAsset(
        key_version=payload.key_version,
        nonce=payload.nonce,
        storage_path=f"memory-images/{ASSET_ID}/asset.bin",
        plaintext_size=len(b"external sentinel"),
        ciphertext_size=len(payload.ciphertext),
    )

    with pytest.raises(OSError):
        store.read(ASSET_ID, purpose="memory-image", asset=stored)

    assert sentinel.read_bytes() == payload.ciphertext


def test_delete_does_not_follow_a_symlinked_memory_images_parent(
    cipher: EnvelopeCipher, tmp_path: Path
):
    storage_dir = tmp_path / "storage"
    external_dir = tmp_path / "external"
    external_asset_dir = external_dir / ASSET_ID
    external_asset_dir.mkdir(parents=True)
    sentinel = external_asset_dir / "asset.bin"
    sentinel.write_bytes(b"do not delete this external sentinel")
    storage_dir.mkdir()
    (storage_dir / "memory-images").symlink_to(external_dir, target_is_directory=True)
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)
    stored = StoredAsset(
        key_version=1,
        nonce=b"N" * 12,
        storage_path=f"memory-images/{ASSET_ID}/asset.bin",
        plaintext_size=len(PNG),
        ciphertext_size=len(PNG) + 16,
    )

    with pytest.raises(OSError):
        store.delete(ASSET_ID, stored)

    assert sentinel.read_bytes() == b"do not delete this external sentinel"


def test_write_cleanup_does_not_follow_a_raced_in_asset_directory_symlink(
    cipher: EnvelopeCipher, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    storage_dir = tmp_path / "storage"
    external_dir = tmp_path / "external"
    external_dir.mkdir()
    sentinel = external_dir / "asset.bin"
    sentinel.write_bytes(b"do not delete this cleanup sentinel")
    store = EncryptedAssetStore(cipher=cipher, storage_dir=storage_dir)
    asset_dir = storage_dir / "memory-images" / ASSET_ID
    moved_asset_dir = storage_dir / "memory-images" / "moved-asset-dir"

    def replace_directory_with_symlink(*args: object, **kwargs: object):
        os.rename(asset_dir, moved_asset_dir)
        asset_dir.symlink_to(external_dir, target_is_directory=True)
        raise OSError("simulated file write failure")

    monkeypatch.setattr(assets.os, "fdopen", replace_directory_with_symlink)

    with pytest.raises(OSError, match="simulated file write failure"):
        store.write(ASSET_ID, purpose="memory-image", data=PNG)

    assert sentinel.read_bytes() == b"do not delete this cleanup sentinel"
