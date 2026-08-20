from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from typing import Any


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

_UNSPECIFIED = "No especificada"
_PERIOD = "periodo reciente"
_SETTING_VALUES = {"rural", "urbano"}
_ALLOWED_SETTINGS = {
    "origen a recepción",
    *(f"{origin} a {reception}" for origin in _SETTING_VALUES for reception in _SETTING_VALUES),
}

# Cada categoría documentada tiene su propia escena y sus propios temas. La
# escena nombra lo que queda —territorio, casa, camino—, nunca el hecho: el
# cierre acompaña la memoria, no reconstruye la violencia.
_CATEGORY_REGISTER: dict[str, tuple[str, tuple[str, ...]]] = {
    "Acciones armadas": (
        "un territorio que quedó en silencio, con caminos veredales vacíos y cercas",
        ("territorio interrumpido", "silencio posterior", "resguardo de la vida civil"),
    ),
    "Ataques contra la población civil": (
        "la vida cotidiana suspendida, con casas cerradas y un patio sin gente",
        ("vida cotidiana interrumpida", "arraigo amenazado", "búsqueda de protección"),
    ),
    "Desplazamiento forzado": (
        "el camino de salida, con una puerta que queda atrás y un sendero que se aleja",
        ("desarraigo", "tránsito", "búsqueda de protección"),
    ),
    "Restricción al acceso humanitario": (
        "la distancia hasta la ayuda, con un camino largo y un pueblo lejano",
        ("aislamiento", "distancia institucional", "espera"),
    ),
    "Uso de artefactos explosivos": (
        "la tierra que ya no se camina, con senderos cerrados y monte que reclama el paso",
        ("suelo negado", "movilidad perdida", "cuidado del camino"),
    ),
    _UNSPECIFIED: (
        "un paisaje sereno de territorio y camino",
        ("memoria", "territorio", "búsqueda de protección"),
    ),
}

# El matiz afina la escena sin nombrar el hecho ni mostrar a nadie.
_SUBCATEGORY_NUANCE: dict[str, str] = {
    "Amenazas (individuales/colectivas)": "una casa dejada por precaución, con la puerta entornada",
    "Atentado": "un lugar cotidiano recobrando su calma",
    "Combates": "un valle amplio que vuelve a la quietud",
    "Enfrentamiento entre actores no estatales": "una vereda replegada entre montañas",
    "Homicidio intencional en persona protegida": "una ausencia sostenida por objetos cotidianos",
    "Hostigamiento": "un camino rural que se recorre con cautela",
    "Mina antipersonal - MAP": "un sendero señalizado que ya nadie cruza",
    "Reclutamiento, vinculación y utilización de menores": (
        "un patio de escuela vacío al final de la tarde"
    ),
    "Secuestro": "un lugar de la casa que espera un regreso",
    "Trampas explosivas- TE": "un monte cerrado donde el camino se perdió",
    _UNSPECIFIED: "un umbral abierto hacia el paisaje",
}

# El lugar se generaliza a región natural: cinco cubos para todo el país. El
# municipio o la dirección se leen aquí y no salen nunca de este módulo.
_REGION_LANDSCAPE: dict[str, str] = {
    "andina": "un paisaje andino de cordillera y vegetación de media altura",
    "caribe": "un paisaje caribe de llanura cálida y vegetación seca",
    "pacífica": "un paisaje pacífico de selva húmeda y ríos anchos",
    "orinoquía": "un paisaje llanero de sabana abierta y horizonte bajo",
    "amazonía": "un paisaje amazónico de selva densa y ríos",
    "": "un paisaje rural colombiano",
}

_DEPARTMENT_REGION: dict[str, str] = {
    "antioquia": "andina", "boyacá": "andina", "caldas": "andina",
    "caquetá": "amazonía", "cauca": "andina", "cesar": "caribe",
    "cundinamarca": "andina", "huila": "andina", "nariño": "andina",
    "norte de santander": "andina", "quindío": "andina", "risaralda": "andina",
    "santander": "andina", "tolima": "andina", "valle del cauca": "andina",
    "atlántico": "caribe", "bolívar": "caribe", "córdoba": "caribe",
    "la guajira": "caribe", "magdalena": "caribe", "sucre": "caribe",
    "san andrés y providencia": "caribe",
    "chocó": "pacífica",
    "arauca": "orinoquía", "casanare": "orinoquía", "meta": "orinoquía",
    "vichada": "orinoquía",
    "amazonas": "amazonía", "guainía": "amazonía", "guaviare": "amazonía",
    "putumayo": "amazonía", "vaupés": "amazonía",
}
_ALLOWED_REGIONS = set(_REGION_LANDSCAPE)


class MemoryImageProviderError(RuntimeError):
    """The image provider returned no usable generated image."""


