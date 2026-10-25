from __future__ import annotations

from datetime import datetime, timedelta, timezone
from io import BytesIO

from pypdf import PdfReader
from sqlalchemy import select, update

from app.entities import AuditLog, CaseRecord
from tests.integration.case_helpers import (
    APPROVAL_PAYLOAD,
    confirm_critical_facts,
    create_demo_case,
    create_validator,
    login,
)


ADMIN = ("admin@senda.local", "Cambiar-Esta-Clave-2026!")
OPERATOR = ("operadora.historial@senda.local", "Clave-Operadora-2026!")
OTHER_OPERATOR = ("operador.ajeno@senda.local", "Clave-Operador-2026!")
VALIDATOR = ("validador@senda.local", "Clave-Validador-2026!")


def _create_operator(client, email: str, password: str) -> None:
    login(client, *ADMIN)
    created = client.post(
        "/api/v1/users",
        json={"email": email, "password": password, "role": "operador"},
    )
    assert created.status_code == 201


def _age_case(client, case_id: str, days: int) -> None:
    """Los casos de una misma prueba nacen en el mismo instante: se
    envejecen para que el orden del historial sea comprobable."""
    with client.app.state.database.session() as session:
        session.execute(
            update(CaseRecord)
            .where(CaseRecord.id == case_id)
            .values(created_at=datetime.now(timezone.utc) - timedelta(days=days))
        )


def test_history_lists_cases_newest_first_with_what_identifies_them(client):
    older = create_demo_case(client)
    newer = create_demo_case(client)
    _age_case(client, older, days=2)

    response = client.get("/api/v1/cases")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert [item["id"] for item in body["items"]] == [newer, older]
    item = body["items"][0]
    assert item["reference"] == newer.replace("-", "")[:8].upper()
    # Con zona: sin ella el navegador la leería como hora local.
    assert item["created_at"].endswith("Z")
    assert item["status"] == "in_review"
    assert item["recommendation_status"] == "preliminary"
    assert item["is_demo"] is True
    assert item["video_status"] == "uploaded"
    assert item["category"] == "Desplazamiento"
    assert item["subcategory"] == "Desplazamiento forzado"
    assert item["signals_total"] == 4
    assert item["critical_pending"] == 1
    # El historial no trae nada del relato.
    assert "segments" not in item
    assert "facts" not in item


def test_operators_see_only_the_cases_they_uploaded(client):
    _create_operator(client, *OPERATOR)
    _create_operator(client, *OTHER_OPERATOR)
    own = create_demo_case(client, *OPERATOR)
    foreign = create_demo_case(client, *OTHER_OPERATOR)
    create_validator(client)

    login(client, *OPERATOR)
    operator_view = client.get("/api/v1/cases").json()
    login(client, *VALIDATOR)
    validator_view = client.get("/api/v1/cases").json()

    assert [item["id"] for item in operator_view["items"]] == [own]
    assert operator_view["total"] == 1
    assert {item["id"] for item in validator_view["items"]} == {own, foreign}


def test_history_filters_by_status_and_paginates(client):
    pending = create_demo_case(client)
    approved = create_demo_case(client)
    _age_case(client, pending, days=1)
    confirm_critical_facts(client, approved)
    assert client.post(
        f"/api/v1/cases/{approved}/approve", json=APPROVAL_PAYLOAD
    ).status_code == 200

    only_approved = client.get("/api/v1/cases", params={"status": "approved"}).json()
    first_page = client.get("/api/v1/cases", params={"limit": 1}).json()
    second_page = client.get("/api/v1/cases", params={"limit": 1, "offset": 1}).json()

    assert [item["id"] for item in only_approved["items"]] == [approved]
    assert only_approved["items"][0]["critical_pending"] == 0
    assert only_approved["items"][0]["approved_at"] is not None
    assert first_page["total"] == second_page["total"] == 2
    assert [item["id"] for item in first_page["items"]] == [approved]
    assert [item["id"] for item in second_page["items"]] == [pending]


