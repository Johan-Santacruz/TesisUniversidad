from __future__ import annotations

from sqlalchemy import select

from app.entities import (
    Analysis,
    AnalysisEvent,
    AuditLog,
    CaseRecord,
    Fact,
    MemoryImage,
    PurgeJob,
    RenderedVideo,
    Review,
    Route,
    Tombstone,
    Video,
    VideoChunk,
)
from tests.integration.case_helpers import (
    APPROVAL_PAYLOAD,
    confirm_critical_facts,
    create_demo_case,
    create_validator,
    login,
)


class _CopyRenderer:
    def __init__(self, rendered_bytes: bytes) -> None:
        self.rendered_bytes = rendered_bytes

    def render(self, _video, _image, target) -> None:
        target.write(self.rendered_bytes)
        target.seek(0)


def _approve_memory_image_with_derivative(client, case_id: str) -> None:
    database = client.app.state.database
    with database.session() as session:
        case = session.get(CaseRecord, case_id)
        assert case is not None
        original = session.get(Video, case.video_id)
        assert original is not None
        original_bytes = client.app.state.videos.open_plain_bytes(original)
    client.app.state.memory_images.renderer = _CopyRenderer(original_bytes)
    response = client.post(
        f"/api/v1/cases/{case_id}/memory-image/decision",
        json={"action": "approve"},
    )
    assert response.status_code == 200
    assert response.json()["memory_image"]["render_status"] == "ready"


def test_total_delete_leaves_only_a_non_sensitive_tombstone(client):
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    confirm_critical_facts(client, case_id)
    assert client.post(
        f"/api/v1/cases/{case_id}/approve",
        json=APPROVAL_PAYLOAD,
    ).status_code == 200
    case_before = client.get(f"/api/v1/cases/{case_id}").json()
    video_id = case_before["video_id"]
    analysis_id = case_before["analysis_id"]
    sensitive_entity_ids = {
        case_id,
        video_id,
        analysis_id,
        *(fact["id"] for fact in case_before["facts"]),
        *(route["id"] for route in case_before["routes"]),
    }

    login(client, "admin@senda.local", "Cambiar-Esta-Clave-2026!")
    deleted = client.delete(f"/api/v1/cases/{case_id}")

    assert deleted.status_code == 204
    assert client.get(f"/api/v1/cases/{case_id}").status_code == 404
    tombstone = client.get(f"/api/v1/audit/tombstones/{case_id}")
    assert tombstone.status_code == 200
    assert set(tombstone.json()) == {
        "case_id_hash",
        "deleted_at",
        "action",
        "actor_role",
    }
    assert case_id not in tombstone.json()["case_id_hash"]

    database = client.app.state.database
    with database.session() as session:
        assert session.get(CaseRecord, case_id) is None
        assert session.get(Video, video_id) is None
        assert session.get(Analysis, analysis_id) is None
        assert session.query(Fact).filter(Fact.case_id == case_id).count() == 0
        assert session.query(Route).filter(Route.case_id == case_id).count() == 0
        assert session.query(Review).filter(Review.case_id == case_id).count() == 0
        assert (
            session.query(AnalysisEvent)
            .filter(AnalysisEvent.analysis_id == analysis_id)
            .count()
            == 0
        )
        assert not set(
            session.scalars(
                select(AuditLog.entity_id).where(
                    AuditLog.entity_id.in_(sensitive_entity_ids)
                )
            )
        )
        assert session.query(Tombstone).count() == 1
        assert session.query(PurgeJob).count() == 0


def test_total_delete_removes_only_its_memory_resources_even_if_files_are_missing(client):
    """Breaks if case cleanup leaves its resources or reaches an unrelated case."""
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    _approve_memory_image_with_derivative(client, case_id)
    regenerated = client.post(f"/api/v1/cases/{case_id}/memory-image/regenerate")
    assert regenerated.status_code == 200
    _approve_memory_image_with_derivative(client, case_id)

    database = client.app.state.database
    storage_dir = client.app.state.settings.storage_dir
    with database.session() as session:
        case = session.get(CaseRecord, case_id)
        assert case is not None
        original_video_id = case.video_id
        images = list(
            session.scalars(
                select(MemoryImage)
                .where(MemoryImage.case_id == case_id)
                .order_by(MemoryImage.generation)
            )
        )
        assert [image.generation for image in images] == [1, 2]
        image_assets = [
            storage_dir / image.storage_path
            for image in images
            if image.storage_path is not None
        ]
        rendered = list(
            session.scalars(select(RenderedVideo).where(RenderedVideo.case_id == case_id))
        )
        derived_video_ids = [item.video_id for item in rendered if item.video_id is not None]
        assert len(derived_video_ids) == 2
        video_ids = [original_video_id, *derived_video_ids]
        chunk_paths = [
            storage_dir / path
            for path in session.scalars(
                select(VideoChunk.storage_path).where(VideoChunk.video_id.in_(video_ids))
            )
        ]
        sensitive_entity_ids = {
            case_id,
            *video_ids,
            *(image.id for image in images),
            *(item.id for item in rendered),
        }
    assert image_assets and chunk_paths
    assert all(path.exists() for path in [*image_assets, *chunk_paths])
    image_assets[0].unlink()
    chunk_paths[0].unlink()

    unrelated_case_id = create_demo_case(client)
    with database.session() as session:
        unrelated_image = session.scalar(
            select(MemoryImage).where(MemoryImage.case_id == unrelated_case_id)
        )
        assert unrelated_image is not None
        assert unrelated_image.storage_path is not None
        unrelated_asset = storage_dir / unrelated_image.storage_path
    assert unrelated_asset.exists()

    login(client, "admin@senda.local", "Cambiar-Esta-Clave-2026!")
    assert client.delete(f"/api/v1/cases/{case_id}").status_code == 204

    with database.session() as session:
        assert session.get(CaseRecord, case_id) is None
        assert session.query(MemoryImage).filter(MemoryImage.case_id == case_id).count() == 0
        assert session.query(RenderedVideo).filter(RenderedVideo.case_id == case_id).count() == 0
        assert all(session.get(Video, video_id) is None for video_id in video_ids)
        assert (
            session.query(VideoChunk).filter(VideoChunk.video_id.in_(video_ids)).count()
            == 0
        )
        assert not set(
            session.scalars(
                select(AuditLog.entity_id).where(AuditLog.entity_id.in_(sensitive_entity_ids))
            )
        )
        assert session.get(CaseRecord, unrelated_case_id) is not None
        assert (
            session.query(MemoryImage)
            .filter(MemoryImage.case_id == unrelated_case_id)
            .count()
            == 1
        )
        assert session.query(PurgeJob).count() == 0
    assert all(not path.exists() for path in [*image_assets, *chunk_paths])
    assert all(not path.parent.exists() for path in [*image_assets, *chunk_paths])
    assert unrelated_asset.exists()


def test_operator_cannot_perform_total_deletion(operator_client):
    case_id = create_demo_case(operator_client)

    # create_demo_case logs in as admin, so restore the operator identity.
    login(
        operator_client,
        "operador@senda.local",
        "Clave-Operador-2026!",
    )
    response = operator_client.delete(f"/api/v1/cases/{case_id}")

    assert response.status_code == 403
