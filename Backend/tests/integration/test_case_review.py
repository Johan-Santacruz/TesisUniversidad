from __future__ import annotations

from sqlalchemy import select

from app.entities import Review
from tests.integration.case_helpers import (
    APPROVAL_PAYLOAD,
    confirm_critical_facts,
    create_demo_case,
    create_validator,
    login,
)


def test_case_view_decrypts_workspace_data_for_authorized_users(client):
    case_id = create_demo_case(client)

    response = client.get(f"/api/v1/cases/{case_id}")

    assert response.status_code == 200
    case = response.json()
    assert case["id"] == case_id
    assert len(case["segments"]) == 3
    assert len(case["timeline"]) == 3
    assert len(case["facts"]) == 5
    assert {route["route_type"] for route in case["routes"]} == {
        "emergency",
        "housing_stabilization",
        "return_relocation",
    }
    assert case["recommendation_status"] == "preliminary"
    assert case["critical_inconsistencies"] == 2


def test_operator_correction_is_pending_and_audited_encrypted(client):
    case_id = create_demo_case(client)
    login(client, "admin@senda.local", "Cambiar-Esta-Clave-2026!")
    created = client.post(
        "/api/v1/users",
        json={
            "email": "operador.revision@senda.local",
            "password": "Clave-Operador-2026!",
            "role": "operador",
        },
    )
    assert created.status_code == 201
    login(client, "operador.revision@senda.local", "Clave-Operador-2026!")
    case = client.get(f"/api/v1/cases/{case_id}").json()
    location = next(fact for fact in case["facts"] if fact["label"] == "Ubicación actual")

    response = client.patch(
        f"/api/v1/cases/{case_id}/facts/{location['id']}",
        json={
            "action": "correct",
            "value": "Popayán, Cauca",
            "reason": "Corrección ficticia propuesta por el operador",
        },
    )

    assert response.status_code == 200
    assert response.json()["verification_status"] == "pending"
    database = client.app.state.database
    with database.session() as session:
        review = session.scalar(
            select(Review).where(Review.fact_id == location["id"])
        )
        assert "Corrección ficticia".encode() not in review.ciphertext
        details = client.app.state.cipher.decrypt_json(
            review.id,
            "review",
            review.encrypted_payload(),
        )
    assert details["reason"] == "Corrección ficticia propuesta por el operador"


def test_validator_confirmation_changes_fact_to_confirmed(client):
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    case = client.get(f"/api/v1/cases/{case_id}").json()
    urgency = next(fact for fact in case["facts"] if fact["label"] == "Urgencia")

    response = client.patch(
        f"/api/v1/cases/{case_id}/facts/{urgency['id']}",
        json={
            "action": "confirm",
            "value": "high",
            "reason": "Confirmación del caso ficticio",
        },
    )

    assert response.status_code == 200
    assert response.json()["verification_status"] == "confirmed"
    assert response.json()["confidence_band"] == "high"
    assert response.json()["value"] == "high"


def test_approval_is_blocked_until_critical_facts_and_routes_are_confirmed(client):
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")

    blocked = client.post(
        f"/api/v1/cases/{case_id}/approve",
        json=APPROVAL_PAYLOAD,
    )

    assert blocked.status_code == 409
    assert "inconsistencias críticas" in blocked.json()["detail"]


def test_validator_approval_schedules_video_for_seven_days(client):
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    confirm_critical_facts(client, case_id)

    approved = client.post(
        f"/api/v1/cases/{case_id}/approve",
        json=APPROVAL_PAYLOAD,
    )

    assert approved.status_code == 200
    body = approved.json()
    assert body["status"] == "approved"
    assert body["recommendation_status"] == "final"
    assert body["video_delete_after"]
    assert body["video_retention_days"] == 7


def test_case_view_carries_the_readable_value_next_to_the_canonical_one(client):
    """Breaks if the screen shows a model's canonical token instead of Spanish."""
    case_id = create_demo_case(client)
    case = client.get(f"/api/v1/cases/{case_id}").json()

    # El dato canónico sigue sirviendo para contrastar proveedores; el legible
    # es el que ve quien lee la ficha.
    assert all("display_value" in fact for fact in case["facts"])
    booleans = [fact for fact in case["facts"] if isinstance(fact["value"], bool)]
    for fact in booleans:
        assert fact["display_value"] in {"Sí", "No"}


def test_correcting_a_value_refreshes_the_readable_text(client):
    """Breaks if a corrected fact keeps the wording of the discarded value."""
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    case = client.get(f"/api/v1/cases/{case_id}").json()
    urgency = next(fact for fact in case["facts"] if fact["label"] == "Urgencia")

    changed = client.patch(
        f"/api/v1/cases/{case_id}/facts/{urgency['id']}",
        json={
            "action": "correct",
            "value": "Requiere atención inmediata",
            "reason": "Corrección del caso ficticio",
        },
    ).json()

    assert changed["value"] == "Requiere atención inmediata"
    assert changed["display_value"] == "Requiere atención inmediata"


def test_narration_is_unavailable_without_a_configured_voice(client):
    """Breaks if a missing provider turns into a 500 instead of a clear state."""
    case_id = create_demo_case(client)
    case = client.get(f"/api/v1/cases/{case_id}").json()
    route = case["routes"][0]

    response = client.get(
        f"/api/v1/cases/{case_id}/routes/{route['id']}/steps/0/narration"
    )

    assert response.status_code == 503
    assert "narración" in response.json()["detail"].lower()


def test_narration_only_speaks_steps_that_exist_in_the_case(client):
    """Breaks if the endpoint can be pushed past the persisted stops."""
    case_id = create_demo_case(client)
    case = client.get(f"/api/v1/cases/{case_id}").json()
    route = case["routes"][0]

    for step_index in (-1, 99):
        response = client.get(
            f"/api/v1/cases/{case_id}/routes/{route['id']}/steps/{step_index}/narration"
        )
        assert response.status_code == 404


def test_narration_refuses_a_route_from_another_case(client):
    """Breaks if a route id from elsewhere can be narrated through this case."""
    first = create_demo_case(client)
    second = create_demo_case(client)
    other_route = client.get(f"/api/v1/cases/{second}").json()["routes"][0]

    response = client.get(
        f"/api/v1/cases/{first}/routes/{other_route['id']}/steps/0/narration"
    )

    assert response.status_code == 404
