from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, HttpUrl
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.database import Database
from app.models import SourceEntry


class GroundingError(ValueError):
    pass


class SourceSeed(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    entity: str
    program: str
    coverage: str
    requirements: str
    contact: str
    url: str
    verified_at: datetime
    expires_at: datetime
    source_kind: Literal["contact", "program"]
    route_types: list[str]
    status: str = "active"


class SourceView(SourceSeed):
    is_expired: bool
    disclaimer: str | None


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


class RagCatalog:
    def __init__(self, database: Database) -> None:
        self.database = database
        self.ensure_fts()

    def ensure_fts(self) -> None:
        with self.database.engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE VIRTUAL TABLE IF NOT EXISTS source_entries_fts
                    USING fts5(
                        source_id UNINDEXED,
                        entity,
                        program,
                        coverage,
                        requirements,
                        contact,
                        route_types,
                        tokenize='unicode61 remove_diacritics 2'
                    )
                    """
                )
            )

    def upsert(self, session: Session, seed: SourceSeed) -> SourceEntry:
        entry = session.get(SourceEntry, seed.id)
        values = seed.model_dump()
        values["route_types"] = ",".join(seed.route_types)
        if entry is None:
            entry = SourceEntry(**values)
            session.add(entry)
        else:
            for key, value in values.items():
                if key != "id":
                    setattr(entry, key, value)
        session.flush()
        session.execute(
            text("DELETE FROM source_entries_fts WHERE source_id = :source_id"),
            {"source_id": seed.id},
        )
        session.execute(
            text(
                """
                INSERT INTO source_entries_fts(
                    source_id, entity, program, coverage, requirements, contact, route_types
                ) VALUES (
                    :source_id, :entity, :program, :coverage, :requirements, :contact, :route_types
                )
                """
            ),
            {
                "source_id": seed.id,
                "entity": seed.entity,
                "program": seed.program,
                "coverage": seed.coverage,
                "requirements": seed.requirements,
                "contact": seed.contact,
                "route_types": values["route_types"],
            },
        )
        return entry

    @staticmethod
    def _view(entry: SourceEntry, *, now: datetime | None = None) -> SourceView:
        reference = now or datetime.now(timezone.utc)
        expired = _as_utc(entry.expires_at) <= reference
        return SourceView(
            id=entry.id,
            entity=entry.entity,
            program=entry.program,
            coverage=entry.coverage,
            requirements=entry.requirements,
            contact=entry.contact,
            url=entry.url,
            verified_at=_as_utc(entry.verified_at),
            expires_at=_as_utc(entry.expires_at),
            source_kind=entry.source_kind,
            route_types=[
                value for value in entry.route_types.split(",") if value
            ],
            status="historical" if expired else entry.status,
            is_expired=expired,
            disclaimer=(
                "Requiere confirmación con la entidad" if expired else None
            ),
        )

    def get(self, source_id: str) -> SourceView:
        with self.database.session() as session:
            entry = session.get(SourceEntry, source_id)
            if entry is None:
                raise KeyError(source_id)
            return self._view(entry)

    def search(
        self,
        query: str,
        *,
        route_type: str | None = None,
        limit: int = 10,
    ) -> list[SourceView]:
        terms = " ".join(
            f'"{term.replace(chr(34), "")}"'
            for term in query.split()
            if term.strip()
        )
        if not terms:
            return []
        with self.database.session() as session:
            source_ids = list(
                session.scalars(
                    text(
                        """
                        SELECT source_id
                        FROM source_entries_fts
                        WHERE source_entries_fts MATCH :query
                        ORDER BY bm25(source_entries_fts)
                        LIMIT :limit
                        """
                    ),
                    {"query": terms, "limit": limit * 2},
                )
            )
            entries = [
                session.get(SourceEntry, source_id) for source_id in source_ids
            ]
            views = [
                self._view(entry)
                for entry in entries
                if entry is not None
                and (
                    route_type is None
                    or route_type in entry.route_types.split(",")
                )
            ]
            return views[:limit]

    def validate_source_ids(self, source_ids: list[str]) -> None:
        unique_ids = set(source_ids)
        if not unique_ids:
            return
        with self.database.session() as session:
            existing = set(
                session.scalars(
                    select(SourceEntry.id).where(SourceEntry.id.in_(unique_ids))
                )
            )
        missing = sorted(unique_ids - existing)
        if missing:
            raise GroundingError(
                f"source_entry_id inexistente: {', '.join(missing)}"
            )


def load_official_sources() -> list[SourceSeed]:
    path = Path(__file__).resolve().parents[1] / "data" / "official_sources.json"
    values = json.loads(path.read_text(encoding="utf-8"))
    return [SourceSeed.model_validate(value) for value in values]


def seed_official_sources(database: Database) -> int:
    catalog = RagCatalog(database)
    seeds = load_official_sources()
    with database.session() as session:
        for seed in seeds:
            catalog.upsert(session, seed)
    return len(seeds)
