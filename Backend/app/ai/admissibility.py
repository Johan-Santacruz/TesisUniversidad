"""¿Hay aquí un caso que orientar, o sólo un texto en español?

El clasificador es single-label sobre cinco categorías de violencia y no tiene
clase de abstención: cualquier texto que entre sale con una de las cinco. En las
pruebas con material real eso produjo una receta de ajiaco clasificada como
"Ataques contra la población civil" con sus tres rutas institucionales, y un
testimonio de superación clasificado como "Restricción al acceso humanitario"
con 0,928 de confianza.

Un umbral de confianza no lo ataja: atrapa al modelo cuando duda, no cuando se
equivoca con seguridad. Lo que sí separa el material ajeno es una señal que el
pipeline ya produce sin coste: sobre una receta y una nota de economía el modelo
se negó a construir línea de tiempo —cero momentos en ambas— mientras que en los
seis clips con relato real construyó entre tres y cinco. Y las seis claves
canónicas salieron todas en nulo.

Esto NO distingue a una víctima que no narra su hecho: el anuncio de café de
Asomucarsine tiene tres momentos de cronología y hechos verdaderos, porque el
regreso a la finca sí es una secuencia. Esa separación necesita otra capa.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.ai.contracts import ProviderScreening, ScreeningVerdict


class Admissibility(BaseModel):
    admissible: bool
    verdict: str
    reason: str
    # Veredicto del cribado, cuando lo hubo. Se publica siempre, incluso cuando
    # no cambia la decisión: que un caso sea "victim_without_event" no le quita
    # las rutas —esa persona puede necesitarlas— pero sí le avisa a quien revisa
    # que la categoría no se apoya en ningún hecho narrado.
    screening_verdict: str | None = None
    screening_reason: str | None = None
    # Se publican las señales, no sólo el veredicto: quien revise el caso tiene
    # que poder ver por qué se descartó sin volver a correr el análisis.
    timeline_events: int
    canonical_facts: int
    canonical_facts_with_value: int


def resolve_screening(
    screening: ProviderScreening | None,
    known_segments: set[str],
) -> ProviderScreening | None:
    """Degrada un 'narrated_event' que no puede señalar dónde ocurre el hecho.

    Es la misma exigencia que ya se le hace a cada señal en reconcile.py: si la
    cita apunta a un segmento que no existe, no sostiene nada. Aquí el veredicto
    baja a 'victim_without_event' —pedir revisión humana— en vez de descartarse,
    porque una cita mal formada no prueba que el hecho no esté.
    """
    if screening is None:
        return None
    if screening.verdict is not ScreeningVerdict.NARRATED_EVENT:
        return screening
    citados = {item.segment_id for item in screening.evidence}
    if citados and citados <= known_segments:
        return screening
    return screening.model_copy(
        update={
            "verdict": ScreeningVerdict.VICTIM_WITHOUT_EVENT,
            "reason": (
                "El cribado afirmó un hecho narrado pero no lo sustentó en "
                f"segmentos existentes ({screening.reason})"
            ),
        }
    )


def evaluate_admissibility(
    *,
    facts: list[dict[str, Any]],
    timeline: list[dict[str, Any]],
    canonical_keys: set[str],
    screening: ProviderScreening | None = None,
) -> Admissibility:
    canonical = [fact for fact in facts if fact.get("key") in canonical_keys]
    with_value = [fact for fact in canonical if fact.get("value") is not None]
    veredicto = screening.verdict.value if screening is not None else None
    razon = screening.reason if screening is not None else None

    # El cribado es la única capa que puede descartar material del dominio: las
    # señales deterministas no distinguen a quien no narra su hecho.
    if screening is not None and screening.verdict is ScreeningVerdict.OUT_OF_DOMAIN:
        return Admissibility(
            admissible=False,
            verdict="out_of_domain",
            reason=f"El cribado no reconoció material del conflicto armado: {razon}",
            timeline_events=len(timeline),
            canonical_facts=len(canonical),
            canonical_facts_with_value=len(with_value),
            screening_verdict=veredicto,
            screening_reason=razon,
        )

    # El descarte determinista sólo actúa cuando NO hay cribado. Se escribió al
    # revés y el caso real lo desmintió enseguida: el anuncio de café de
    # Asomucarsine dio tres momentos de cronología en una corrida y cero en la
    # siguiente, con el mismo video. Sobre esa segunda corrida la regla lo
    # descartó como material ajeno mientras el cribado, que sí acertaba, decía
    # "victim_without_event". La señal es barata pero inestable, así que no
    # puede pisar a la capa que razona: manda el cribado y esto es el respaldo
    # para cuando falla.
    hay_cribado = screening is not None
    if not hay_cribado and not timeline and canonical and not with_value:
        return Admissibility(
            admissible=False,
            verdict="out_of_domain",
            reason=(
                "El relato no dejó ningún momento en la línea de tiempo y "
                "ninguna de las señales básicas —quiénes son, de dónde salieron, "
                "dónde están, urgencia, vulnerabilidades— aparece en el texto. "
                "No hay caso que orientar."
            ),
            timeline_events=0,
            canonical_facts=len(canonical),
            canonical_facts_with_value=0,
            screening_verdict=veredicto,
            screening_reason=razon,
        )

    return Admissibility(
        admissible=True,
        verdict="admissible",
        reason="El relato dejó cronología o señales básicas con contenido.",
        timeline_events=len(timeline),
        canonical_facts=len(canonical),
        canonical_facts_with_value=len(with_value),
        screening_verdict=veredicto,
        screening_reason=razon,
    )
