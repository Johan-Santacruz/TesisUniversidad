from __future__ import annotations

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Header,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import CurrentUser, OperatorUser, get_session
from app.entities import User, Video
from app.schemas import VideoRead
from app.services.videos import (
    InvalidVideoError,
    VideoService,
    VideoTooLargeError,
    parse_byte_range,
)
from app.services.media import (
    EmptyMediaError,
    MediaToolUnavailableError,
    NoAudioTrackError,
)


router = APIRouter(prefix="/videos", tags=["videos"])


def get_video_service(request: Request) -> VideoService:
    return request.app.state.videos


@router.post("", response_model=VideoRead, status_code=status.HTTP_201_CREATED)
def upload_video(
    operator: OperatorUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[VideoService, Depends(get_video_service)],
    file: Annotated[UploadFile, File()],
) -> Video:
    try:
        return service.create(
            session,
            user=operator,
            source=file.file,
        )
    except NoAudioTrackError:
        raise HTTPException(
            status_code=422,
            detail="El video no contiene una pista de audio",
        )
    except EmptyMediaError:
        raise HTTPException(status_code=422, detail="El video está vacío")
    except MediaToolUnavailableError:
        raise HTTPException(
            status_code=503,
            detail="El servicio de validación audiovisual no está disponible",
        )
    except InvalidVideoError as exc:
        raise HTTPException(status_code=415, detail=str(exc))
    except VideoTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc))


@router.post("/demo", response_model=VideoRead, status_code=status.HTTP_201_CREATED)
def create_demo_video(
    operator: OperatorUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[VideoService, Depends(get_video_service)],
) -> Video:
    return service.create_demo(session, user=operator)


def _can_read_video(user: User, video: Video) -> bool:
    return user.id == video.owner_id or user.role in {"validador", "admin"}


@router.get("/{video_id}/stream")
def stream_video(
    video_id: str,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[VideoService, Depends(get_video_service)],
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> StreamingResponse:
    video = session.get(Video, video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    if not _can_read_video(user, video):
        raise HTTPException(status_code=403, detail="Sin acceso a este video")
    if video.deleted_at is not None:
        raise HTTPException(status_code=410, detail="El video fue eliminado por retención")
    try:
        start, end, partial = parse_byte_range(range_header, video.size_bytes)
    except ValueError:
        raise HTTPException(
            status_code=416,
            detail="Rango no satisfacible",
            headers={"Content-Range": f"bytes */{video.size_bytes}"},
        )
    manifest = service.manifest(video)
    length = end - start + 1
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Cache-Control": "private, no-store",
    }
    if partial:
        headers["Content-Range"] = f"bytes {start}-{end}/{video.size_bytes}"
    return StreamingResponse(
        service.chunk_cipher.iter_range(video.id, manifest, start, end),
        status_code=206 if partial else 200,
        media_type=video.media_type,
        headers=headers,
    )
