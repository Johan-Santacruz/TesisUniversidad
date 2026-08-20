from pathlib import Path
import os
import sqlite3
import threading
import time
from uuid import uuid4

from sqlalchemy import select

from app.database import Database
from app.entities import PurgeJob
from app.security.crypto import EnvelopeCipher
from app.services.assets import EncryptedAssetStore, StoredAsset


def _locked_sqlite_database(tmp_path, name: str):
    path = tmp_path / f"{name}.db"
    database = Database(f"sqlite:///{path}?timeout=0.01")
    database.create_schema()
    lock = sqlite3.connect(path, timeout=0)
    lock.execute("BEGIN IMMEDIATE")
    return database, lock


def test_purge_job_payload_is_encrypted_and_is_deleted_only_after_asset_cleanup(tmp_path):
    """Breaks if a purge intent loses its retryable encrypted descriptor."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    asset_id = str(uuid4())
    stored = assets.write(asset_id, "memory-image", b"fixture")
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)

    with database.session() as session:
        purges.enqueue_asset(session, asset_id=asset_id, asset=stored)

    with database.session() as session:
        [job] = list(session.scalars(select(PurgeJob)))
        assert asset_id.encode() not in job.ciphertext
        assert stored.storage_path.encode() not in job.ciphertext

    assert purges.process_pending() == 1
    assert not (tmp_path / stored.storage_path).exists()
    with database.session() as session:
        assert list(session.scalars(select(PurgeJob))) == []


def test_failed_asset_purge_is_retained_and_succeeds_on_a_later_retry(tmp_path, monkeypatch):
    """Breaks if a transient filesystem failure loses the only cleanup intent."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    asset_id = str(uuid4())
    stored = assets.write(asset_id, "memory-image", b"fixture")
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    with database.session() as session:
        purges.enqueue_asset(session, asset_id=asset_id, asset=stored)

    original_delete = assets.delete
    monkeypatch.setattr(assets, "delete", lambda *_: (_ for _ in ()).throw(OSError("busy")))
    assert purges.process_pending() == 0
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1
    monkeypatch.setattr(assets, "delete", original_delete)

    assert purges.process_pending() == 1
    assert not (tmp_path / stored.storage_path).exists()


def test_cross_referenced_video_descriptor_is_retained_without_touching_other_video(tmp_path):
    """Breaks if corrupted purge metadata can erase another video's chunk."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    expected_video_id, foreign_video_id = str(uuid4()), str(uuid4())
    foreign_chunk = tmp_path / "videos" / foreign_video_id / "00000000.bin"
    foreign_chunk.parent.mkdir(parents=True)
    foreign_chunk.write_bytes(b"foreign")

    with database.session() as session:
        purges.enqueue_video(
            session,
            video_id=expected_video_id,
            storage_paths=[f"videos/{foreign_video_id}/00000000.bin"],
        )

    assert purges.process_pending() == 0
    assert foreign_chunk.read_bytes() == b"foreign"
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1


def test_video_purge_never_follows_a_replaced_video_directory_symlink(tmp_path):
    """Breaks if a path-based purge can unlink a file outside managed storage."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    video_id = str(uuid4())
    external = tmp_path / "external"
    external.mkdir()
    sentinel = external / "00000000.bin"
    sentinel.write_bytes(b"must survive")
    videos = tmp_path / "videos"
    videos.mkdir()
    (videos / video_id).symlink_to(external, target_is_directory=True)

    with database.session() as session:
        purges.enqueue_video(
            session,
            video_id=video_id,
            storage_paths=[f"videos/{video_id}/00000000.bin"],
        )

    assert purges.process_pending() == 0
    assert sentinel.read_bytes() == b"must survive"
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1


