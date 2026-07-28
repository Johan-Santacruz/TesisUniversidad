from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.dependencies import (
    AdminUser,
    CurrentUser,
    ReviewerUser,
    ValidatorUser,
    get_session,
)
from app.models import CaseRecord, Fact
from app.schemas import (
    CaseApprovalRead,
    CaseApprovalRequest,
    CaseRead,
    FactRead,
    FactReviewRequest,
    TombstoneRead,
)
from app.services.cases import CaseConflictError, CaseService


router = APIRouter(tags=["cases"])


def get_case_service(request: Request) -> CaseService:
    return request.app.state.cases


def _case_or_404(session: Session, case_id: str) -> CaseRecord:
    case = session.get(CaseRecord, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    return case


@router.get("/cases/{case_id}", response_model=CaseRead)
def read_case(
    case_id: str,
    _: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[CaseService, Depends(get_case_service)],
) -> CaseRead:
    return service.read(session, _case_or_404(session, case_id))


@router.patch("/cases/{case_id}/facts/{fact_id}", response_model=FactRead)
def review_fact(
    case_id: str,
    fact_id: str,
    payload: FactReviewRequest,
    actor: ReviewerUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[CaseService, Depends(get_case_service)],
) -> FactRead:
    case = _case_or_404(session, case_id)
    fact = session.get(Fact, fact_id)
    if fact is None or fact.case_id != case.id:
        raise HTTPException(status_code=404, detail="Hecho no encontrado")
    try:
        return service.review_fact(
            session,
            case=case,
            fact=fact,
            payload=payload,
            actor=actor,
        )
    except CaseConflictError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post("/cases/{case_id}/approve", response_model=CaseApprovalRead)
def approve_case(
    case_id: str,
    payload: CaseApprovalRequest,
    actor: ValidatorUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[CaseService, Depends(get_case_service)],
) -> CaseApprovalRead:
    try:
        return service.approve(
            session,
            case=_case_or_404(session, case_id),
            payload=payload,
            actor=actor,
        )
    except CaseConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.delete("/cases/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_case(
    case_id: str,
    actor: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[CaseService, Depends(get_case_service)],
) -> None:
    service.total_delete(
        session,
        case=_case_or_404(session, case_id),
        actor=actor,
    )


@router.get("/audit/tombstones/{case_id}", response_model=TombstoneRead)
def read_tombstone(
    case_id: str,
    _: AdminUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[CaseService, Depends(get_case_service)],
) -> TombstoneRead:
    tombstone = service.tombstone_for(session, case_id)
    if tombstone is None:
        raise HTTPException(status_code=404, detail="Tombstone no encontrado")
    return TombstoneRead.model_validate(tombstone, from_attributes=True)
