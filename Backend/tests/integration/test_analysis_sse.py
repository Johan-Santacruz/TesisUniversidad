from __future__ import annotations

from sqlalchemy import select

from app.models import AnalysisEvent


EXPECTED_STAGES = [
    "audio",
    "transcription",
    "people_places",
    "dates_facts",
    "classification",
    "sources",
    "timeline",
    "routes",
]


def _start_demo_analysis(operator_client) -> dict:
    video = operator_client.post("/api/v1/videos/demo").json()
    response = operator_client.post(
        f"/api/v1/videos/{video['id']}/analyses"
    )
    assert response.status_code == 202
    return response.json()


def test_demo_analysis_persists_all_eight_stages_in_order(operator_client):
    analysis = _start_demo_analysis(operator_client)

    response = operator_client.get(analysis["events_url"])

    assert response.status_code == 200
    assert [
        line.removeprefix("event: ")
        for line in response.text.splitlines()
        if line.startswith("event: ")
    ] == EXPECTED_STAGES
    assert [line for line in response.text.splitlines() if line.startswith("id: ")] == [
        f"id: {sequence}" for sequence in range(1, 9)
    ]


def test_last_event_id_replays_only_newer_persisted_events(operator_client):
    analysis = _start_demo_analysis(operator_client)

    response = operator_client.get(
        analysis["events_url"],
        headers={"Last-Event-ID": "3"},
    )

    assert "id: 3\n" not in response.text
    assert "id: 4\n" in response.text
    assert "event: people_places\n" not in response.text
    assert "event: dates_facts\n" in response.text


def test_event_payloads_are_encrypted_at_rest(operator_client):
    analysis = _start_demo_analysis(operator_client)
    database = operator_client.app.state.database

    with database.session() as session:
        events = list(
            session.scalars(
                select(AnalysisEvent)
                .where(AnalysisEvent.analysis_id == analysis["id"])
                .order_by(AnalysisEvent.sequence)
            )
        )

    assert len(events) == 8
    assert all(event.key_version == 1 for event in events)
    assert all(b"Popay" not in event.ciphertext for event in events)
    assert all(event.nonce and event.ciphertext for event in events)


def test_multiple_demo_cases_do_not_reuse_sensitive_record_ids(operator_client):
    first = _start_demo_analysis(operator_client)
    second = _start_demo_analysis(operator_client)

    assert first["id"] != second["id"]
    assert operator_client.get(first["events_url"]).status_code == 200
    assert operator_client.get(second["events_url"]).status_code == 200
