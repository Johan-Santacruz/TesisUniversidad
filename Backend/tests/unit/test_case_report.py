from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any

import pytest
from pypdf import PdfReader

from app.schemas import CaseRead
from app.services import case_report
from app.services.case_report import ReportContext, includes_routes, render_case_report


SOURCE = {
    "id": "uariv-crav-popayan",
    "entity": "Unidad para las Víctimas",
    "program": "CRAV Popayán",
    "coverage": "Popayán, Cauca",
    "requirements": "Documento de identidad.",
    "contact": "Línea nacional gratuita.",
    "url": "https://www.unidadvictimas.gov.co/",
    "verified_at": "2026-07-01T00:00:00Z",
    "expires_at": "2026-12-31T00:00:00Z",
    "source_kind": "contact",
    "route_types": ["emergency"],
    "status": "active",
    "is_expired": False,
    "disclaimer": None,
}


def _case(**overrides: Any) -> CaseRead:
    values: dict[str, Any] = {
        "id": "3f2a9c1b-0000-4000-8000-000000000000",
        "analysis_id": "analysis",
        "video_id": "video",
        "status": "in_review",
        "recommendation_status": "preliminary",
        "approved_at": None,
        "video_stream_url": "/api/v1/videos/video/stream",
        "critical_inconsistencies": 0,
        "routes_status": "initial",
        "segments": [
            {
                "id": "segment-1",
                "start_ms": 0,
                "end_ms": 14200,
                "text": "Frase textual del testimonio que no viaja en el resumen.",
            }
        ],
        "timeline": [
            {
                "id": "event-1",
                "title": "Salida de El Tambo",
                "description": "La familia relata la salida de su territorio.",
                "start_ms": 0,
                "end_ms": 14200,
                "origin": "mentioned",
                "verification_status": "confirmed",
                "confidence_band": "high",
            }
        ],
        "facts": [
            {
                "id": "fact-location",
                "key": "current_location",
                "label": "Ubicación actual",
                "value": "Popayán, Cauca",
                "display_value": "Popayán, Cauca",
                "origin": "contrasted",
                "verification_status": "confirmed",
                "confidence_band": "high",
                "is_critical": False,
                "evidence": [
                    {"segment_id": "segment-1", "start_ms": 18400, "end_ms": 31800}
                ],
            },
            {
                "id": "fact-urgency",
                "key": "urgency",
                "label": "Urgencia",
                "value": "high",
                "display_value": "Alta",
                "origin": "contrasted",
                "verification_status": "confirmed",
                "confidence_band": "high",
                "is_critical": True,
                "evidence": [],
            },
        ],
        "classification": {
            "category": {"label": "Desplazamiento", "confidence": 0.91},
            "subcategory": {"label": "Desplazamiento forzado", "confidence": 0.19},
        },
        "sources": [SOURCE],
        "routes": [
            {
                "id": "route-emergency",
                "route_type": "emergency",
                "title": "Atención inmediata",
                "summary": "Orientación inicial y valoración institucional.",
                "verification_status": "pending",
                "confidence_band": "medium",
                "steps": [
                    {
                        "title": "Contactar el punto territorial",
                        "key_point": "Lleve la denuncia impresa.",
                        "instructions": "Confirme el horario antes del traslado.",
                        "claims": [
                            {
                                "text": "El CRAV orienta el acceso a la oferta.",
                                "source_entry_id": "uariv-crav-popayan",
                            },
                            {
                                "text": "Afirmación sin respaldo.",
                                "source_entry_id": "fuente-retirada",
                            },
                        ],
                    }
                ],
            }
        ],
    }
    values.update(overrides)
    return CaseRead.model_validate(values)


def _context(**overrides: Any) -> ReportContext:
    values: dict[str, Any] = {
        "reference": "3F2A9C1B",
        # 03:45 en UTC son las 10:45 p. m. del día anterior en Colombia.
        "analyzed_at": datetime(2026, 10, 24, 3, 45, tzinfo=timezone.utc),
        "is_demo": False,
        "generated_at": datetime(2026, 10, 25, 15, 5, tzinfo=timezone.utc),
        "generated_by_role": "validador",
    }
    values.update(overrides)
    return ReportContext(**values)


def _read(content: bytes) -> tuple[PdfReader, str]:
    reader = PdfReader(BytesIO(content))
    text = "\n".join(page.extract_text() for page in reader.pages)
    # El ajuste de línea parte frases largas: se comparan con espacios simples.
    return reader, " ".join(text.split())


def _pending(case: CaseRead) -> CaseRead:
    facts = [
        fact.model_copy(update={"verification_status": "pending"})
        if fact.is_critical
        else fact
        for fact in case.facts
    ]
    return case.model_copy(update={"facts": facts, "critical_inconsistencies": 1})


