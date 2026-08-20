from __future__ import annotations

from io import BytesIO
import json
from datetime import datetime
import subprocess
from threading import Barrier, Event, Lock, Thread

import pytest
from sqlalchemy import event, select

from app.entities import AuditLog, CaseRecord, MemoryImage, PurgeJob, RenderedVideo, User, Video
from tests.integration.case_helpers import create_validator, login


class _CopyRenderer:
    def __init__(self, outputs: list[bytes], *, failures: int = 0) -> None:
        self.outputs = outputs
        self.failures = failures
        self.calls = 0

    def render(self, _video, _image, target) -> None:
        self.calls += 1
        if self.calls <= self.failures:
            raise RuntimeError("renderer unavailable")
        target.write(self.outputs[self.calls - self.failures - 1])
        target.seek(0)


class _BlockingCopyRenderer(_CopyRenderer):
    def __init__(self, output: bytes) -> None:
        super().__init__([output])
        self.entered = Event()
        self.release = Event()
        self._lock = Lock()

    def render(self, video, image, target) -> None:
        with self._lock:
            self.calls += 1
        self.entered.set()
        assert self.release.wait(timeout=5)
        target.write(self.outputs[0])
        target.seek(0)


class _ClaimStealingRenderer(_CopyRenderer):
    def __init__(self, database, image_id: str, output: bytes) -> None:
        super().__init__([output])
        self.database = database
        self.image_id = image_id

    def render(self, video, image, target) -> None:
        with self.database.session() as session:
            rendered = session.scalar(
                select(RenderedVideo).where(RenderedVideo.memory_image_id == self.image_id)
            )
            assert rendered is not None
            rendered.render_attempt_id = "lost-finalization-claim"
        super().render(video, image, target)


def _create_owned_demo_case(client) -> tuple[str, str]:
    login(client, "admin@senda.local", "Cambiar-Esta-Clave-2026!")
    owner_email = "propietario.imagen@senda.local"
    owner_password = "Clave-Propietario-2026!"
    created = client.post(
        "/api/v1/users",
        json={
            "email": owner_email,
            "password": owner_password,
            "role": "operador",
        },
    )
    assert created.status_code == 201
    login(client, owner_email, owner_password)
    video = client.post("/api/v1/videos/demo").json()
    analysis = client.post(f"/api/v1/videos/{video['id']}/analyses").json()
    stream = client.get(analysis["events_url"]).text
    route_event = next(
        json.loads(line.removeprefix("data: "))
        for line in stream.splitlines()
        if line.startswith("data: ")
        and json.loads(line.removeprefix("data: "))["stage"] == "routes"
    )
    return route_event["payload"]["case_id"], owner_password


def _active_memory_image(client, case_id: str) -> dict[str, object]:
    response = client.get(f"/api/v1/cases/{case_id}")
    assert response.status_code == 200
    image = response.json()["memory_image"]
    assert image is not None
    return image


def test_case_owner_can_read_active_image_but_cannot_mutate_it(client):
    case_id, _ = _create_owned_demo_case(client)

    image = _active_memory_image(client, case_id)
    assert image["status"] == "pending_review"
    assert image["image_url"] == f"/api/v1/cases/{case_id}/memory-image/content"
    content = client.get(image["image_url"])
    assert content.status_code == 200
    assert content.headers["cache-control"] == "private, no-store"
    assert content.headers["content-type"] == "image/png"
    assert content.headers["content-length"] == str(len(content.content))

    assert client.post(
        f"/api/v1/cases/{case_id}/memory-image/regenerate"
    ).status_code == 403
    assert client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "approve"},
    ).status_code == 403


def test_unrelated_operator_cannot_read_memory_image_content(client):
    case_id, _ = _create_owned_demo_case(client)
    login(client, "admin@senda.local", "Cambiar-Esta-Clave-2026!")
    created = client.post(
        "/api/v1/users",
        json={
            "email": "ajeno.imagen@senda.local",
            "password": "Clave-Ajeno-2026!",
            "role": "operador",
        },
    )
    assert created.status_code == 201
    login(client, "ajeno.imagen@senda.local", "Clave-Ajeno-2026!")

    response = client.get(f"/api/v1/cases/{case_id}/memory-image/content")

    assert response.status_code == 403


