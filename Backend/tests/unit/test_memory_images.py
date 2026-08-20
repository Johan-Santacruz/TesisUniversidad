from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import Barrier, Event, Lock, Thread
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.ai.memory_images import GeneratedImage
from app.database import Database
from app.entities import (
    Analysis,
    AnalysisEvent,
    AuditLog,
    CaseRecord,
    Fact,
    MemoryImage,
    PurgeJob,
    User,
    Video,
)
from app.security.crypto import EnvelopeCipher
from app.services.assets import EncryptedAssetStore, StoredAsset
from app.services.audit import AuditService


DEMO_IMAGE = (
    Path(__file__).resolve().parents[2] / "app" / "data" / "demo-memory-image.png"
)


@dataclass
class CapturingAssetStore:
    writes: list[tuple[str, str, bytes]]

    def write(self, asset_id: str, purpose: str, data: bytes) -> StoredAsset:
        self.writes.append((asset_id, purpose, data))
        return StoredAsset(
            key_version=1,
            nonce=b"n" * 12,
            storage_path=f"memory-images/{asset_id}/asset.bin",
            plaintext_size=len(data),
            ciphertext_size=len(data) + 16,
        )


class WorkingAdapter:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def generate(self, prompt: str) -> GeneratedImage:
        return GeneratedImage(data=self.data, mime_type="image/png")


class BlockingAdapter:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.entered = Event()
        self.release = Event()
        self._lock = Lock()
        self.calls = 0

    def generate(self, prompt: str) -> GeneratedImage:
        with self._lock:
            self.calls += 1
        self.entered.set()
        assert self.release.wait(timeout=5)
        return GeneratedImage(data=self.data, mime_type="image/png")


class ProviderCrashed:
    def generate(self, prompt: str) -> GeneratedImage:
        raise RuntimeError("provider unavailable")


def _create_case(
    database: Database,
    cipher: EnvelopeCipher,
    *,
    is_demo: bool = False,
) -> tuple[str, User]:
    owner = User(
        id=str(uuid4()),
        email="owner@example.test",
        password_hash="hash",
        role="admin",
    )
    video = Video(
        id=str(uuid4()),
        owner_id=owner.id,
        filename="case.mp4",
        media_type="video/mp4",
        size_bytes=1,
        chunk_size=1,
        key_version=1,
        is_demo=is_demo,
    )
    analysis = Analysis(id=str(uuid4()), video_id=video.id, requested_by_id=owner.id)
    case = CaseRecord(id=str(uuid4()), analysis_id=analysis.id, video_id=video.id)
    classification = {
        "classification": {
            "category": {"label": "Desplazamiento"},
            "subcategory": {"label": "Desplazamiento forzado"},
        }
    }
    classification_payload = cipher.encrypt_json(
        f"{analysis.id}:1", "analysis_event", classification
    )
    event = AnalysisEvent(
        analysis_id=analysis.id,
        sequence=1,
        stage="classification",
        state="completed",
        key_version=classification_payload.key_version,
        nonce=classification_payload.nonce,
        ciphertext=classification_payload.ciphertext,
    )
    facts: list[Fact] = []
    for key, value in (
        ("origin_setting", "rural"),
        ("reception_setting", "urbano"),
        ("current_location", "Popayán, Cauca"),
    ):
        fact_id = str(uuid4())
        payload = cipher.encrypt_json(
            fact_id, "fact", {"id": fact_id, "key": key, "value": value}
        )
        facts.append(
            Fact(
                id=fact_id,
                case_id=case.id,
                fact_type=key,
                origin="mentioned",
                verification_status="confirmed",
                confidence_band="high",
                key_version=payload.key_version,
                nonce=payload.nonce,
                ciphertext=payload.ciphertext,
            )
    )
    with database.session() as session:
        session.add(owner)
        session.flush()
        session.add(video)
        session.flush()
        session.add(analysis)
        session.flush()
        session.add(case)
        session.flush()
        session.add_all([event, *facts])
    return case.id, owner


