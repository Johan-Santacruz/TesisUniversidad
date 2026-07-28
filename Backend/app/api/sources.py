from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import AdminUser, get_session
from app.models import SourceEntry
from app.schemas import SourceCreate, SourceList, SourceRead, SourceUpdate
from app.services.audit import AuditService
from app.services.rag import RagCatalog, SourceSeed


router = APIRouter(prefix="/sources", tags=["administration"])


def get_rag(request: Request) -> RagCatalog:
    return request.app.state.rag


def get_audit(request: Request) -> AuditService:
    return request.app.state.audit


def _source_or_404(session: Session, source_id: str) -> SourceEntry:
    source = session.get(SourceEntry, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Fuente no encontrada")
    return source


def _seed_values(rag: RagCatalog, entry: SourceEntry) -> dict[str, object]:
    values = rag._view(entry).model_dump(mode="json")
    values.pop("is_expired")
    values.pop("disclaimer")
    return values


@router.get("", response_model=SourceList)
def list_sources(
    _: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    rag: Annotated[RagCatalog, Depends(get_rag)],
) -> SourceList:
    entries = list(session.scalars(select(SourceEntry).order_by(SourceEntry.id)))
    return SourceList(
        items=[SourceRead.model_validate(rag._view(entry)) for entry in entries]
    )


@router.post("", response_model=SourceRead, status_code=status.HTTP_201_CREATED)
def create_source(
    payload: SourceCreate,
    admin: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    rag: Annotated[RagCatalog, Depends(get_rag)],
    audit: Annotated[AuditService, Depends(get_audit)],
) -> SourceRead:
    if session.get(SourceEntry, payload.id) is not None:
        raise HTTPException(status_code=409, detail="La fuente ya existe")
    seed = SourceSeed.model_validate(payload.model_dump(mode="json"))
    entry = rag.upsert(session, seed)
    session.add(
        audit.build_record(
            actor_id=admin.id,
            actor_role=admin.role,
            action="source_created",
            entity_type="source",
            entity_id=entry.id,
            details={"status": entry.status},
        )
    )
    return SourceRead.model_validate(rag._view(entry))


@router.get("/{source_id}", response_model=SourceRead)
def get_source(
    source_id: str,
    _: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    rag: Annotated[RagCatalog, Depends(get_rag)],
) -> SourceRead:
    return SourceRead.model_validate(rag._view(_source_or_404(session, source_id)))


@router.patch("/{source_id}", response_model=SourceRead)
def update_source(
    source_id: str,
    payload: SourceUpdate,
    admin: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    rag: Annotated[RagCatalog, Depends(get_rag)],
    audit: Annotated[AuditService, Depends(get_audit)],
) -> SourceRead:
    entry = _source_or_404(session, source_id)
    current = _seed_values(rag, entry)
    current.update(payload.model_dump(mode="json", exclude_unset=True))
    updated = rag.upsert(session, SourceSeed.model_validate(current))
    session.add(
        audit.build_record(
            actor_id=admin.id,
            actor_role=admin.role,
            action="source_updated",
            entity_type="source",
            entity_id=source_id,
            details={"changed_fields": sorted(payload.model_fields_set)},
        )
    )
    return SourceRead.model_validate(rag._view(updated))


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
def retire_source(
    source_id: str,
    admin: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    rag: Annotated[RagCatalog, Depends(get_rag)],
    audit: Annotated[AuditService, Depends(get_audit)],
) -> None:
    entry = _source_or_404(session, source_id)
    current = _seed_values(rag, entry)
    current["status"] = "retired"
    rag.upsert(session, SourceSeed.model_validate(current))
    session.add(
        audit.build_record(
            actor_id=admin.id,
            actor_role=admin.role,
            action="source_retired",
            entity_type="source",
            entity_id=source_id,
            details={},
        )
    )