def test_validator_regenerates_demo_image_as_generation_two(client):
    case_id, _ = _create_owned_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    response = client.post(f"/api/v1/cases/{case_id}/memory-image/regenerate")

    assert response.status_code == 200
    image = response.json()["memory_image"]
    assert image["generation"] == 2
    assert image["status"] == "pending_review"
    assert image["image_url"] == f"/api/v1/cases/{case_id}/memory-image/content"
    with client.app.state.database.session() as session:
        audit = session.scalar(
            select(AuditLog).where(
                AuditLog.entity_id == image["id"],
                AuditLog.action == "memory_image_regenerated",
            )
        )
        assert audit is not None
        assert client.app.state.audit.read_details(audit) == {"generation": 2}


def test_rejected_memory_image_is_not_served_and_decision_cannot_repeat(client):
    case_id, _ = _create_owned_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    rejected = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "reject"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["memory_image"]["status"] == "rejected"
    assert client.get(
        f"/api/v1/cases/{case_id}/memory-image/content"
    ).status_code == 404
    repeated = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "reject"},
    )
    assert repeated.status_code == 409


def test_validator_approval_is_audited_without_prompt_or_context(client):
    case_id, _ = _create_owned_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    approved = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "approve"},
    )

    assert approved.status_code == 200
    image = approved.json()["memory_image"]
    assert image["status"] == "approved"
    assert image["reviewed_at"]
    assert client.get(
        f"/api/v1/cases/{case_id}/memory-image/content"
    ).status_code == 200
    database = client.app.state.database
    with database.session() as session:
        audit = session.scalar(
            select(AuditLog).where(
                AuditLog.entity_id == image["id"],
                AuditLog.action == "memory_image_approved",
            )
        )
        assert audit is not None
        assert b"prompt" not in audit.ciphertext
        details = client.app.state.audit.read_details(audit)
        stored_image = session.get(MemoryImage, image["id"])
        assert stored_image is not None
        metadata = client.app.state.cipher.decrypt_json(
            stored_image.id,
            "memory_image_metadata",
            stored_image.encrypted_payload(),
        )
    assert details == {"generation": 1}
    assert metadata["decision"]["action"] == "approve"
    assert metadata["decision"]["reviewed_by_id"] == audit.actor_id
    assert datetime.fromisoformat(metadata["decision"]["reviewed_at"]) == datetime.fromisoformat(
        image["reviewed_at"]
    )


def test_approval_creates_one_protected_derived_video(client):
    """Breaks if approval does not persist and expose a distinct ready derivative."""
    case_id, _ = _create_owned_demo_case(client)
    original = _active_memory_image(client, case_id)
    with client.app.state.database.session() as session:
        case = session.get(CaseRecord, case_id)
        assert case is not None
        original_video = session.get(Video, case.video_id)
        assert original_video is not None
        original_bytes = client.app.state.videos.open_plain_bytes(original_video)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    approved = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "approve"},
    )

    assert approved.status_code == 200
    rendered_url = approved.json()["memory_image"]["rendered_video_url"]
    assert rendered_url == f"/api/v1/cases/{case_id}/rendered-video/stream"
    with client.app.state.database.session() as session:
        rendered = session.scalar(
            select(RenderedVideo).where(RenderedVideo.memory_image_id == original["id"])
        )
        assert rendered is not None
        assert rendered.status == "ready"
        assert rendered.video_id is not None
        derivative = session.get(Video, rendered.video_id)
        assert derivative is not None
        assert derivative.status == "derived"
        assert derivative.id != original_video.id
        assert derivative.delete_after == original_video.delete_after
        unchanged_original = session.get(Video, original_video.id)
        assert unchanged_original is not None
        assert client.app.state.videos.open_plain_bytes(unchanged_original) == original_bytes
    full = client.get(rendered_url)
    assert full.status_code == 200
    decoded = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0",
            "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-",
        ],
        input=full.content,
        capture_output=True,
        check=False,
    )
    assert decoded.returncode == 0, decoded.stderr.decode()
    partial = client.get(rendered_url, headers={"Range": "bytes=0-31"})
    assert partial.status_code == 206
    assert partial.headers["content-range"] == f"bytes 0-31/{len(full.content)}"
    with client.app.state.database.session() as session:
        assert session.scalar(
            select(AuditLog).where(
                AuditLog.entity_id == rendered.video_id,
                AuditLog.action == "video_uploaded",
            )
        ) is None
    login(client, "admin@senda.local", "Cambiar-Esta-Clave-2026!")
    created = client.post(
        "/api/v1/users",
        json={
            "email": "ajeno.derivado@senda.local",
            "password": "Clave-Ajeno-Derivado-2026!",
            "role": "operador",
        },
    )
    assert created.status_code == 201
    login(client, "ajeno.derivado@senda.local", "Clave-Ajeno-Derivado-2026!")
    assert client.get(rendered_url).status_code == 403


