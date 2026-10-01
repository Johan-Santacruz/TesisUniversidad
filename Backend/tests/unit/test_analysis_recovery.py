"""Un reinicio no deja análisis «en curso» para siempre."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select

from app.ai.beto import BetoAdapter
from app.database import Database
from app.entities import Analysis, AnalysisEvent, User, Video
from app.security.crypto import EnvelopeCipher
from app.services.analysis import AnalysisService


def _service(tmp_path) -> tuple[Database, AnalysisService]:
    database = Database(f"sqlite:///{tmp_path / 'senda.db'}")
    database.create_schema()
    service = AnalysisService(
        database=database,
        cipher=EnvelopeCipher(keys={1: b"E" * 32}, current_version=1),
        rag=None,  # type: ignore[arg-type]
        beto=BetoAdapter(classifier=None),
    )
    return database, service


def _analysis(database: Database, *, status: str, stage: str | None) -> str:
    with database.session() as session:
        user = User(
            id=str(uuid4()),
            email=f"{uuid4()}@senda.local",
            password_hash="x",
            role="operador",
        )
        video = Video(
            id=str(uuid4()),
            owner_id=user.id,
            filename="testimonio.mp4",
            media_type="video/mp4",
            size_bytes=0,
            chunk_size=1024,
            key_version=1,
        )
        analysis = Analysis(
            id=str(uuid4()),
            video_id=video.id,
            requested_by_id=user.id,
            status=status,
            current_stage=stage,
        )
        session.add_all([user, video])
        session.flush()
        session.add(analysis)
        return analysis.id


def _stages(database: Database, analysis_id: str) -> list[str]:
    with database.session() as session:
        return list(
            session.scalars(
                select(AnalysisEvent.stage)
                .where(AnalysisEvent.analysis_id == analysis_id)
                .order_by(AnalysisEvent.sequence)
            )
        )


def test_el_analisis_cortado_cierra_sus_etapas_pendientes(tmp_path):
    """La pantalla espera el evento de rutas: sin él, preguntaba sin fin."""
    database, service = _service(tmp_path)
    analysis_id = _analysis(database, status="running", stage="transcription")

    assert service.recover_interrupted() == 1

    assert _stages(database, analysis_id) == [
        "people_places",
        "dates_facts",
        "classification",
        "sources",
        "timeline",
        "routes",
    ]
    with database.session() as session:
        analysis = session.get(Analysis, analysis_id)
        assert analysis.status == "partial"
        assert analysis.failure_code == "analysis_interrupted"


def test_el_analisis_en_cola_cierra_todas_sus_etapas(tmp_path):
    database, service = _service(tmp_path)
    analysis_id = _analysis(database, status="queued", stage=None)

    service.recover_interrupted()

    assert _stages(database, analysis_id)[0] == "audio"
    assert _stages(database, analysis_id)[-1] == "routes"


def test_si_el_caso_ya_se_guardo_el_analisis_se_da_por_terminado(tmp_path):
    database, service = _service(tmp_path)
    analysis_id = _analysis(database, status="running", stage="routes")

    service.recover_interrupted()

    assert _stages(database, analysis_id) == []
    with database.session() as session:
        assert session.get(Analysis, analysis_id).status == "completed"


def test_los_analisis_terminados_no_se_tocan(tmp_path):
    database, service = _service(tmp_path)
    analysis_id = _analysis(database, status="completed", stage="routes")

    assert service.recover_interrupted() == 0
    with database.session() as session:
        assert session.get(Analysis, analysis_id).status == "completed"