def test_report_summarises_what_the_analysis_extracted():
    reader, text = _read(render_case_report(_case(), _context()))

    assert reader.metadata.title == "Resumen del caso 3F2A9C1B"
    assert reader.metadata.author == "SENDA"
    assert "Caso 3F2A9C1B".upper() in text
    assert "lectura firme · 91% de confianza" in text
    assert "sin calibrar · contrástela con el relato" in text
    assert "Ubicación actual Popayán, Cauca Confirmada 0:18" in text
    assert "Salida de El Tambo" in text
    assert "Atención inmediata" in text
    assert "Lo esencial: Lleve la denuncia impresa." in text
    assert "Fuente 1: Unidad para las Víctimas · CRAV Popayán" in text
    assert "Sin fuente institucional verificable." in text
    assert "Vigente hasta el 31 de diciembre de 2026" in text
    assert "Página 1 de" in text


def test_report_never_carries_the_transcript():
    _, text = _read(render_case_report(_case(), _context()))

    assert "Frase textual del testimonio" not in text
    assert "no incluye la transcripción ni el video" in text


def test_dates_are_written_in_colombian_time():
    _, text = _read(render_case_report(_case(), _context()))

    assert "23 de octubre de 2026, 10:45 p. m." in text
    assert "Generado el 25 de octubre de 2026, 10:05 a. m." in text


def test_preliminary_orientation_is_flagged_and_final_is_not():
    _, preliminary = _read(render_case_report(_case(), _context()))
    approved = _case(
        status="approved",
        recommendation_status="final",
        approved_at="2026-10-25T14:00:00Z",
    )
    _, final = _read(render_case_report(approved, _context()))

    assert "Orientación preliminar" in preliminary
    assert "Orientación preliminar" not in final
    assert "Aprobado el 25 de octubre de 2026" in final


def test_routes_are_withheld_while_critical_signals_are_unconfirmed():
    case = _pending(_case())

    _, text = _read(render_case_report(case, _context()))

    assert not includes_routes(case)
    assert "Las rutas se incluirán cuando las señales críticas estén confirmadas" in text
    assert "Urgencia" in text
    assert "Crítica · bloquea la aprobación" in text
    assert "Contactar el punto territorial" not in text
    # Sin rutas impresas, las fuentes no tienen nada que respaldar.
    assert "Fuentes institucionales" not in text


def test_routes_are_withheld_while_they_are_being_rebuilt():
    case = _case(routes_status="rebuilding")

    _, text = _read(render_case_report(case, _context()))

    assert not includes_routes(case)
    assert "La ruta se está ajustando con las señales confirmadas" in text
    assert "Contactar el punto territorial" not in text


def test_missing_values_say_why_they_are_missing():
    facts = [
        {
            "id": "fact-date",
            "key": "event_date",
            "label": "Fecha exacta",
            "value": None,
            "origin": "mentioned",
            "verification_status": "not_identified",
            "confidence_band": "low",
            "is_critical": False,
        },
        {
            "id": "fact-armed-actor",
            "key": "armed_actor",
            "label": "Actor armado",
            "value": None,
            "origin": "contrasted",
            "verification_status": "inconsistent",
            "confidence_band": "low",
            "is_critical": False,
            "provider_values": {"gpt": "paramilitares", "claude": "guerrilla"},
        },
    ]

    _, text = _read(render_case_report(_case(facts=facts), _context()))

    assert "Fecha exacta No se encontró en el relato Sin dato —" in text
    assert "Actor armado Las lecturas no coinciden Requiere revisión" in text


def test_text_that_looks_like_markup_is_printed_literally():
    timeline = [
        {
            "id": "event-1",
            "title": "Llegada <b>sin</b> alojamiento & sin red",
            "description": "Descripción con <br> y &amp; literales.",
            "start_ms": 0,
            "end_ms": 1000,
            "origin": "mentioned",
            "verification_status": "confirmed",
            "confidence_band": "high",
        }
    ]

    _, text = _read(render_case_report(_case(timeline=timeline), _context()))

    assert "Llegada <b>sin</b> alojamiento & sin red" in text
    assert "Descripción con <br> y &amp; literales." in text


def test_unclassified_cases_still_render():
    case = _case(classification={})

    _, text = _read(render_case_report(case, _context(is_demo=True)))

    assert "Caso sin clasificar" in text
    assert "La clasificación no estuvo disponible para este caso." in text
    assert "Demostración con datos ficticios" in text


def test_missing_fonts_fall_back_to_the_standard_ones(monkeypatch, tmp_path):
    monkeypatch.setattr(case_report, "FONT_DIR", tmp_path)
    case_report._fonts.cache_clear()
    try:
        content = render_case_report(_case(), _context())
    finally:
        case_report._fonts.cache_clear()

    _, text = _read(content)
    assert "Desplazamiento forzado" in text


@pytest.mark.parametrize(
    ("milliseconds", "expected"),
    [(0, "0:00"), (18_400, "0:18"), (61_000, "1:01"), (-5, "0:00")],
)
def test_stamps_match_the_screen(milliseconds, expected):
    assert case_report._stamp(milliseconds) == expected