def test_render_retry_is_authorized_idempotent_and_reports_status(
    client, valid_mp4_bytes
):
    """Breaks if a failed approved render cannot be retried safely."""
    case_id, owner_password = _create_owned_demo_case(client)
    renderer = _CopyRenderer([valid_mp4_bytes], failures=1)
    client.app.state.memory_images.renderer = renderer
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    failed = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "approve"},
    )
    assert failed.status_code == 200
    assert failed.json()["memory_image"]["render_status"] == "failed"
    login(client, "propietario.imagen@senda.local", owner_password)
    assert client.post(f"/api/v1/cases/{case_id}/rendered-video/retry").status_code == 403
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    retried = client.post(f"/api/v1/cases/{case_id}/rendered-video/retry")

    assert retried.status_code == 200
    assert retried.json()["memory_image"]["render_status"] == "ready"
    assert retried.json()["memory_image"]["rendered_video_url"] == (
        f"/api/v1/cases/{case_id}/rendered-video/stream"
    )
    ready_retry = client.post(f"/api/v1/cases/{case_id}/rendered-video/retry")
    assert ready_retry.status_code == 200
    assert ready_retry.json()["memory_image"]["render_status"] == "ready"
    assert renderer.calls == 2


def test_rendered_stream_uses_only_the_latest_memory_image_generation(
    client, media_fixture_factory
):
    """Breaks if a new approved image can stream a prior derivative."""
    case_id, _ = _create_owned_demo_case(client)
    first_bytes = media_fixture_factory(duration_seconds=0.4, color="red")
    second_bytes = media_fixture_factory(duration_seconds=0.6, color="green")
    client.app.state.memory_images.renderer = _CopyRenderer([first_bytes, second_bytes])
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    first = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision", json={"action": "approve"}
    )
    assert first.status_code == 200
    regenerated = client.post(f"/api/v1/cases/{case_id}/memory-image/regenerate")
    assert regenerated.status_code == 200
    second = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision", json={"action": "approve"}
    )
    assert second.status_code == 200

    stream = client.get(f"/api/v1/cases/{case_id}/rendered-video/stream")
    assert stream.status_code == 200
    assert stream.content == second_bytes


def test_concurrent_render_claim_creates_one_derivative(client, valid_mp4_bytes):
    """Breaks if concurrent render requests invoke the renderer more than once."""
    case_id, _ = _create_owned_demo_case(client)
    image = _active_memory_image(client, case_id)
    renderer = _BlockingCopyRenderer(valid_mp4_bytes)
    service = client.app.state.memory_images
    service.renderer = renderer
    with client.app.state.database.session() as session:
        stored = session.get(MemoryImage, image["id"])
        assert stored is not None
        actor = session.scalar(select(User).where(User.email == "admin@senda.local"))
        assert actor is not None
        service.decide(session, image=stored, action="approve", actor=actor)
    errors: list[BaseException] = []

    def render() -> None:
        try:
            service.render_approved(str(image["id"]))
        except BaseException as exc:
            errors.append(exc)

    first = Thread(target=render)
    second = Thread(target=render)
    first.start()
    assert renderer.entered.wait(timeout=5)
    second.start()
    second.join(timeout=5)
    renderer.release.set()
    first.join(timeout=5)

    assert not first.is_alive()
    assert not second.is_alive()
    assert errors == []
    assert renderer.calls == 1
    with client.app.state.database.session() as session:
        records = list(
            session.scalars(
                select(RenderedVideo).where(RenderedVideo.memory_image_id == image["id"])
            )
        )
        assert len(records) == 1
        assert records[0].status == "ready"
        assert records[0].video_id is not None