def _service(database, cipher, assets, adapter, *, purges=None):
    from app.services.memory_images import MemoryImageService

    return MemoryImageService(
        database=database,
        cipher=cipher,
        assets=assets,
        adapter=adapter,
        audit=AuditService(cipher),
        model="gpt-image-2",
        prompt_version="memory-image-v1",
        demo_image_path=DEMO_IMAGE,
        purges=purges,
    )


def _images(database: Database, case_id: str) -> list[MemoryImage]:
    with database.session() as session:
        return list(
            session.scalars(
                select(MemoryImage)
                .where(MemoryImage.case_id == case_id)
                .order_by(MemoryImage.generation)
            )
        )


def test_initial_generation_encrypts_context_and_stores_pending_image(cipher):
    database = Database("sqlite://")
    database.create_schema()
    case_id, _ = _create_case(database, cipher)
    assets = CapturingAssetStore(writes=[])
    image_bytes = DEMO_IMAGE.read_bytes()

    _service(database, cipher, assets, WorkingAdapter(image_bytes)).generate_initial(
        case_id, is_demo=False
    )

    [image] = _images(database, case_id)
    assert image.generation == 1
    assert image.status == "pending_review"
    assert image.storage_path == f"memory-images/{image.id}/asset.bin"
    assert assets.writes == [(image.id, "memory-image", image_bytes)]
    assert b"Popay\xc3\xa1n" not in image.ciphertext
    assert b"Desplazamiento" not in image.ciphertext
    metadata = cipher.decrypt_json(image.id, "memory_image_metadata", image.encrypted_payload())
    assert metadata["context"]["setting"] == "rural a urbano"


def test_regeneration_rejects_prior_generation_and_creates_next_generation(cipher):
    database = Database("sqlite://")
    database.create_schema()
    case_id, actor = _create_case(database, cipher)
    assets = CapturingAssetStore(writes=[])
    service = _service(database, cipher, assets, WorkingAdapter(DEMO_IMAGE.read_bytes()))
    service.generate_initial(case_id, is_demo=False)

    regenerated = service.regenerate(case_id, actor=actor)

    first, second = _images(database, case_id)
    assert (first.generation, first.status) == (1, "rejected")
    assert (second.generation, second.status) == (2, "pending_review")
    assert regenerated.id == second.id


def test_schema_rejects_a_second_active_memory_image_for_the_same_case(cipher):
    database = Database("sqlite://")
    database.create_schema()
    case_id, _ = _create_case(database, cipher)
    assets = CapturingAssetStore(writes=[])
    _service(database, cipher, assets, adapter=None).generate_initial(
        case_id, is_demo=True
    )
    image_id = str(uuid4())
    payload = cipher.encrypt_json(image_id, "memory_image_metadata", {})

    with pytest.raises(IntegrityError):
        with database.session() as session:
            session.add(
                MemoryImage(
                    id=image_id,
                    case_id=case_id,
                    generation=2,
                    status="generating",
                    provider="demo",
                    model="gpt-image-2",
                    prompt_version="memory-image-v1",
                    context_hash="0" * 64,
                    key_version=payload.key_version,
                    nonce=payload.nonce,
                    ciphertext=payload.ciphertext,
                )
            )
            session.flush()


def test_initial_generation_claim_allows_only_one_concurrent_provider_call(
    cipher, tmp_path, monkeypatch
):
    database = Database(f"sqlite:///{tmp_path / 'memory-images.db'}")
    database.create_schema()
    case_id, _ = _create_case(database, cipher)
    assets = CapturingAssetStore(writes=[])
    adapter = BlockingAdapter(DEMO_IMAGE.read_bytes())
    service = _service(database, cipher, assets, adapter)
    errors: list[BaseException] = []
    race = Barrier(2)
    original_visual_context = service._visual_context

    def synchronize_claims(session, case):
        race.wait(timeout=5)
        return original_visual_context(session, case)

    monkeypatch.setattr(service, "_visual_context", synchronize_claims)

    def generate() -> None:
        try:
            service.generate_initial(case_id, is_demo=False)
        except BaseException as exc:
            errors.append(exc)

    first = Thread(target=generate)
    second = Thread(target=generate)
    first.start()
    second.start()
    assert adapter.entered.wait(timeout=5)
    adapter.release.set()
    first.join(timeout=5)
    second.join(timeout=5)

    assert not first.is_alive()
    assert not second.is_alive()
    assert errors == []
    assert adapter.calls == 1
    assert [(image.generation, image.status) for image in _images(database, case_id)] == [
        (1, "pending_review")
    ]