def test_history_rejects_out_of_range_queries(client):
    login(client, *ADMIN)

    assert client.get("/api/v1/cases", params={"limit": 0}).status_code == 422
    assert client.get("/api/v1/cases", params={"limit": 101}).status_code == 422
    assert client.get("/api/v1/cases", params={"offset": -1}).status_code == 422
    assert client.get("/api/v1/cases", params={"status": "deleting"}).status_code == 422


def test_history_hides_cases_being_deleted(client):
    case_id = create_demo_case(client)
    with client.app.state.database.session() as session:
        session.execute(
            update(CaseRecord)
            .where(CaseRecord.id == case_id)
            .values(status="deleting", deletion_claimed_at=datetime.now(timezone.utc))
        )

    body = client.get("/api/v1/cases").json()

    assert body == {"items": [], "total": 0}


def test_history_requires_a_session(client):
    assert client.get("/api/v1/cases").status_code == 401


def test_report_downloads_an_audited_pdf(client):
    case_id = create_demo_case(client)
    reference = case_id.replace("-", "")[:8].upper()

    response = client.get(f"/api/v1/cases/{case_id}/report")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["content-disposition"] == (
        f'attachment; filename="senda-caso-{reference}.pdf"'
    )
    reader = PdfReader(BytesIO(response.content))
    text = " ".join(" ".join(page.extract_text() for page in reader.pages).split())
    assert reader.metadata.title == f"Resumen del caso {reference}"
    assert "Desplazamiento forzado" in text
    assert "Demostración con datos ficticios" in text
    # El caso demo trae una señal crítica sin confirmar: la ruta no se imprime.
    assert "Las rutas se incluirán cuando las señales críticas estén confirmadas" in text

    with client.app.state.database.session() as session:
        record = session.scalar(
            select(AuditLog).where(
                AuditLog.action == "case_report_exported",
                AuditLog.entity_id == case_id,
            )
        )
        assert record is not None
        assert record.actor_role == "admin"
        details = client.app.state.audit.read_details(record)
    assert details["routes_included"] is False
    assert details["recommendation_status"] == "preliminary"
    assert details["size_bytes"] == len(response.content)


def test_report_includes_routes_once_critical_signals_are_confirmed(client):
    case_id = create_demo_case(client)
    confirm_critical_facts(client, case_id)
    routes = client.get(f"/api/v1/cases/{case_id}").json()["routes"]

    response = client.get(f"/api/v1/cases/{case_id}/report")

    text = " ".join(
        " ".join(
            page.extract_text() for page in PdfReader(BytesIO(response.content)).pages
        ).split()
    )
    assert all(route["title"] in text for route in routes)
    assert "Fuentes institucionales" in text


def test_report_is_only_for_the_owner_or_reviewers(client):
    _create_operator(client, *OPERATOR)
    _create_operator(client, *OTHER_OPERATOR)
    case_id = create_demo_case(client, *OPERATOR)
    create_validator(client)

    login(client, *OTHER_OPERATOR)
    foreign = client.get(f"/api/v1/cases/{case_id}/report")
    login(client, *OPERATOR)
    own = client.get(f"/api/v1/cases/{case_id}/report")
    login(client, *VALIDATOR)
    reviewer = client.get(f"/api/v1/cases/{case_id}/report")

    assert foreign.status_code == 403
    assert own.status_code == 200
    assert reviewer.status_code == 200
    with client.app.state.database.session() as session:
        exports = session.scalars(
            select(AuditLog.actor_role).where(AuditLog.action == "case_report_exported")
        ).all()
    # El intento denegado no deja una exportación registrada.
    assert sorted(exports) == ["operador", "validador"]


def test_report_for_an_unknown_case_is_not_found(client):
    login(client, *ADMIN)

    assert client.get("/api/v1/cases/no-existe/report").status_code == 404
