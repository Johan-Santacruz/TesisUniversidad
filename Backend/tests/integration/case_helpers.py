from __future__ import annotations

import json


def login(client, email: str, password: str) -> str:
    response = client.post(
        "/api/v1/auth/token",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return token


def create_validator(client) -> None:
    login(client, "admin@siad.local", "Cambiar-Esta-Clave-2026!")
    created = client.post(
        "/api/v1/users",
        json={
            "email": "validador@siad.local",
            "password": "Clave-Validador-2026!",
            "role": "validador",
        },
    )
    assert created.status_code in {201, 409}


def create_demo_case(client) -> str:
    login(client, "admin@siad.local", "Cambiar-Esta-Clave-2026!")
    video = client.post("/api/v1/videos/demo").json()
    analysis = client.post(f"/api/v1/videos/{video['id']}/analyses").json()
    stream = client.get(analysis["events_url"]).text
    route_data = next(
        json.loads(line.removeprefix("data: "))
        for line in stream.splitlines()
        if line.startswith("data: ")
        and json.loads(line.removeprefix("data: "))["stage"] == "routes"
    )
    return route_data["payload"]["case_id"]


def confirm_critical_facts(client, case_id: str) -> None:
    case = client.get(f"/api/v1/cases/{case_id}").json()
    for fact in case["facts"]:
        if not fact["is_critical"]:
            continue
        value = fact["value"] if fact["value"] is not None else "high"
        response = client.patch(
            f"/api/v1/cases/{case_id}/facts/{fact['id']}",
            json={
                "action": "confirm",
                "value": value,
                "reason": "Validación humana sobre el caso ficticio",
            },
        )
        assert response.status_code == 200


APPROVAL_PAYLOAD = {
    "confirmed_route_types": [
        "emergency",
        "housing_stabilization",
        "return_relocation",
    ]
}

