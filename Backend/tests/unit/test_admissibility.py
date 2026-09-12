"""La compuerta que separa el material ajeno de un caso.

Los números de estas pruebas salen de las dos corridas con videos reales, no de
un ejemplo de laboratorio: b1 (receta de ajiaco) y b2 (nota de economía de
Noticias Caracol) dieron cero momentos de cronología y las seis claves canónicas
en nulo; c8 (anuncio de café de una asociación de mujeres víctimas) dio tres
momentos y hechos con valor.
"""
from app.ai.admissibility import evaluate_admissibility


CANONICAS = {
    "people", "current_location", "origin_location", "places",
    "vulnerabilities",
}


def _canonicas(valor):
    return [{"key": k, "value": valor} for k in sorted(CANONICAS)]


def test_descarta_una_receta_de_cocina():
    """b1: 34 segmentos de ajiaco, cero cronología, seis señales en nulo."""
    resultado = evaluate_admissibility(
        facts=_canonicas(None), timeline=[], canonical_keys=CANONICAS,
    )

    assert resultado.admissible is False
    assert resultado.verdict == "out_of_domain"
    assert resultado.timeline_events == 0
    assert resultado.canonical_facts_with_value == 0


def test_deja_pasar_a_la_victima_que_no_narra_su_hecho():
    """c8: el caso difícil. Orfa sí es víctima y su regreso a la finca sí es una
    secuencia de hechos, así que esta capa NO debe descartarla — eso le toca a
    la siguiente. Descartarla aquí sería negarle orientación a una víctima."""
    resultado = evaluate_admissibility(
        facts=[{"key": "origin_location", "value": "Aracataca"}] + _canonicas(None),
        timeline=[{"title": "Regreso a la finca"}, {"title": "Daños al regresar"}],
        canonical_keys=CANONICAS,
    )

    assert resultado.admissible is True


def test_una_sola_senal_no_basta_para_descartar():
    """Un relato real puede no dejar cronología. Si las señales básicas tienen
    contenido, no se descarta: el falso descarte cuesta mucho más que el falso
    positivo."""
    resultado = evaluate_admissibility(
        facts=[{"key": "current_location", "value": "Popayán"}],
        timeline=[],
        canonical_keys=CANONICAS,
    )

    assert resultado.admissible is True


def test_sin_claves_canonicas_no_descarta_nada():
    """Los casos analizados antes de que el prompt exigiera el vocabulario no
    traen ninguna clave canónica. Sin señal en la que apoyarse, la compuerta se
    abstiene en vez de descartar."""
    resultado = evaluate_admissibility(
        facts=[{"key": "child_recruitment", "value": "Sí"}],
        timeline=[],
        canonical_keys=CANONICAS,
    )

    assert resultado.admissible is True
    assert resultado.canonical_facts == 0


def test_publica_las_senales_para_que_se_pueda_auditar():
    resultado = evaluate_admissibility(
        facts=_canonicas(None), timeline=[], canonical_keys=CANONICAS,
    )

    assert resultado.canonical_facts == 5
    assert "línea de tiempo" in resultado.reason


# ── Cribado ───────────────────────────────────────────────────────────────
from app.ai.admissibility import resolve_screening
from app.ai.contracts import ProviderScreening


def _cribado(veredicto, evidencia=()):
    return ProviderScreening(
        verdict=veredicto,
        evidence=[
            {"segment_id": s, "start_ms": 0, "end_ms": 1000} for s in evidencia
        ],
        reason="…",
    )


def test_un_hecho_narrado_sin_donde_se_narra_baja_a_revision_humana():
    """La exigencia que hace que el veredicto no sea una opinión: si el modelo
    afirma que hay un hecho pero cita un segmento que no existe, no lo sostiene."""
    resultado = resolve_screening(
        _cribado("narrated_event", ["segmento-inventado"]),
        known_segments={"segment-1", "segment-2"},
    )

    assert resultado.verdict == "victim_without_event"
    assert "no lo sustentó" in resultado.reason


def test_un_hecho_narrado_sin_ninguna_cita_tampoco_se_acepta():
    resultado = resolve_screening(
        _cribado("narrated_event"), known_segments={"segment-1"},
    )

    assert resultado.verdict == "victim_without_event"


def test_un_hecho_narrado_bien_citado_se_respeta():
    resultado = resolve_screening(
        _cribado("narrated_event", ["segment-2"]),
        known_segments={"segment-1", "segment-2"},
    )

    assert resultado.verdict == "narrated_event"


def test_solo_el_cribado_puede_descartar_material_del_dominio():
    """Las señales deterministas no distinguen a quien no narra su hecho: c8
    tenía cronología y hechos con valor. Este veredicto sí lo descarta."""
    resultado = evaluate_admissibility(
        facts=[{"key": "origin_location", "value": "Aracataca"}],
        timeline=[{"title": "Regreso a la finca"}],
        canonical_keys=CANONICAS,
        screening=_cribado("out_of_domain"),
    )

    assert resultado.admissible is False
    assert resultado.screening_verdict == "out_of_domain"


def test_la_victima_sin_hecho_conserva_sus_rutas_pero_queda_marcada():
    """Negarle orientación a una víctima real es el error caro. Se le avisa a
    quien revisa, no se le quita la ruta."""
    resultado = evaluate_admissibility(
        facts=[{"key": "origin_location", "value": "Aracataca"}],
        timeline=[{"title": "Regreso a la finca"}],
        canonical_keys=CANONICAS,
        screening=_cribado("victim_without_event"),
    )

    assert resultado.admissible is True
    assert resultado.screening_verdict == "victim_without_event"


def test_la_senal_barata_no_pisa_al_cribado():
    """El caso que desmintió el diseño original. El mismo video de Asomucarsine
    dio tres momentos de cronología en una corrida y cero en la siguiente. Sobre
    la segunda, la regla determinista lo descartaba como material ajeno mientras
    el cribado decía —correctamente— que era una víctima que no narra su hecho.
    Descartarla habría sido negarle orientación a una víctima real por culpa de
    la variabilidad del modelo entre corridas."""
    resultado = evaluate_admissibility(
        facts=_canonicas(None),
        timeline=[],
        canonical_keys=CANONICAS,
        screening=_cribado("victim_without_event"),
    )

    assert resultado.admissible is True
    assert resultado.screening_verdict == "victim_without_event"


def test_sin_cribado_la_senal_barata_sigue_valiendo():
    """Si la llamada de cribado falla, es mejor esto que nada."""
    resultado = evaluate_admissibility(
        facts=_canonicas(None), timeline=[], canonical_keys=CANONICAS, screening=None,
    )

    assert resultado.admissible is False
