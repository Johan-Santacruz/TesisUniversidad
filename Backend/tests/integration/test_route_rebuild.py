"""La ruta se reconstruye con las señales que una persona confirmó."""
from __future__ import annotations

from sqlalchemy import update

from app.entities import CaseRecord
from app.services.cases import CaseService
from tests.integration.case_helpers import APPROVAL_PAYLOAD, create_validator, login
from tests.integration.test_pipeline import _rebuilt_routes, _run_uploaded


REBUILT_SUMMARY = "Ajustada con las señales confirmadas."


def _case_awaiting_confirmation(operator_client, tiny_video_bytes) -> str:
    # Con una sola lectura la señal crítica queda pendiente: falta que una
    # persona la confirme para que la ruta se pueda reconstruir.
    _, payloads = _run_uploaded(
        operator_client,
        tiny_video_bytes,
        claude_value=TimeoutError("simulated timeout"),
    )
    case_id = payloads[7]["payload"]["case_id"]
    create_validator(operator_client)
    login(operator_client, "validador@senda.local", "Clave-Validador-2026!")
    return case_id


def _confirm_vulnerabilities(client, case_id: str) -> dict:
    case = client.get(f"/api/v1/cases/{case_id}").json()
    vulnerable = next(
        fact for fact in case["facts"] if fact["key"] == "vulnerabilities"
    )
    response = client.patch(
        f"/api/v1/cases/{case_id}/facts/{vulnerable['id']}",
        json={"action": "confirm"},
    )
    assert response.status_code == 200
    return client.get(f"/api/v1/cases/{case_id}").json()


def _reader(client):
    return client.app.state.analysis.gpt


def _set_routes_status(client, case_id: str, value: str) -> None:
    with client.app.state.database.session() as session:
        session.execute(
            update(CaseRecord)
            .where(CaseRecord.id == case_id)
            .values(routes_status=value)
        )


def test_confirming_the_last_critical_signal_rebuilds_the_routes_with_it(
    operator_client, tiny_video_bytes
):
    """Breaks if a human confirmation stops reaching the route it unlocks."""
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    initial = operator_client.get(f"/api/v1/cases/{case_id}").json()
    assert initial["routes_status"] == "initial"

    case = _confirm_vulnerabilities(operator_client, case_id)

    assert case["routes_status"] == "rebuilt"
    assert {route["summary"] for route in case["routes"]} == {REBUILT_SUMMARY}
    assert len(case["routes"]) == 3
    confirmed = {
        signal["key"]: signal for signal in _reader(operator_client).rebuild_inputs
    }
    assert confirmed["vulnerabilities"]["value"] == ["children"]
    assert case["sources"], "las fuentes salen de las rutas reconstruidas"


def test_a_failed_rebuild_keeps_the_initial_routes_and_can_be_retried(
    operator_client, tiny_video_bytes
):
    """Breaks if a provider failure leaves the case without routes."""
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    _reader(operator_client).rebuild_value = TimeoutError("simulated timeout")

    case = _confirm_vulnerabilities(operator_client, case_id)

    assert case["routes_status"] == "rebuild_failed"
    assert len(case["routes"]) == 3
    assert REBUILT_SUMMARY not in {route["summary"] for route in case["routes"]}

    _reader(operator_client).rebuild_value = _rebuilt_routes()
    retry = operator_client.post(f"/api/v1/cases/{case_id}/routes/rebuild")
    assert retry.status_code == 202

    case = operator_client.get(f"/api/v1/cases/{case_id}").json()
    assert case["routes_status"] == "rebuilt"
    assert {route["summary"] for route in case["routes"]} == {REBUILT_SUMMARY}


def test_rebuilt_routes_citing_unknown_sources_are_discarded(
    operator_client, tiny_video_bytes
):
    """Breaks if a rebuilt route can cite an entity outside the catalog."""
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    _reader(operator_client).rebuild_value = _rebuilt_routes(
        source_entry_id="fuente-inventada"
    )

    case = _confirm_vulnerabilities(operator_client, case_id)

    assert case["routes_status"] == "rebuild_failed"
    assert REBUILT_SUMMARY not in {route["summary"] for route in case["routes"]}


