from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.database import Database
from app.services.rag import (
    GroundingError,
    RagCatalog,
    SourceSeed,
    load_official_sources,
)


def _seed(
    *,
    source_id: str,
    expires_at: datetime,
    route_types: list[str],
) -> SourceSeed:
    now = datetime.now(timezone.utc)
    return SourceSeed(
        id=source_id,
        entity="Unidad para las Víctimas",
        program="Centro Regional de Atención a Víctimas de Popayán",
        coverage="Popayán, Cauca",
        requirements="Orientación inicial y verificación institucional.",
        contact="Consulte el canal oficial vigente.",
        url="https://www.unidadvictimas.gov.co/atencion-y-servicios-a-la-ciudadania/",
        verified_at=now,
        expires_at=expires_at,
        source_kind="contact",
        route_types=route_types,
        status="active",
    )


def test_fts_finds_official_sources_for_popayan_and_route_type():
    database = Database("sqlite://")
    database.create_schema()
    catalog = RagCatalog(database)
    with database.session() as session:
        catalog.upsert(
            session,
            _seed(
                source_id="uariv-crav-popayan",
                expires_at=datetime.now(timezone.utc) + timedelta(days=30),
                route_types=["emergency", "housing_stabilization"],
            ),
        )

    results = catalog.search(
        "atención Popayán",
        route_type="emergency",
    )

    assert [item.id for item in results] == ["uariv-crav-popayan"]


def test_expired_source_is_historical_and_requires_confirmation():
    database = Database("sqlite://")
    database.create_schema()
    catalog = RagCatalog(database)
    with database.session() as session:
        catalog.upsert(
            session,
            _seed(
                source_id="expired-contact",
                expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
                route_types=["emergency"],
            ),
        )

    result = catalog.get("expired-contact")

    assert result.is_expired is True
    assert result.status == "historical"
    assert result.disclaimer == "Requiere confirmación con la entidad"


def test_route_grounding_rejects_nonexistent_source_ids():
    database = Database("sqlite://")
    database.create_schema()
    catalog = RagCatalog(database)

    with pytest.raises(GroundingError, match="invented-source"):
        catalog.validate_source_ids(["invented-source"])


def test_retired_source_cannot_ground_new_route_claims():
    database = Database("sqlite://")
    database.create_schema()
    catalog = RagCatalog(database)
    with database.session() as session:
        source = _seed(
            source_id="retired-source",
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            route_types=["emergency"],
        ).model_copy(update={"status": "retired"})
        catalog.upsert(session, source)

    with pytest.raises(GroundingError, match="no activa"):
        catalog.validate_source_ids(["retired-source"])


def test_official_seed_uses_30_day_contacts_and_90_day_program_expiry():
    seeds = load_official_sources()

    assert {
        "uariv-services-national",
        "uariv-return-relocation",
        "defensoria-public-ministry",
        "icbf-mobile-units",
        "uariv-crav-popayan",
    }.issubset({seed.id for seed in seeds})
    assert all(seed.url.startswith("https://") for seed in seeds)
    assert all(
        (seed.expires_at - seed.verified_at).days
        == (30 if seed.source_kind == "contact" else 90)
        for seed in seeds
    )
