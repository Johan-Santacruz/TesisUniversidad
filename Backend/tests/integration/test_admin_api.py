from __future__ import annotations


def test_admin_can_create_and_list_an_operator(admin_client):
    created = admin_client.post(
        "/api/v1/users",
        json={
            "email": "nueva.operadora@senda.local",
            "password": "Clave-Segura-2026!",
            "role": "operador",
        },
    )

    assert created.status_code == 201
    assert created.json()["role"] == "operador"
    listed = admin_client.get("/api/v1/users")
    assert "nueva.operadora@senda.local" in {
        user["email"] for user in listed.json()["items"]
    }


def test_operator_cannot_create_users(operator_client):
    response = operator_client.post(
        "/api/v1/users",
        json={
            "email": "otra@senda.local",
            "password": "Clave-Segura-2026!",
            "role": "operador",
        },
    )

    assert response.status_code == 403


def test_duplicate_email_returns_conflict_instead_of_exposing_database_error(
    admin_client,
):
    payload = {
        "email": "duplicada@senda.local",
        "password": "Clave-Segura-2026!",
        "role": "operador",
    }
    assert admin_client.post("/api/v1/users", json=payload).status_code == 201

    duplicate = admin_client.post("/api/v1/users", json=payload)

    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "Ya existe un usuario con ese correo"


def test_admin_disable_revokes_future_access(admin_client):
    created = admin_client.post(
        "/api/v1/users",
        json={
            "email": "temporal@senda.local",
            "password": "Clave-Temporal-2026!",
            "role": "validador",
        },
    )
    user_id = created.json()["id"]

    disabled = admin_client.patch(
        f"/api/v1/users/{user_id}",
        json={"is_active": False},
    )

    assert disabled.status_code == 200
    assert disabled.json()["is_active"] is False
    admin_client.headers.pop("Authorization")
    login = admin_client.post(
        "/api/v1/auth/token",
        data={
            "username": "temporal@senda.local",
            "password": "Clave-Temporal-2026!",
        },
    )
    assert login.status_code == 401
