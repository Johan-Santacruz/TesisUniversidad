from __future__ import annotations

import os
from pathlib import Path
import shutil
import tempfile
import time
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
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
from app.schemas import AnalysisRead, VideoIntakeRead, VideoLinkCreate, VideoRead
from app.services.analysis import AnalysisService
from app.services.videos import (
    RECEIVING_STATUSES,
    AudioMismatchError,
    AudioTooLargeError,
    InvalidVideoError,
    VideoNotAwaitedError,
    VideoService,
    VideoTooLargeError,
    parse_byte_range,
)
from app.services.media import (
    EmptyMediaError,
    MediaToolUnavailableError,
    NoAudioTrackError,
)
from app.services.video_links import (
    DownloaderUnavailableError,
    LinkIngestDisabledError,
    VideoLinkError,
    VideoLinkService,
)


router = APIRouter(prefix="/videos", tags=["videos"])

# Prefijo del WAV que espera en disco a que el análisis lo lea. Si el proceso se
# detiene antes de borrarlo, el arranque siguiente lo encuentra por este nombre.
INTAKE_AUDIO_PREFIX = "senda-audio-"


def _park_intake_audio(source) -> Path:
    """Copia el audio subido a un archivo privado, fuera del almacenamiento.

    El análisis corre después de responder y dura minutos: leerlo como bytes
    lo mantenía entero en memoria todo ese tiempo. Mientras se sube ya vive en
    un temporal del servidor, así que esperar en disco no expone nada nuevo.
    """
    descriptor, name = tempfile.mkstemp(prefix=INTAKE_AUDIO_PREFIX, suffix=".wav")
    path = Path(name)
    try:
        with os.fdopen(descriptor, "wb") as target:
            source.seek(0)
            shutil.copyfileobj(source, target)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return path


# Un WAV más viejo que esto ya no lo espera ningún análisis: ni el más largo en
# cola tarda tanto. Los recientes pueden ser de otro proceso en marcha —un
# servidor de desarrollo mientras corren las pruebas— y no se tocan.
STALE_INTAKE_AUDIO_SECONDS = 6 * 60 * 60


def discard_stale_intake_audio(*, now: float | None = None) -> None:
    """Borra los WAV que un reinicio dejó sin leer: su análisis ya no corre."""
    limit = (now if now is not None else time.time()) - STALE_INTAKE_AUDIO_SECONDS
    for path in Path(tempfile.gettempdir()).glob(f"{INTAKE_AUDIO_PREFIX}*.wav"):
        try:
            if path.stat().st_mtime < limit:
                path.unlink(missing_ok=True)
        except FileNotFoundError:
            continue


def get_video_service(request: Request) -> VideoService:
    return request.app.state.videos


def get_video_link_service(request: Request) -> VideoLinkService:
    return request.app.state.video_links


def get_analysis_service(request: Request) -> AnalysisService:
    return request.app.state.analysis


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


@router.post(
    "/intake",
    response_model=VideoIntakeRead,
    status_code=status.HTTP_201_CREATED,
)
def intake_video_audio(
    background_tasks: BackgroundTasks,
    operator: OperatorUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[VideoService, Depends(get_video_service)],
    analyses: Annotated[AnalysisService, Depends(get_analysis_service)],
    audio: Annotated[UploadFile, File()],
    size_bytes: Annotated[int, Form()],
    media_type: Annotated[str, Form()] = "",
) -> VideoIntakeRead:
    """Recibe el audio del testimonio y arranca el análisis sin esperar al video.

    El navegador separa el audio y lo manda primero: pesa decenas de veces
    menos que el video de un celular. El video sigue subiendo mientras tanto y
    llega por PUT /videos/{id}/content. `size_bytes` y `media_type` son los del
    video que viene detrás.
    """
    try:
        video = service.create_receiving(
            session,
            user=operator,
            audio=audio.file,
            media_type=media_type,
            size_bytes=size_bytes,
        )
    except AudioTooLargeError:
        raise HTTPException(
            status_code=413,
            detail="El audio supera el tamaño permitido",
        )
    except VideoTooLargeError:
        raise HTTPException(
            status_code=413,
            detail="El video supera el tamaño permitido",
        )
    except EmptyMediaError:
        raise HTTPException(status_code=422, detail="El audio está vacío")
    except InvalidVideoError as exc:
        raise HTTPException(status_code=415, detail=str(exc))
    audio_path = _park_intake_audio(audio.file)
    try:
        analysis = analyses.start(session, video=video, user=operator)
        session.commit()
    except BaseException:
        audio_path.unlink(missing_ok=True)
        raise
    background_tasks.add_task(analyses.run_from_file, analysis.id, audio_path)
    return VideoIntakeRead(
        video=VideoRead.model_validate(video),
        analysis=AnalysisRead(
            id=analysis.id,
            video_id=video.id,
            status=analysis.status,
            current_stage=analysis.current_stage,
            events_url=f"/api/v1/analyses/{analysis.id}/events",
        ),
    )