def test_concurrent_initial_render_claim_handles_the_unique_conflict(
    client, valid_mp4_bytes
):
    """Breaks if two first claims can raise or invoke the renderer twice."""
    case_id, _ = _create_owned_demo_case(client)
    image = _active_memory_image(client, case_id)
    service = client.app.state.memory_images
    database = client.app.state.database
    with database.session() as session:
        stored = session.get(MemoryImage, image["id"])
        assert stored is not None
        actor = session.scalar(select(User).where(User.email == "admin@senda.local"))
        assert actor is not None
        service.decide(session, image=stored, action="approve", actor=actor)
    renderer = _BlockingCopyRenderer(valid_mp4_bytes)
    service.renderer = renderer
    claim_barrier = Barrier(2)
    claimed = 0
    claimed_lock = Lock()

    def synchronize_initial_claims(_conn, _cursor, statement, _parameters, _context, _many):
        nonlocal claimed
        if "FROM rendered_videos" not in statement:
            return
        with claimed_lock:
            if claimed >= 2:
                return
            claimed += 1
        claim_barrier.wait(timeout=5)

    event.listen(database.engine, "before_cursor_execute", synchronize_initial_claims)
    errors: list[BaseException] = []

    def render() -> None:
        try:
            service.render_approved(str(image["id"]))
        except BaseException as exc:
            errors.append(exc)

    try:
        first = Thread(target=render)
        second = Thread(target=render)
        first.start()
        second.start()
        assert renderer.entered.wait(timeout=5)
        renderer.release.set()
        first.join(timeout=5)
        second.join(timeout=5)
    finally:
        event.remove(database.engine, "before_cursor_execute", synchronize_initial_claims)

    assert not first.is_alive()
    assert not second.is_alive()
    assert errors == []
    assert renderer.calls == 1
    with database.session() as session:
        assert len(list(session.scalars(select(RenderedVideo)))) == 1


def test_concurrent_failed_render_retries_claim_only_one_attempt(client, valid_mp4_bytes):
    """Breaks if two failed retries can each render a new derivative."""
    case_id, _ = _create_owned_demo_case(client)
    image = _active_memory_image(client, case_id)
    service = client.app.state.memory_images
    database = client.app.state.database
    with database.session() as session:
        stored = session.get(MemoryImage, image["id"])
        assert stored is not None
        actor = session.scalar(select(User).where(User.email == "admin@senda.local"))
        assert actor is not None
        service.decide(session, image=stored, action="approve", actor=actor)
        session.add(
            RenderedVideo(
                id="retry-race-rendered-video",
                memory_image_id=stored.id,
                case_id=case_id,
                video_id=None,
                status="failed",
                failure_code="memory_video_render_failed",
            )
        )
    renderer = _BlockingCopyRenderer(valid_mp4_bytes)
    service.renderer = renderer
    claim_barrier = Barrier(2)
    claimed = 0
    claimed_lock = Lock()

    def synchronize_retry_claims(_conn, _cursor, statement, _parameters, _context, _many):
        nonlocal claimed
        if "FROM rendered_videos" not in statement:
            return
        with claimed_lock:
            if claimed >= 2:
                return
            claimed += 1
        claim_barrier.wait(timeout=5)

    event.listen(database.engine, "before_cursor_execute", synchronize_retry_claims)
    errors: list[BaseException] = []

    def retry() -> None:
        try:
            service.render_approved(str(image["id"]))
        except BaseException as exc:
            errors.append(exc)

    try:
        first = Thread(target=retry)
        second = Thread(target=retry)
        first.start()
        second.start()
        assert renderer.entered.wait(timeout=5)
        renderer.release.set()
        first.join(timeout=5)
        second.join(timeout=5)
    finally:
        event.remove(database.engine, "before_cursor_execute", synchronize_retry_claims)

    assert not first.is_alive()
    assert not second.is_alive()
    assert errors == []
    assert renderer.calls == 1
    with database.session() as session:
        rendered = session.get(RenderedVideo, "retry-race-rendered-video")
        assert rendered is not None
        assert rendered.status == "ready"
        assert rendered.video_id is not None
        assert len(list(session.scalars(select(Video).where(Video.status == "derived")))) == 1