def test_video_purge_never_follows_the_videos_root_symlink(tmp_path):
    """Breaks if replacing the managed videos root escapes descriptor validation."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    video_id = str(uuid4())
    external = tmp_path / "external-videos" / video_id
    external.mkdir(parents=True)
    sentinel = external / "00000000.bin"
    sentinel.write_bytes(b"must survive")
    (tmp_path / "videos").symlink_to(external.parent, target_is_directory=True)

    with database.session() as session:
        purges.enqueue_video(
            session,
            video_id=video_id,
            storage_paths=[f"videos/{video_id}/00000000.bin"],
        )

    assert purges.process_pending() == 0
    assert sentinel.read_bytes() == b"must survive"
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1


def test_expired_purge_lease_can_be_reclaimed_without_duplicate_completion(tmp_path):
    """Breaks if abandoned work wedges the queue or two workers complete one job."""
    from datetime import datetime, timedelta, timezone

    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    asset_id = str(uuid4())
    stored = assets.write(asset_id, "memory-image", b"fixture")
    with database.session() as session:
        purges.enqueue_asset(session, asset_id=asset_id, asset=stored)
        session.flush()
        job = session.scalar(select(PurgeJob))
        assert job is not None
        job.lease_token = "abandoned"
        job.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)

    assert purges.process_pending() == 1
    assert purges.process_pending() == 0
    assert not (tmp_path / stored.storage_path).exists()


def test_startup_retries_a_previously_failed_purge_without_failing_the_app(
    settings_factory, monkeypatch
):
    """Breaks if a failed cleanup needs a public endpoint instead of startup/retention."""
    from fastapi.testclient import TestClient

    from app.main import create_app
    from app.services.purges import PurgeService

    settings = settings_factory(demo_users_enabled=False)
    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database(settings.database_url)
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=settings.storage_dir)
    asset_id = str(uuid4())
    stored = assets.write(asset_id, "memory-image", b"fixture")
    purges = PurgeService(
        database=database, cipher=cipher, assets=assets, storage_dir=settings.storage_dir
    )
    with database.session() as session:
        purges.enqueue_asset(session, asset_id=asset_id, asset=stored)
    original_delete = assets.delete
    monkeypatch.setattr(assets, "delete", lambda *_: (_ for _ in ()).throw(OSError("busy")))
    assert purges.process_pending() == 0
    monkeypatch.setattr(assets, "delete", original_delete)

    with TestClient(create_app(settings=settings, database=database)) as app_client:
        assert app_client.get("/health").status_code == 200

    assert not (settings.storage_dir / stored.storage_path).exists()
    with database.session() as session:
        assert session.query(PurgeJob).count() == 0
    database.dispose()


def test_malformed_encrypted_job_does_not_block_later_valid_job(tmp_path):
    """Breaks if one bad ciphertext aborts the rest of the durable purge queue."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    bad_id, good_id = str(uuid4()), str(uuid4())
    stored = assets.write(good_id, "memory-image", b"fixture")

    with database.session() as session:
        purges.enqueue_asset(session, asset_id=bad_id, asset=stored)
        session.flush()
        bad = session.get(PurgeJob, session.scalar(select(PurgeJob.id).order_by(PurgeJob.created_at)))
        assert bad is not None
        bad.ciphertext = b"tampered"
        purges.enqueue_asset(session, asset_id=good_id, asset=stored)

    assert purges.process_pending() == 1
    assert not (tmp_path / stored.storage_path).exists()
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1