def test_regeneration_returns_active_generation_without_a_second_provider_call(cipher, tmp_path):
    database = Database(f"sqlite:///{tmp_path / 'memory-images.db'}")
    database.create_schema()
    case_id, actor = _create_case(database, cipher)
    assets = CapturingAssetStore(writes=[])
    adapter = BlockingAdapter(DEMO_IMAGE.read_bytes())
    service = _service(database, cipher, assets, adapter)
    service.generate_initial(case_id, is_demo=True)
    results: list[MemoryImage] = []
    errors: list[BaseException] = []

    def regenerate() -> None:
        try:
            results.append(service.regenerate(case_id, actor=actor))
        except BaseException as exc:
            errors.append(exc)

    first = Thread(target=regenerate)
    first.start()
    assert adapter.entered.wait(timeout=5)
    second = Thread(target=regenerate)
    second.start()
    second.join(timeout=5)
    adapter.release.set()
    first.join(timeout=5)

    assert not first.is_alive()
    assert not second.is_alive()
    assert errors == []
    assert adapter.calls == 1
    assert len({image.id for image in results}) == 1
    first_image, second_image = _images(database, case_id)
    assert (first_image.generation, first_image.status) == (1, "rejected")
    assert (second_image.generation, second_image.status) == (2, "pending_review")


def test_regeneration_of_a_demo_case_uses_the_local_demo_image(cipher):
    database = Database("sqlite://")
    database.create_schema()
    case_id, actor = _create_case(database, cipher, is_demo=True)
    assets = CapturingAssetStore(writes=[])
    service = _service(database, cipher, assets, adapter=None)
    service.generate_initial(case_id, is_demo=True)

    regenerated = service.regenerate(case_id, actor=actor)

    first, second = _images(database, case_id)
    assert (first.generation, first.status) == (1, "rejected")
    assert (second.generation, second.status) == (2, "pending_review")
    assert regenerated.id == second.id
    assert len(assets.writes) == 2


def test_missing_provider_marks_uploaded_image_failed_without_asset_write(cipher):
    database = Database("sqlite://")
    database.create_schema()
    case_id, _ = _create_case(database, cipher)
    assets = CapturingAssetStore(writes=[])

    _service(database, cipher, assets, None).generate_initial(case_id, is_demo=False)

    [image] = _images(database, case_id)
    assert (image.status, image.failure_code) == (
        "failed",
        "image_provider_not_configured",
    )
    assert assets.writes == []


def test_provider_error_is_failed_with_encrypted_diagnostic(cipher):
    database = Database("sqlite://")
    database.create_schema()
    case_id, _ = _create_case(database, cipher)
    assets = CapturingAssetStore(writes=[])

    _service(database, cipher, assets, ProviderCrashed()).generate_initial(
        case_id, is_demo=False
    )

    [image] = _images(database, case_id)
    assert (image.status, image.failure_code) == ("failed", "image_generation_failed")
    assert b"RuntimeError" not in image.ciphertext
    metadata = cipher.decrypt_json(image.id, "memory_image_metadata", image.encrypted_payload())
    assert metadata["diagnostic"] == "RuntimeError"


