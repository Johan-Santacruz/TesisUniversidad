"""El recálculo de rutas comparte las reglas del análisis y suma lo confirmado."""
import json

from app.ai.contracts import TranscriptSegment
from app.ai.providers import (
    ANALYSIS_INSTRUCTIONS,
    ROUTE_REBUILD_INSTRUCTIONS,
    _routes_input,
)


def test_el_recalculo_usa_las_mismas_reglas_de_rutas_que_el_analisis():
    """Dos copias de las reglas terminarían diciendo cosas distintas."""
    for regla in ("RUTAS.", "NO CITES LA CLASIFICACIÓN", "UN PASO, UNA ACCIÓN"):
        assert regla in ANALYSIS_INSTRUCTIONS
        assert regla in ROUTE_REBUILD_INSTRUCTIONS


def test_el_recalculo_da_prioridad_a_las_senales_confirmadas():
    assert "confirmed_signals" in ROUTE_REBUILD_INSTRUCTIONS
    assert "Mandan sobre tu" in ROUTE_REBUILD_INSTRUCTIONS
    # No vuelve a pedir lo que ya se revisó.
    assert "LÍNEA DE TIEMPO" not in ROUTE_REBUILD_INSTRUCTIONS
    assert "CLAVES OBLIGATORIAS" not in ROUTE_REBUILD_INSTRUCTIONS


def test_las_senales_confirmadas_viajan_con_el_mismo_material_del_analisis():
    segment = TranscriptSegment(
        id="segment-1", start_ms=0, end_ms=1000, text="Llegamos con dos niñas."
    )
    confirmed = [
        {
            "key": "vulnerabilities",
            "label": "Personas que necesitan protección especial",
            "value": ["children"],
            "display_value": "Niñas, niños o adolescentes",
        }
    ]

    payload = json.loads(_routes_input([segment], [], None, confirmed))

    assert payload["segments"][0]["id"] == "segment-1"
    assert payload["source_catalog"] == []
    assert payload["confirmed_signals"] == confirmed
