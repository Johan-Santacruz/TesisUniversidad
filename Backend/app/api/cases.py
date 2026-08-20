from __future__ import annotations

import logging

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import (
    AdminUser,
    CurrentUser,
    ReviewerUser,
    ValidatorUser,
    get_session,
)
from app.entities import CaseRecord, Fact, MemoryImage, RenderedVideo, Route, Video
from app.schemas import (
    CaseApprovalRead,
    CaseApprovalRequest,
    CaseRead,
    FactRead,
    FactReviewRequest,
    MemoryImageDecisionRead,
    MemoryImageDecisionRequest,
    TombstoneRead,
)
from app.services.cases import CaseConflictError, CaseService
from app.services.memory_images import (
    MemoryImageAssetUnavailableError,
    MemoryImageConflictError,
    MemoryImageService,
)
from app.services.narration import NarrationService, NarrationUnavailableError
from app.services.videos import VideoService, parse_byte_range


logger = logging.getLogger(__name__)
router = APIRouter(tags=["cases"])


def get_case_service(request: Request) -> CaseService:
    return request.app.state.cases


def get_memory_image_service(request: Request) -> MemoryImageService:
    return request.app.state.memory_images


def get_video_service(request: Request) -> VideoService:
    return request.app.state.videos


def get_narration_service(request: Request) -> NarrationService:
    return request.app.state.narration