def test_lost_image_finalizer_keeps_a_durable_asset_purge_when_cleanup_fails(cipher, tmp_path, monkeypatch):
    """Breaks if deletion racing image finalization can orphan ciphertext without a job."""
    from app.services.purges import PurgeService

    database = Database(f"sqlite:///{tmp_path / 'lost-image.db'}")
    database.create_schema()
    case_id, _ = _create_case(database, cipher)
    assets = EncryptedAssetStore(cipher=cipher, storage_dir=tmp_path)
    purges = PurgeService(database=database, cipher=cipher, assets=assets, storage_dir=tmp_path)
    service = _service(
        database,
        cipher,
        assets,
        WorkingAdapter(DEMO_IMAGE.read_bytes()),
        purges=purges,
    )
    claim = service._claim_generation(case_id, is_demo=False, actor=None)
    assert claim is not None
    stored = assets.write(claim.image_id, "memory-image", DEMO_IMAGE.read_bytes())
    with database.session() as session:
        image = session.get(MemoryImage, claim.image_id)
        assert image is not None
        session.delete(image)

    original_purge = purges._purge_asset
    monkeypatch.setattr(
        purges,
        "_purge_asset",
        lambda _payload: (_ for _ in ()).throw(OSError("filesystem unavailable")),
    )
    with pytest.raises(KeyError):
        service._mark_pending(
            claim.image_id,
            stored,
            GeneratedImage(data=DEMO_IMAGE.read_bytes(), mime_type="image/png"),
            1536,
            864,
        )

    with database.session() as session:
        assert session.query(PurgeJob).count() == 1
    assert (tmp_path / stored.storage_path).exists()
    monkeypatch.setattr(purges, "_purge_asset", original_purge)
    assert purges.process_pending() == 1
    assert not (tmp_path / stored.storage_path).exists()


def test_only_one_stale_decision_can_change_a_pending_memory_image(cipher):
    """A conditional update must reject a second reviewer with a stale row."""
    from app.services.memory_images import MemoryImageConflictError

    database = Database("sqlite://")
    database.create_schema()
    case_id, actor = _create_case(database, cipher)
    service = _service(
        database, cipher, CapturingAssetStore(writes=[]), WorkingAdapter(DEMO_IMAGE.read_bytes())
    )
    service.generate_initial(case_id, is_demo=False)

    with database.session() as winner, database.session() as stale:
        winning_image = service.active_for_case(winner, case_id)
        stale_image = service.active_for_case(stale, case_id)
        assert winning_image is not None
        assert stale_image is not None

        changed = service.decide(
            winner, image=winning_image, action="approve", actor=actor
        )
        assert changed.status == "approved"
        winner.commit()

        with pytest.raises(MemoryImageConflictError):
            service.decide(stale, image=stale_image, action="reject", actor=actor)

    with database.session() as session:
        image = service.active_for_case(session, case_id)
        assert image is not None
        actions = list(
            session.scalars(
                select(AuditLog.action).where(AuditLog.entity_id == image.id)
            )
        )
    assert image.status == "approved"
    assert actions.count("memory_image_approved") == 1
    assert "memory_image_rejected" not in actions


def test_stale_decision_cannot_approve_a_generation_rejected_by_regeneration(cipher):
    """A decision must target the latest pending generation, never an old row."""
    from app.services.memory_images import MemoryImageConflictError

    database = Database("sqlite://")
    database.create_schema()
    case_id, actor = _create_case(database, cipher)
    service = _service(
        database, cipher, CapturingAssetStore(writes=[]), WorkingAdapter(DEMO_IMAGE.read_bytes())
    )
    service.generate_initial(case_id, is_demo=False)

    with database.session() as stale:
        stale_image = service.active_for_case(stale, case_id)
        assert stale_image is not None
        regenerated = service.regenerate(case_id, actor)

        with pytest.raises(MemoryImageConflictError):
            service.decide(stale, image=stale_image, action="approve", actor=actor)

    first, second = _images(database, case_id)
    assert (first.generation, first.status) == (1, "rejected")
    assert (second.id, second.generation, second.status) == (
        regenerated.id,
        2,
        "pending_review",
    )
