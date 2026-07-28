from __future__ import annotations

from app.models import CaseRecord, Fact, Tombstone, Video
from tests.integration.case_helpers import (
    APPROVAL_PAYLOAD,
    confirm_critical_facts,
    create_demo_case,
    create_validator,
    login,
)


def test_total_delete_leaves_only_a_non_sensitive_tombstone(client):
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@siad.local", "Clave-Validador-2026!")
    confirm_critical_facts(client, case_id)
    assert client.post(
        f"/api/v1/cases/{case_id}/approve",
        json=APPROVAL_PAYLOAD,
    ).status_code == 200
    case_before = client.get(f"/api/v1/cases/{case_id}").json()
    video_id = case_before["video_id"]

    login(client, "admin@siad.local", "Cambiar-Esta-Clave-2026!")
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
        assert session.query(Fact).filter(Fact.case_id == case_id).count() == 0
        assert session.query(Tombstone).count() == 1


def test_operator_cannot_perform_total_deletion(operator_client):
    case_id = create_demo_case(operator_client)

    # create_demo_case logs in as admin, so restore the operator identity.
    login(
        operator_client,
        "operador@siad.local",
        "Clave-Operador-2026!",
    )
    response = operator_client.delete(f"/api/v1/cases/{case_id}")

    assert response.status_code == 403