def test_a_case_cannot_be_approved_while_its_routes_are_rebuilding(
    operator_client, tiny_video_bytes
):
    """Breaks if someone can approve the route that is about to be replaced."""
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    _confirm_vulnerabilities(operator_client, case_id)
    _set_routes_status(operator_client, case_id, "rebuilding")

    response = operator_client.post(
        f"/api/v1/cases/{case_id}/approve",
        json=APPROVAL_PAYLOAD,
    )

    assert response.status_code == 409
    assert "ajustando" in response.json()["detail"]


def test_a_rebuild_interrupted_by_a_restart_can_be_retried(
    operator_client, tiny_video_bytes
):
    """Breaks if a crash mid-rebuild leaves the case blocked forever."""
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    _confirm_vulnerabilities(operator_client, case_id)
    _set_routes_status(operator_client, case_id, "rebuilding")

    with operator_client.app.state.database.session() as session:
        CaseService.recover_interrupted_route_rebuilds(session)

    case = operator_client.get(f"/api/v1/cases/{case_id}").json()
    assert case["routes_status"] == "rebuild_failed"


def test_the_rebuild_waits_for_the_critical_signals(
    operator_client, tiny_video_bytes
):
    """Breaks if routes can be rebuilt on signals nobody has confirmed."""
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)

    response = operator_client.post(f"/api/v1/cases/{case_id}/routes/rebuild")

    assert response.status_code == 409
    case = operator_client.get(f"/api/v1/cases/{case_id}").json()
    assert case["routes_status"] == "initial"


def test_failed_second_rebuild_keeps_sources_of_retained_routes(operator_client, tiny_video_bytes):
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    initial = operator_client.get(f"/api/v1/cases/{case_id}").json()
    original_ids = {source["id"] for source in initial["sources"]}
    source_id = next(source.id for source in operator_client.app.state.analysis.rag.groundable() if source.id not in original_ids)
    _reader(operator_client).rebuild_value = _rebuilt_routes(source_entry_id=source_id)
    _confirm_vulnerabilities(operator_client, case_id)
    _reader(operator_client).rebuild_value = TimeoutError("simulated")
    assert operator_client.post(f"/api/v1/cases/{case_id}/routes/rebuild").status_code == 202
    case = operator_client.get(f"/api/v1/cases/{case_id}").json()
    cited = {claim["source_entry_id"] for route in case["routes"] for step in route["steps"] for claim in step["claims"]}
    assert cited <= {source["id"] for source in case["sources"]}


def test_rebuild_discards_result_if_a_signal_changed_during_generation(operator_client, tiny_video_bytes):
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    initial = operator_client.get(f"/api/v1/cases/{case_id}").json()

    def build(segments, sources, classification, confirmed_signals):
        vulnerable = next(fact for fact in initial["facts"] if fact["key"] == "vulnerabilities")
        response = operator_client.patch(
            f"/api/v1/cases/{case_id}/facts/{vulnerable['id']}",
            json={"action": "correct", "value": ["none"]},
        )
        assert response.status_code == 200
        return _rebuilt_routes()

    _reader(operator_client).build_routes = build
    case = _confirm_vulnerabilities(operator_client, case_id)
    assert case["routes_status"] == "rebuild_failed"
    assert {route["id"] for route in case["routes"]} == {route["id"] for route in initial["routes"]}
    assert operator_client.post(f"/api/v1/cases/{case_id}/approve", json=APPROVAL_PAYLOAD).status_code == 409


def test_rebuild_rejects_applicable_routes_without_steps(operator_client, tiny_video_bytes):
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    routes = _rebuilt_routes()
    for route in routes.routes:
        route.steps = []
    _reader(operator_client).rebuild_value = routes
    case = _confirm_vulnerabilities(operator_client, case_id)
    assert case["routes_status"] == "rebuild_failed"
    assert all(route["steps"] for route in case["routes"])


def test_failed_rebuild_cannot_be_approved(operator_client, tiny_video_bytes):
    case_id = _case_awaiting_confirmation(operator_client, tiny_video_bytes)
    _reader(operator_client).rebuild_value = TimeoutError("simulated")
    _confirm_vulnerabilities(operator_client, case_id)
    response = operator_client.post(f"/api/v1/cases/{case_id}/approve", json=APPROVAL_PAYLOAD)
    assert response.status_code == 409