def _case_or_404(session: Session, case_id: str) -> CaseRecord:
    case = session.get(CaseRecord, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Caso no encontrado")
    return case


def _can_read_memory_image(user_id: str, user_role: str, video: Video) -> bool:
    return user_id == video.owner_id or user_role in {"validador", "admin"}


# La imagen y el derivado se entregan como bytes. Declararlo evita que el
# cliente generado los tipe como JSON y trate de interpretarlos. La clase sólo
# documenta: los endpoints devuelven su propia respuesta con el MIME real.
class _BinaryResponse(Response):
    media_type = "application/octet-stream"


_BINARY_RESPONSE: dict[int | str, dict[str, Any]] = {
    200: {
        "content": {
            "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
        }
    }
}


@router.get("/cases/{case_id}", response_model=CaseRead)
def read_case(
    case_id: str,
    _: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[CaseService, Depends(get_case_service)],
) -> CaseRead:
    return service.read(session, _case_or_404(session, case_id))


@router.get(
    "/cases/{case_id}/memory-image/content",
    response_class=_BinaryResponse,
    responses=_BINARY_RESPONSE,
)
def read_memory_image_content(
    case_id: str,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[MemoryImageService, Depends(get_memory_image_service)],
) -> Response:
    case = _case_or_404(session, case_id)
    video = session.get(Video, case.video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    if not _can_read_memory_image(user.id, user.role, video):
        raise HTTPException(status_code=403, detail="Sin acceso a esta imagen")
    image = service.active_for_case(session, case.id)
    if image is None or image.status not in {"pending_review", "approved"}:
        raise HTTPException(status_code=404, detail="Imagen de memoria no disponible")
    if image.image_mime_type is None:
        raise HTTPException(status_code=404, detail="Imagen de memoria no disponible")
    try:
        content = service.read_image(image)
    except MemoryImageAssetUnavailableError:
        raise HTTPException(status_code=404, detail="Imagen de memoria no disponible")
    return Response(
        content=content,
        media_type=image.image_mime_type,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Length": str(len(content)),
        },
    )


@router.post("/cases/{case_id}/memory-image/regenerate", response_model=MemoryImageDecisionRead)
def regenerate_memory_image(
    case_id: str,
    actor: ValidatorUser,
    session: Annotated[Session, Depends(get_session)],
    case_service: Annotated[CaseService, Depends(get_case_service)],
    service: Annotated[MemoryImageService, Depends(get_memory_image_service)],
) -> MemoryImageDecisionRead:
    case = _case_or_404(session, case_id)
    try:
        image = service.regenerate(case.id, actor)
    except MemoryImageConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return MemoryImageDecisionRead(
        memory_image=case_service.memory_image_read(session, case, image)
    )


@router.post("/cases/{case_id}/memory-image/decision", response_model=MemoryImageDecisionRead)
def decide_memory_image(
    case_id: str,
    payload: MemoryImageDecisionRequest,
    actor: ValidatorUser,
    session: Annotated[Session, Depends(get_session)],
    case_service: Annotated[CaseService, Depends(get_case_service)],
    service: Annotated[MemoryImageService, Depends(get_memory_image_service)],
) -> MemoryImageDecisionRead:
    case = _case_or_404(session, case_id)
    image = service.active_for_case(session, case.id)
    if image is None:
        raise HTTPException(status_code=404, detail="Imagen de memoria no encontrada")
    try:
        changed = service.decide(session, image=image, action=payload.action, actor=actor)
    except MemoryImageConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if payload.action == "approve":
        session.commit()
        service.render_approved(changed.id)
        changed = session.get(MemoryImage, changed.id) or changed
    return MemoryImageDecisionRead(
        memory_image=case_service.memory_image_read(session, case, changed)
    )


@router.post("/cases/{case_id}/rendered-video/retry", response_model=MemoryImageDecisionRead)
def retry_rendered_video(
    case_id: str,
    actor: ValidatorUser,
    session: Annotated[Session, Depends(get_session)],
    case_service: Annotated[CaseService, Depends(get_case_service)],
    service: Annotated[MemoryImageService, Depends(get_memory_image_service)],
) -> MemoryImageDecisionRead:
    case = _case_or_404(session, case_id)
    image = service.active_for_case(session, case.id)
    if image is None or image.status != "approved":
        raise HTTPException(status_code=409, detail="No hay una imagen aprobada activa")
    session.commit()
    service.render_approved(image.id)
    refreshed = service.active_for_case(session, case.id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Imagen de memoria no encontrada")
    return MemoryImageDecisionRead(
        memory_image=case_service.memory_image_read(session, case, refreshed)
    )


@router.get(
    "/cases/{case_id}/rendered-video/stream",
    response_class=_BinaryResponse,
    responses=_BINARY_RESPONSE,
)
def stream_rendered_video(
    case_id: str,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[VideoService, Depends(get_video_service)],
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> StreamingResponse:
    case = _case_or_404(session, case_id)
    original = session.get(Video, case.video_id)
    if original is None:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    if not _can_read_memory_image(user.id, user.role, original):
        raise HTTPException(status_code=403, detail="Sin acceso a este video")
    image = session.scalar(
        select(MemoryImage)
        .where(MemoryImage.case_id == case.id)
        .order_by(MemoryImage.generation.desc())
        .limit(1)
    )
    if image is None:
        raise HTTPException(status_code=404, detail="Video derivado no disponible")
    rendered = session.scalar(
        select(RenderedVideo).where(
            RenderedVideo.memory_image_id == image.id,
            RenderedVideo.status == "ready",
            RenderedVideo.video_id.is_not(None),
        )
    )
    if rendered is None or rendered.video_id is None:
        raise HTTPException(status_code=404, detail="Video derivado no disponible")
    video = session.get(Video, rendered.video_id)
    if video is None or video.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Video derivado no disponible")
    try:
        start, end, partial = parse_byte_range(range_header, video.size_bytes)
    except ValueError:
        raise HTTPException(
            status_code=416,
            detail="Rango no satisfacible",
            headers={"Content-Range": f"bytes */{video.size_bytes}"},
        )
    length = end - start + 1
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Cache-Control": "private, no-store",
    }
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{video.size_bytes}"
    return StreamingResponse(
        service.chunk_cipher.iter_range(video.id, service.manifest(video), start, end),
        status_code=206 if partial else 200,
        media_type=video.media_type,
        headers=headers,
    )


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
    try:
        service.total_delete(
            session,
            case=_case_or_404(session, case_id),
            actor=actor,
        )
    except CaseConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    session.commit()
    service.process_pending_purges()


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


@router.get(
    "/cases/{case_id}/routes/{route_id}/steps/{step_index}/narration",
    response_class=_BinaryResponse,
    responses=_BINARY_RESPONSE,
)
def narrate_route_step(
    case_id: str,
    route_id: str,
    step_index: int,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    case_service: Annotated[CaseService, Depends(get_case_service)],
    service: Annotated[NarrationService, Depends(get_narration_service)],
) -> Response:
    case = _case_or_404(session, case_id)
    video = session.get(Video, case.video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    if not _can_read_memory_image(user.id, user.role, video):
        raise HTTPException(status_code=403, detail="Sin acceso a esta ruta")
    route = session.get(Route, route_id)
    if route is None or route.case_id != case.id:
        raise HTTPException(status_code=404, detail="Ruta no encontrada")
    # El texto sale del paso persistido: el cliente sólo elige cuál, nunca qué
    # se dice. Si no, el endpoint sería un proxy de voz abierto.
    steps = case_service.route_steps(route)
    if step_index < 0 or step_index >= len(steps):
        raise HTTPException(status_code=404, detail="Paso no encontrado")
    try:
        audio = service.narrate_step(steps[step_index])
    except NarrationUnavailableError:
        raise HTTPException(status_code=503, detail="La narración no está configurada")
    except ValueError:
        raise HTTPException(status_code=404, detail="El paso no tiene texto para narrar")
    except Exception as exc:
        # La causa va en el mensaje, no en `extra`: el formato de consola por
        # defecto no imprime los campos extra, asi que la razon quedaba
        # invisible justo cuando hace falta. Quien opera SENDA la necesita;
        # quien consulta el caso, no.
        logger.warning("route_narration_failed: %s", exc)
        raise HTTPException(status_code=502, detail="No se pudo generar la narración")
    return Response(
        content=audio.data,
        media_type=audio.mime_type,
        headers={
            "Cache-Control": "private, no-store",
            "Content-Length": str(len(audio.data)),
        },
    )
