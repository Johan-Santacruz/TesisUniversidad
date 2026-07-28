from __future__ import annotations


SOURCE_PAYLOAD = {
    "id": "alcaldia-popayan-demo",
    "entity": "Alcaldía de Popayán",
    "program": "Fuente oficial ficticia para pruebas",
    "coverage": "Popayán, Cauca",
    "requirements": "Confirmar requisitos con la entidad.",
    "contact": "Canal oficial de prueba.",
    "url": "https://www.popayan.gov.co/",
    "verified_at": "2026-07-27T00:00:00Z",
    "expires_at": "2026-08-26T00:00:00Z",
    "source_kind": "contact",
    "route_types": ["emergency"],
    "status": "active",
}


def test_admin_can_create_update_list_and_retire_sources(admin_client):
    created = admin_client.post("/api/v1/sources", json=SOURCE_PAYLOAD)
    assert created.status_code == 201
    assert created.json()["id"] == SOURCE_PAYLOAD["id"]

    updated = admin_client.patch(
        f"/api/v1/sources/{SOURCE_PAYLOAD['id']}",
        json={"contact": "Nuevo canal oficial de prueba."},
    )
    assert updated.status_code == 200
    assert updated.json()["contact"] == "Nuevo canal oficial de prueba."

    listed = admin_client.get("/api/v1/sources")
    assert SOURCE_PAYLOAD["id"] in {
        source["id"] for source in listed.json()["items"]
    }

    retired = admin_client.delete(f"/api/v1/sources/{SOURCE_PAYLOAD['id']}")
    assert retired.status_code == 204
    fetched = admin_client.get(f"/api/v1/sources/{SOURCE_PAYLOAD['id']}")
    assert fetched.json()["status"] == "retired"


def test_operator_cannot_mutate_sources(operator_client):
    response = operator_client.post("/api/v1/sources", json=SOURCE_PAYLOAD)

    assert response.status_code == 403

