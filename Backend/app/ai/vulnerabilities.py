"""Vulnerabilidades como casillas cerradas.

El modelo redactaba el rótulo y el valor a su manera, distintos en cada caso
("personas con necesidades especiales en el hogar", "personas con necesidades
de cuidado especial"), y quien revisaba no sabía qué se le preguntaba. Ahora el
rótulo es fijo y el valor sólo puede ser una lista de estas opciones. El
frontend tiene su espejo en src/components/analysis/vulnerabilities.ts.
"""
from __future__ import annotations

from typing import Any

from app.ai.contracts import ProviderSignal


VULNERABILITIES_KEY = "vulnerabilities"
VULNERABILITIES_LABEL = "Personas que necesitan protección especial"

# El orden es el de las casillas en pantalla.
VULNERABILITY_OPTIONS = {
    "children": "Niñas, niños o adolescentes",
    "older_adults": "Personas mayores",
    "pregnancy": "Embarazo",
    "disability": "Discapacidad",
    "illness": "Enfermedad",
    "none": "Ninguna de las anteriores",
}


def normalize_vulnerabilities(value: Any) -> list[str] | None:
    """Deja sólo opciones conocidas; sin ninguna reconocible, no hay valor."""
    if isinstance(value, str):
        items = [value]
    elif isinstance(value, list):
        items = value
    else:
        return None
    given = {str(item).strip().casefold() for item in items}
    chosen = [option for option in VULNERABILITY_OPTIONS if option in given]
    # "Ninguna" contradice a cualquier otra opción marcada: gana la concreta.
    if len(chosen) > 1 and "none" in chosen:
        chosen.remove("none")
    return chosen or None


def display_vulnerabilities(value: Any) -> str | None:
    chosen = normalize_vulnerabilities(value)
    if chosen is None:
        return None
    return " · ".join(VULNERABILITY_OPTIONS[option] for option in chosen)


def close_vulnerabilities(signal: ProviderSignal) -> ProviderSignal:
    """Pasa la lectura del modelo por las casillas antes de reconciliarla."""
    value = normalize_vulnerabilities(signal.value)
    return signal.model_copy(
        update={
            "label": VULNERABILITIES_LABEL,
            "value": value,
            "display_value": display_vulnerabilities(value) or "",
            # Un texto libre que no es ninguna opción no tiene qué anclar: con
            # evidencia y sin valor, la reconciliación lo leería como
            # inconsistencia en vez de "no se encontró".
            "evidence": signal.evidence if value is not None else [],
        }
    )