@router.put("/{video_id}/content", response_model=VideoRead)
def upload_video_content(
    video_id: str,
    background_tasks: BackgroundTasks,
    operator: OperatorUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[VideoService, Depends(get_video_service)],
    analyses: Annotated[AnalysisService, Depends(get_analysis_service)],
    file: Annotated[UploadFile, File()],
) -> Video:
    """Entrega el video de un testimonio que se registró por su audio."""
    video = session.get(Video, video_id)
    if video is None:
        raise HTTPException(status_code=404, detail="Video no encontrado")
    if operator.role != "admin" and video.owner_id != operator.id:
        raise HTTPException(status_code=403, detail="Sin acceso a este video")
    if not service.claim_receiving(session, video.id):
        raise HTTPException(
            status_code=409,
            detail="Este video ya se recibió o se está recibiendo",
        )
    # El reclamo se confirma antes de cifrar: así una segunda subida lo ve, y el
    # análisis, que escribe en la misma base, no queda esperando un bloqueo.
    session.commit()
    try:
        video = service.attach_content(
            session,
            video=video,
            source=file.file,
            user=operator,
        )
        session.commit()
    except Exception as exc:
        session.rollback()
        service.release_receiving(session, video_id)
        session.commit()
        mapped = _content_error(exc)
        if mapped is None:
            raise
        raise mapped from exc
    background_tasks.add_task(analyses.generate_closing_for_video, video.id)
    return video


def _content_error(exc: Exception) -> HTTPException | None:
    if isinstance(exc, AudioMismatchError):
        return HTTPException(
            status_code=422,
            detail="Este video no es la grabación cuyo audio se analizó",
        )
    if isinstance(exc, NoAudioTrackError):
        return HTTPException(
            status_code=422,
            detail="El video no contiene una pista de audio",
        )
    if isinstance(exc, EmptyMediaError):
        return HTTPException(status_code=422, detail="El video está vacío")
    if isinstance(exc, MediaToolUnavailableError):
        return HTTPException(
            status_code=503,
            detail="El servicio de validación audiovisual no está disponible",
        )
    if isinstance(exc, InvalidVideoError):
        return HTTPException(status_code=415, detail=str(exc))
    if isinstance(exc, VideoTooLargeError):
        return HTTPException(status_code=413, detail=str(exc))
    if isinstance(exc, VideoNotAwaitedError):
        return HTTPException(
            status_code=409,
            detail="Este video ya no espera su archivo",
        )
    return None


@router.post("/link", response_model=VideoRead, status_code=status.HTTP_201_CREATED)
def create_video_from_link(
    operator: OperatorUser,
    session: Annotated[Session, Depends(get_session)],
    service: Annotated[VideoService, Depends(get_video_service)],
    links: Annotated[VideoLinkService, Depends(get_video_link_service)],
    payload: VideoLinkCreate,
) -> Video:
    """Baja el video del enlace y lo mete por el mismo camino que un archivo.

    Los errores de descarga se traducen a 422 con el motivo tal cual: quien pega
    un enlace privado, uno que no es de YouTube o uno que dura una hora tiene
    que poder leer cuál de las tres cosas pasó.
    """
    try:
        with links.fetch(payload.url) as descarga:
            return service.create(session, user=operator, source=descarga.source)
    except LinkIngestDisabledError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except DownloaderUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except VideoLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except NoAudioTrackError:
        raise HTTPException(
            status_code=422,
            detail="El video del enlace no contiene una pista de audio",
        )
    except EmptyMediaError:
        raise HTTPException(status_code=422, detail="El video del enlace está vacío")
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
    if video.status in RECEIVING_STATUSES:
        raise HTTPException(status_code=409, detail="El video todavía se está subiendo")
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
    # La transmisión puede durar minutos y no vuelve a tocar la base: se cierra
    # la transacción ya, para no retener una conexión del pool todo ese tiempo.
    session.commit()
    return StreamingResponse(
        service.chunk_cipher.iter_range(video.id, manifest, start, end),
        status_code=206 if partial else 200,
        media_type=video.media_type,
        headers=headers,
    )