def test_rolled_back_derived_video_removes_encrypted_storage(client, valid_mp4_bytes, monkeypatch):
    """Breaks if a commit rollback leaves encrypted derivative chunks behind."""
    case_id, _ = _create_owned_demo_case(client)
    database = client.app.state.database
    videos_root = client.app.state.settings.storage_dir / "videos"
    before = {path.name for path in videos_root.iterdir()}

    with pytest.raises(RuntimeError, match="commit failed"):
        with database.session() as session:
            case = session.get(CaseRecord, case_id)
            assert case is not None
            original = session.get(Video, case.video_id)
            assert original is not None
            client.app.state.videos.create_derived(
                session,
                original=original,
                source=BytesIO(valid_mp4_bytes),
                filename="rollback.mp4",
            )
            monkeypatch.setattr(session, "commit", lambda: (_ for _ in ()).throw(RuntimeError("commit failed")))

    assert {path.name for path in videos_root.iterdir()} == before


def test_derived_video_flush_failure_removes_encrypted_storage(
    client, valid_mp4_bytes, monkeypatch
):
    """Breaks if a database flush failure leaves encrypted derivative chunks behind."""
    case_id, _ = _create_owned_demo_case(client)
    database = client.app.state.database
    videos_root = client.app.state.settings.storage_dir / "videos"
    before = {path.name for path in videos_root.iterdir()}

    with pytest.raises(RuntimeError, match="flush failed"):
        with database.session() as session:
            case = session.get(CaseRecord, case_id)
            assert case is not None
            original = session.get(Video, case.video_id)
            assert original is not None
            monkeypatch.setattr(
                session,
                "flush",
                lambda: (_ for _ in ()).throw(RuntimeError("flush failed")),
            )
            client.app.state.videos.create_derived(
                session,
                original=original,
                source=BytesIO(valid_mp4_bytes),
                filename="flush-failure.mp4",
            )

    assert {path.name for path in videos_root.iterdir()} == before


def test_derived_encryption_failure_keeps_a_retryable_purge_job_when_filesystem_cleanup_fails(
    client, valid_mp4_bytes, monkeypatch
):
    """Breaks if partial ciphertext is deleted directly instead of by the durable outbox."""
    case_id, _ = _create_owned_demo_case(client)
    database = client.app.state.database
    videos_root = client.app.state.settings.storage_dir / "videos"
    before = {path.name for path in videos_root.iterdir()}

    def fail_after_writing(_video_id, _source, target_dir, **_kwargs):
        target_dir.mkdir(parents=True)
        (target_dir / "00000000.bin").write_bytes(b"partial")
        raise RuntimeError("encryption failed")

    monkeypatch.setattr(
        client.app.state.videos.chunk_cipher,
        "encrypt_stream",
        fail_after_writing,
    )
    purges = client.app.state.purges
    original_purge = purges._purge_video
    monkeypatch.setattr(
        purges,
        "_purge_video",
        lambda _payload: (_ for _ in ()).throw(OSError("filesystem unavailable")),
    )
    with pytest.raises(RuntimeError, match="encryption failed"):
        with database.session() as session:
            case = session.get(CaseRecord, case_id)
            assert case is not None
            original = session.get(Video, case.video_id)
            assert original is not None
            client.app.state.videos.create_derived(
                session,
                original=original,
                source=BytesIO(valid_mp4_bytes),
                filename="encryption-failure.mp4",
            )

    partial_dirs = {path.name for path in videos_root.iterdir()} - before
    assert len(partial_dirs) == 1
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1

    monkeypatch.setattr(purges, "_purge_video", original_purge)
    assert purges.process_pending() == 1
    assert {path.name for path in videos_root.iterdir()} == before


