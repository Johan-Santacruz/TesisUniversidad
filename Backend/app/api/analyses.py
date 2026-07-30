from __future__ import annotations

from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, OperatorUser, get_session
from app.models import Analysis, User, Video
from app.schemas import AnalysisRead, AnalysisReadinessRead, UserRole
from app.services.analysis import AnalysisService
from app.services.readiness import AnalysisReadinessService


router = APIRouter(tags=["analyses"])


def get_analysis_service(request: Request) -> AnalysisService:
    return request.app.state.analysis


def get_readiness_service(request: Request) -> AnalysisReadinessService:
    return request.app.state.readiness


@router.get("/analyses/readiness", response_model=AnalysisReadinessRead)
def get_readiness(
    user: CurrentUser,
    service: Annotated[AnalysisReadinessService, Depends(get_readiness_service)],
) -> AnalysisReadinessRead:
    return service.check(UserRole(user.role))


@router.post(
    "/videos/{video_id}/analyses",
    response_model=AnalysisRead,
    status_code=status.HTTP_202_ACCEPTED,
)
def start_analysis(
    video_id: str,
    background_tasks: BackgroundTasks,
    operator: OperatorUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[AnalysisService, Depends(get_analysis_service)],
) -> AnalysisRead:
    video = session.get(Video, video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    if operator.role != "admin" and video.owner_id != operator.id:
        raise HTTPException(status_code=403, detail="Sin acceso a este video")
    analysis = service.start(session, video=video, user=operator)
    session.commit()
    background_tasks.add_task(service.run, analysis.id)
    return AnalysisRead(
        id=analysis.id,
        video_id=video.id,
        status=analysis.status,
        current_stage=analysis.current_stage,
        events_url=f"/api/v1/analyses/{analysis.id}/events",
    )


def _can_read(user: User, video: Video) -> bool:
    return user.id == video.owner_id or user.role in {"validador", "admin"}


@router.get("/analyses/{analysis_id}/events")
def stream_analysis_events(
    analysis_id: str,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[AnalysisService, Depends(get_analysis_service)],
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
) -> StreamingResponse:
    analysis = session.get(Analysis, analysis_id)
    if analysis is None:
        raise HTTPException(status_code=404, detail="Análisis no encontrado")
    video = session.get(Video, analysis.video_id)
    if video is None or not _can_read(user, video):
        raise HTTPException(status_code=403, detail="Sin acceso a este análisis")
    try:
        after = int(last_event_id or 0)
    except ValueError:
        raise HTTPException(status_code=400, detail="Last-Event-ID inválido")
    return StreamingResponse(
        service.event_stream(analysis_id, after_sequence=max(0, after)),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store",
            "X-Accel-Buffering": "no",
        },
    )