def test_enqueue_asset_now_retries_a_transient_sqlite_write_lock_before_processing(tmp_path):
    """Breaks if a lost image finalizer drops its only purge descriptor on SQLITE_BUSY."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database, lock = _locked_sqlite_database(tmp_path, "asset-lock")
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    asset_id = str(uuid4())
    stored = assets.write(asset_id, "memory-image", b"fixture")
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    outcome: list[BaseException] = []

    worker = threading.Thread(
        target=lambda: _capture(outcome, lambda: purges.enqueue_asset_now(asset_id=asset_id, asset=stored))
    )
    worker.start()
    time.sleep(0.1)
    lock.rollback()
    lock.close()
    worker.join(timeout=5)

    assert not worker.is_alive()
    assert outcome == []
    assert purges.process_pending() == 1
    assert not (tmp_path / stored.storage_path).exists()


def test_enqueue_video_now_retries_a_transient_sqlite_write_lock_before_processing(tmp_path):
    """Breaks if rolled-back video encryption loses its only purge descriptor on SQLITE_BUSY."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database, lock = _locked_sqlite_database(tmp_path, "video-lock")
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    video_id = str(uuid4())
    chunk = tmp_path / "videos" / video_id / "00000000.bin"
    chunk.parent.mkdir(parents=True)
    chunk.write_bytes(b"ciphertext")
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    outcome: list[BaseException] = []

    worker = threading.Thread(
        target=lambda: _capture(
            outcome,
            lambda: purges.enqueue_video_now(
                video_id=video_id,
                storage_paths=[f"videos/{video_id}/00000000.bin"],
            ),
        )
    )
    worker.start()
    time.sleep(0.1)
    lock.rollback()
    lock.close()
    worker.join(timeout=5)

    assert not worker.is_alive()
    assert outcome == []
    assert purges.process_pending() == 1
    assert not chunk.exists()


def test_two_workers_claim_one_purge_job_and_perform_one_filesystem_action(tmp_path, monkeypatch):
    """Breaks if two workers can both act on the same ciphertext before completion."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database(f"sqlite:///{tmp_path / 'purge-race.db'}")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    asset_id = str(uuid4())
    stored = assets.write(asset_id, "memory-image", b"fixture")
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    with database.session() as session:
        purges.enqueue_asset(session, asset_id=asset_id, asset=stored)

    actions = 0
    actions_lock = threading.Lock()
    entered = threading.Event()
    release = threading.Event()
    original = purges._purge_asset

    def block_first_action(payload):
        nonlocal actions
        with actions_lock:
            actions += 1
        entered.set()
        assert release.wait(timeout=5)
        original(payload)

    monkeypatch.setattr(purges, "_purge_asset", block_first_action)
    results: list[int] = []
    first = threading.Thread(target=lambda: results.append(purges.process_pending()))
    second = threading.Thread(target=lambda: results.append(purges.process_pending()))
    first.start()
    assert entered.wait(timeout=5)
    second.start()
    release.set()
    first.join(timeout=5)
    second.join(timeout=5)

    assert not first.is_alive()
    assert not second.is_alive()
    assert actions == 1
    assert sorted(results) == [0, 1]
    assert not (tmp_path / stored.storage_path).exists()


def test_video_purge_retains_job_when_uuid_directory_is_replaced_after_open(tmp_path, monkeypatch):
    """Breaks if an opened video directory can be swapped for an external symlink."""
    from app.services.purges import PurgeService

    cipher = EnvelopeCipher(keys={1: b"E" * 32}, current_version=1)
    database = Database("sqlite://")
    database.create_schema()
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    video_id = str(uuid4())
    directory = tmp_path / "videos" / video_id
    directory.mkdir(parents=True)
    (directory / "00000000.bin").write_bytes(b"ciphertext")
    external = tmp_path / "external"
    external.mkdir()
    sentinel = external / "00000000.bin"
    sentinel.write_bytes(b"must survive")
    with database.session() as session:
        purges.enqueue_video(
            session,
            video_id=video_id,
            storage_paths=[f"videos/{video_id}/00000000.bin"],
        )

    original_unlink = os.unlink
    swapped = False

    def replace_after_open(name, *args, **kwargs):
        nonlocal swapped
        if name == "00000000.bin" and not swapped and kwargs.get("dir_fd") is not None:
            swapped = True
            directory.rename(tmp_path / "parked-video")
            directory.symlink_to(external, target_is_directory=True)
        return original_unlink(name, *args, **kwargs)

    monkeypatch.setattr(os, "unlink", replace_after_open)
    assert purges.process_pending() == 0
    assert swapped
    assert sentinel.read_bytes() == b"must survive"
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1


def _capture(outcome: list[BaseException], action) -> None:
    try:
        action()
    except BaseException as exc:  # pragma: no cover - asserted by the caller
        outcome.append(exc)
