from __future__ import annotations


def test_login_sets_http_only_refresh_cookie_and_returns_access_token(
    client, admin_credentials
):
    response = client.post("/api/v1/auth/token", data=admin_credentials)

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["expires_in"] == 900
    assert "access_token" in response.json()
    cookie = response.headers["set-cookie"]
    assert "siad_refresh=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age=28800" in cookie


def test_me_returns_the_authenticated_user(client, admin_credentials):
    login = client.post("/api/v1/auth/token", data=admin_credentials)
    token = login.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "id": response.json()["id"],
        "email": "admin@siad.local",
        "role": "admin",
        "is_active": True,
    }


def test_wrong_password_never_creates_a_session(client):
    response = client.post(
        "/api/v1/auth/token",
        data={"username": "admin@siad.local", "password": "incorrecta"},
    )

    assert response.status_code == 401
    assert "siad_refresh=" not in response.headers.get("set-cookie", "")


def test_refresh_rotates_and_revokes_the_previous_session(client, admin_credentials):
    login = client.post("/api/v1/auth/token", data=admin_credentials)
    first_cookie = client.cookies.get("siad_refresh")
    assert first_cookie

    refreshed = client.post("/api/v1/auth/refresh")
    second_cookie = client.cookies.get("siad_refresh")

    assert refreshed.status_code == 200
    assert second_cookie
    assert second_cookie != first_cookie

    client.cookies.set("siad_refresh", first_cookie)
    replay = client.post("/api/v1/auth/refresh")
    assert replay.status_code == 401


def test_logout_revokes_refresh_cookie(client, admin_credentials):
    client.post("/api/v1/auth/token", data=admin_credentials)

    response = client.post("/api/v1/auth/logout")

    assert response.status_code == 204
    assert client.post("/api/v1/auth/refresh").status_code == 401

