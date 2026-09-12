from __future__ import annotations

from sqlalchemy import select, update

from app.entities import Fact, Review
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
    assert len(case["facts"]) == 4
    assert {route["route_type"] for route in case["routes"]} == {
        "emergency",
        "housing_stabilization",
        "return_relocation",
    }
    assert case["recommendation_status"] == "preliminary"
    assert case["critical_inconsistencies"] == 1


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
    children = next(
        fact for fact in case["facts"] if fact["key"] == "vulnerabilities"
    )

    response = client.patch(
        f"/api/v1/cases/{case_id}/facts/{children['id']}",
        json={
            "action": "confirm",
            "value": ["children"],
            "reason": "Confirmación del caso ficticio",
        },
    )

    assert response.status_code == 200
    assert response.json()["verification_status"] == "confirmed"
    assert response.json()["confidence_band"] == "high"
    assert response.json()["value"] == ["children"]


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


def test_a_retired_signal_saved_before_its_removal_neither_shows_nor_blocks(client):
    """Breaks if an old case keeps an urgency card that still blocks approval."""
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    # Así quedó guardada la urgencia en los casos analizados antes del retiro:
    # crítica y sin confirmar.
    with client.app.state.database.session() as session:
        session.execute(
            update(Fact)
            .where(Fact.case_id == case_id, Fact.is_critical.is_(True))
            .values(fact_type="urgency")
        )

    case = client.get(f"/api/v1/cases/{case_id}").json()
    assert not any(fact["is_critical"] for fact in case["facts"])
    assert case["critical_inconsistencies"] == 0

    approved = client.post(
        f"/api/v1/cases/{case_id}/approve",
        json=APPROVAL_PAYLOAD,
    )
    assert approved.status_code == 200


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
    children = next(
        fact for fact in case["facts"] if fact["key"] == "vulnerabilities"
    )

    changed = client.patch(
        f"/api/v1/cases/{case_id}/facts/{children['id']}",
        json={
            "action": "correct",
            "value": ["children", "pregnancy"],
            "reason": "Corrección del caso ficticio",
        },
    ).json()

    assert changed["value"] == ["children", "pregnancy"]
    assert changed["display_value"] == "Niñas, niños o adolescentes · Embarazo"


def test_vulnerabilities_only_accept_the_options_of_the_list(client):
    """Breaks if free text slips back into the checkbox signal."""
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    case = client.get(f"/api/v1/cases/{case_id}").json()
    vulnerable = next(
        fact for fact in case["facts"] if fact["key"] == "vulnerabilities"
    )
    assert vulnerable["label"] == "Personas que necesitan protección especial"

    response = client.patch(
        f"/api/v1/cases/{case_id}/facts/{vulnerable['id']}",
        json={
            "action": "correct",
            "value": ["Dos niñas"],
            "reason": "Texto libre que no es una opción",
        },
    )

    assert response.status_code == 422


def test_a_correction_needs_no_reason(client):
    """Breaks if saving a corrected value starts asking for a justification."""
    case_id = create_demo_case(client)
    create_validator(client)
    login(client, "validador@senda.local", "Clave-Validador-2026!")
    case = client.get(f"/api/v1/cases/{case_id}").json()
    vulnerable = next(
        fact for fact in case["facts"] if fact["key"] == "vulnerabilities"
    )

    response = client.patch(
        f"/api/v1/cases/{case_id}/facts/{vulnerable['id']}",
        json={"action": "correct", "value": ["pregnancy"]},
    )

    assert response.status_code == 200
    assert response.json()["value"] == ["pregnancy"]


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