@dataclass(frozen=True)
class VisualContext:
    category: str
    subcategory: str
    setting: str
    region: str
    period: str
    scene: str
    nuance: str
    themes: tuple[str, ...]

    def __post_init__(self) -> None:
        if self.category not in _CATEGORY_REGISTER:
            raise ValueError("unsupported visual category")
        if self.subcategory not in _SUBCATEGORY_NUANCE:
            raise ValueError("unsupported visual subcategory")
        if self.setting not in _ALLOWED_SETTINGS:
            raise ValueError("unsupported visual setting")
        if self.region not in _ALLOWED_REGIONS:
            raise ValueError("unsupported visual region")
        if self.period != _PERIOD:
            raise ValueError("unsupported visual period")
        # Escena, matiz y temas se derivan de la taxonomía: no son texto libre,
        # así que un valor privado no puede entrar por estos campos.
        scene, themes = _CATEGORY_REGISTER[self.category]
        if self.scene != scene or self.themes != themes:
            raise ValueError("unsupported visual register")
        if self.nuance != _SUBCATEGORY_NUANCE[self.subcategory]:
            raise ValueError("unsupported visual nuance")


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    mime_type: str


def _classification_label(classification: dict[str, Any], key: str) -> str:
    value = classification.get(key)
    if isinstance(value, dict):
        label = value.get("label")
        if isinstance(label, str):
            return label
    return _UNSPECIFIED


def _setting_value(facts: list[dict[str, Any]], key: str) -> str | None:
    for fact in facts:
        if fact.get("key") != key:
            continue
        value = fact.get("value")
        if isinstance(value, str) and value.casefold() in _SETTING_VALUES:
            return value.casefold()
    return None


def _region(facts: list[dict[str, Any]]) -> str:
    """Reduce any documented place to one of five natural regions."""
    # Los nombres largos se prueban primero: "valle del cauca" no debe
    # resolverse por la subcadena "cauca".
    departments = sorted(_DEPARTMENT_REGION, key=len, reverse=True)
    for fact in facts:
        value = fact.get("value")
        if not isinstance(value, str):
            continue
        folded = value.casefold()
        for department in departments:
            if department in folded:
                return _DEPARTMENT_REGION[department]
    return ""


def build_visual_context(
    classification: dict[str, Any],
    facts: list[dict[str, Any]],
) -> VisualContext:
    origin = _setting_value(facts, "origin_setting")
    reception = _setting_value(facts, "reception_setting")
    setting = (
        f"{origin} a {reception}"
        if origin is not None and reception is not None
        else "origen a recepción"
    )
    category = _classification_label(classification, "category")
    subcategory = _classification_label(classification, "subcategory")
    if category not in _CATEGORY_REGISTER:
        category = _UNSPECIFIED
    if subcategory not in _SUBCATEGORY_NUANCE:
        subcategory = _UNSPECIFIED
    scene, themes = _CATEGORY_REGISTER[category]
    return VisualContext(
        category=category,
        subcategory=subcategory,
        setting=setting,
        region=_region(facts),
        period=_PERIOD,
        scene=scene,
        nuance=_SUBCATEGORY_NUANCE[subcategory],
        themes=themes,
    )


def build_memory_prompt(context: VisualContext) -> str:
    if type(context) is not VisualContext:
        raise TypeError("context must be a VisualContext")
    return (
        "Ilustración horizontal 16:9 dibujada a mano, de trazo sobrio y paleta "
        "contenida, con textura de papel y acuarela tenue. No es una fotografía "
        "ni pretende serlo. "
        f"Escena: {context.scene}, en {_REGION_LANDSCAPE[context.region]}, "
        f"dentro de un tránsito {context.setting}. "
        f"Matiz: {context.nuance}. "
        f"Temas: {', '.join(context.themes)}, durante {context.period}. "
        "Composición serena, con una zona tranquila en la parte inferior para "
        "el texto institucional. "
        "Prohibiciones: sin violencia explícita, sin heridas, sin cuerpos, sin "
        "armas, sin uniformes, sin escenas del hecho, sin personas "
        "identificables, sin rostros en primer plano, sin menores reconocibles, "
        "sin texto generado, sin logotipos, sin banderas, sin escudos, sin "
        "encuadres probatorios de ubicaciones exactas, sin sensacionalismo y "
        "sin afirmaciones de documentación real."
    )


class OpenAIMemoryImageAdapter:
    def __init__(self, *, client: Any, max_bytes: int, model: str) -> None:
        self.client = client
        self.max_bytes = max_bytes
        self.model = model

    def generate(self, prompt: str) -> GeneratedImage:
        try:
            response = self.client.images.generate(
                model=self.model,
                prompt=prompt,
                size="1536x864",
                quality="high",
                output_format="png",
            )
            encoded = response.data[0].b64_json
            if not isinstance(encoded, str):
                raise MemoryImageProviderError("missing image output")
            data = base64.b64decode(encoded, validate=True)
            if not data or len(data) > self.max_bytes:
                raise MemoryImageProviderError("invalid image size")
            if not data.startswith(PNG_SIGNATURE):
                raise MemoryImageProviderError("invalid image format")
            return GeneratedImage(data=data, mime_type="image/png")
        except MemoryImageProviderError:
            raise
        except (AttributeError, IndexError, TypeError, ValueError, binascii.Error) as exc:
            raise MemoryImageProviderError("invalid image provider response") from exc
        except Exception as exc:
            raise MemoryImageProviderError("image provider request failed") from exc