def test_empty_derived_manifest_uses_the_durable_purge_path(client, valid_mp4_bytes, monkeypatch):
    """Breaks if an empty video bypasses the encrypted outbox and direct cleanup fails."""
    from app.security.crypto import ChunkManifest
    from app.services.videos import InvalidVideoError

    case_id, _ = _create_owned_demo_case(client)
    database = client.app.state.database
    videos_root = client.app.state.settings.storage_dir / "videos"
    before = {path.name for path in videos_root.iterdir()}

    def empty_manifest(_video_id, _source, target_dir, **kwargs):
        target_dir.mkdir(parents=True)
        return ChunkManifest(total_size=0, chunk_size=kwargs["chunk_size"], chunks=())

    monkeypatch.setattr(client.app.state.videos.chunk_cipher, "encrypt_stream", empty_manifest)
    purges = client.app.state.purges
    original_purge = purges._purge_video
    monkeypatch.setattr(
        purges,
        "_purge_video",
        lambda _payload: (_ for _ in ()).throw(OSError("filesystem unavailable")),
    )
    with pytest.raises(InvalidVideoError, match="video is empty"):
        with database.session() as session:
            case = session.get(CaseRecord, case_id)
            assert case is not None
            original = session.get(Video, case.video_id)
            assert original is not None
            client.app.state.videos.create_derived(
                session,
                original=original,
                source=BytesIO(valid_mp4_bytes),
                filename="empty-derived.mp4",
            )

    assert len({path.name for path in videos_root.iterdir()} - before) == 1
    with database.session() as session:
        assert session.query(PurgeJob).count() == 1
    monkeypatch.setattr(purges, "_purge_video", original_purge)
    assert purges.process_pending() == 1
    assert {path.name for path in videos_root.iterdir()} == before


def test_lost_render_finalization_claim_removes_derived_storage(client, valid_mp4_bytes):
    """Breaks if a lost render claim leaves an unlinked encrypted derivative."""
    case_id, _ = _create_owned_demo_case(client)
    image = _active_memory_image(client, case_id)
    service = client.app.state.memory_images
    database = client.app.state.database
    with database.session() as session:
        stored = session.get(MemoryImage, image["id"])
        assert stored is not None
        actor = session.scalar(select(User).where(User.email == "admin@senda.local"))
        assert actor is not None
        service.decide(session, image=stored, action="approve", actor=actor)
    videos_root = client.app.state.settings.storage_dir / "videos"
    before = {path.name for path in videos_root.iterdir()}
    service.renderer = _ClaimStealingRenderer(database, str(image["id"]), valid_mp4_bytes)

    assert service.render_approved(str(image["id"])) is None

    assert {path.name for path in videos_root.iterdir()} == before
    with database.session() as session:
        assert session.scalar(
            select(Video).where(Video.status == "derived")
        ) is None


def test_corrupt_memory_image_asset_returns_generic_not_found(client):
    case_id, _ = _create_owned_demo_case(client)
    image = _active_memory_image(client, case_id)
    database = client.app.state.database

    with database.session() as session:
        stored = session.get(MemoryImage, image["id"])
        assert stored is not None
        assert stored.storage_path is not None
        asset_path = client.app.state.settings.storage_dir / stored.storage_path
    asset_path.write_bytes(asset_path.read_bytes() + b"tampered")

    response = client.get(f"/api/v1/cases/{case_id}/memory-image/content")

    assert response.status_code == 404
    assert response.json() == {"detail": "Imagen de memoria no disponible"}


def test_memory_image_with_unknown_asset_key_returns_generic_not_found(client):
    case_id, _ = _create_owned_demo_case(client)
    image = _active_memory_image(client, case_id)
    database = client.app.state.database

    with database.session() as session:
        stored = session.get(MemoryImage, image["id"])
        assert stored is not None
        stored.asset_key_version = 999

    response = client.get(f"/api/v1/cases/{case_id}/memory-image/content")

    assert response.status_code == 404
    assert response.json() == {"detail": "Imagen de memoria no disponible"}
