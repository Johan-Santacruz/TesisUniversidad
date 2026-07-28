from __future__ import annotations

from cryptography.exceptions import InvalidTag
import pytest


def test_encrypted_chunks_reconstruct_a_cross_chunk_range(
    chunk_cipher, tmp_path, tiny_video_bytes
):
    manifest = chunk_cipher.encrypt_bytes(
        "video-1",
        tiny_video_bytes,
        tmp_path,
        chunk_size=1024,
    )

    restored = chunk_cipher.read_range("video-1", manifest, 777, 2500)

    assert restored == tiny_video_bytes[777:2501]
    assert len(manifest.chunks) > 2


def test_chunk_files_never_contain_plaintext(
    chunk_cipher, tmp_path, tiny_video_bytes
):
    manifest = chunk_cipher.encrypt_bytes(
        "video-1",
        tiny_video_bytes,
        tmp_path,
        chunk_size=1024,
    )

    encrypted_files = b"".join(chunk.path.read_bytes() for chunk in manifest.chunks)

    assert tiny_video_bytes[:512] not in encrypted_files
    assert b"ftypmp42" not in encrypted_files


def test_tampered_chunk_is_rejected(chunk_cipher, tmp_path, tiny_video_bytes):
    manifest = chunk_cipher.encrypt_bytes(
        "video-1",
        tiny_video_bytes,
        tmp_path,
        chunk_size=1024,
    )
    first = manifest.chunks[0]
    damaged = bytearray(first.path.read_bytes())
    damaged[-1] ^= 1
    first.path.write_bytes(bytes(damaged))

    with pytest.raises(InvalidTag):
        chunk_cipher.read_range("video-1", manifest, 0, 128)


def test_range_bounds_are_validated(chunk_cipher, tmp_path, tiny_video_bytes):
    manifest = chunk_cipher.encrypt_bytes(
        "video-1",
        tiny_video_bytes,
        tmp_path,
        chunk_size=1024,
    )

    with pytest.raises(ValueError, match="range"):
        chunk_cipher.read_range("video-1", manifest, -1, 20)
    with pytest.raises(ValueError, match="range"):
        chunk_cipher.read_range(
            "video-1",
            manifest,
            len(tiny_video_bytes),
            len(tiny_video_bytes) + 1,
        )

