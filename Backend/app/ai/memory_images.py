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
    "Amenazas y control social sobre la población": (
        "una casa dejada por precaución, con la puerta entornada"
    ),
    "Atentado": "un lugar cotidiano recobrando su calma",
    "Desaparición forzada": "una silla junto a una puerta que se deja sin cerrar",
    "Desplazamiento forzado (masivo o individual)": (
        "una casa que se mira por última vez desde el camino ya empezado"
    ),
    "Incursión": "una calle de pueblo que vuelve a abrirse despacio",
    "Masacre (homicidio colectivo)": "un lugar de encuentro que quedó en silencio",
    "Obstrucción del acceso y la movilidad humanitaria": (
        "un camino cortado y, al fondo, el pueblo que no se alcanza"
    ),
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


# Lo que hace que una línea sirva para cerrar el expediente: que la persona
# hable de sí misma y de lo que perdió, no de la mecánica del hecho. El puntaje
# es deliberadamente simple y determinista —no hay un modelo eligiendo qué
# palabras representan a alguien— y el revisor puede cambiar la frase.
_VOICE_MARKS = (
    "nuestra", "nuestro", "nosotros", "nos ", " mi ", " mis ", " me ", "yo ",
)
_MEMORY_MARKS = (
    "vida", "casa", "hogar", "dejar", "dejamos", "difícil", "tranquil",
    "recuerdo", "perdim", "familia", "volver", "construido", "nunca",
    "obligaron", "abandonar",
)
# Lo procedimental no conmemora: nombra el trámite o el actor, no a la persona.
_PROCEDURAL_MARKS = (
    "estación", "policía", "autoridades", "determinaron", "municipio",
    "según", "entidad", "denuncia",
)
# El relato del acto tampoco. No se descarta —son sus palabras y el relato es
# suyo—, pero entre dos líneas suyas el cierre se queda con la que mira hacia
# atrás, no con la que narra el golpe.
_ACT_MARKS = (
    "mataron", "matado", "muerto", "mató", "tiros", "disparar", "cogieron",
    "golpe", "sangre", "cuerpo", "arma",
)
# Muletillas de habla espontánea: una frase que empieza así no cierra nada.
_FILLERS = ("o sea,", "entonces,", "pues,", "digamos,", "este,", "y bueno,")
_QUOTE_MIN_CHARS = 45
_QUOTE_MAX_CHARS = 165


def _trim_to_sentence(text: str) -> str:
    """Deja una frase que empiece donde empieza.

    Los segmentos de Whisper cortan por tiempo, no por sentido, así que casi
    siempre arrancan con la cola de la oración anterior ("hogar. Para nosotros
    fue..."). Esa cola queda fuera; lo que sobrevive es la oración entera.
    """
    limpio = " ".join(text.split())
    corte = limpio.find(". ")
    if corte != -1 and len(limpio) - corte - 2 >= _QUOTE_MIN_CHARS:
        limpio = limpio[corte + 2 :]
    return limpio.strip()


def select_memory_quote(segments: list[dict[str, Any]]) -> str:
    """Elige, entre los segmentos del testimonio, la línea que cierra el caso.

    Devuelve las palabras textuales de la persona: no se reescriben ni se
    resumen. Si ninguna línea alcanza el umbral, devuelve cadena vacía y el
    cierre se queda sin frase antes que ponerle una ajena.
    """
    candidatos: list[tuple[float, str]] = []
    total = max(len(segments), 1)
    for posicion, segmento in enumerate(segments):
        texto = _trim_to_sentence(str(segmento.get("text") or ""))
        if not _QUOTE_MIN_CHARS <= len(texto) <= _QUOTE_MAX_CHARS:
            continue
        plano = f" {texto.casefold()} "
        puntaje = 0.0
        puntaje += 2.0 * sum(marca in plano for marca in _VOICE_MARKS)
        puntaje += 1.5 * sum(marca in plano for marca in _MEMORY_MARKS)
        puntaje -= 2.0 * sum(marca in plano for marca in _PROCEDURAL_MARKS)
        puntaje -= 2.5 * sum(marca in plano for marca in _ACT_MARKS)
        if plano.lstrip().startswith(_FILLERS):
            puntaje -= 3.0
        # El final del relato es donde la persona suele mirar hacia atrás.
        puntaje += 2.0 * (posicion / total)
        # Una frase que termina en punto se sostiene sola; una cortada, no.
        if texto.endswith((".", "…")):
            puntaje += 1.0
        if puntaje > 0:
            candidatos.append((puntaje, texto))
    if not candidatos:
        return ""
    return max(candidatos, key=lambda par: par[0])[1]


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
    # Lo que sigue sí es texto libre del caso, y por eso va aparte de la
    # taxonomía: es lo que hace que dos desplazamientos del mismo departamento
    # dejen de recibir la misma lámina. Sale de los hechos ya documentados.
    place: str = ""
    livelihood: str = ""
    household: str = ""
    left_behind: str = ""

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


# Las claves de los hechos las nombra el modelo, así que el vocabulario es
# irregular: conviven "Ubicación actual" y "place_of_residence". Se busca por
# marcas dentro de la clave en vez de por igualdad, que no acertaría casi nunca.
_PLACE_MARKS = ("origin", "origen", "place_of", "residence", "ubicaci", "location")
_LIVELIHOOD_MARKS = (
    "livelihood", "coffee", "crop", "income", "business", "work", "agricult",
    "cafetal", "cultivo", "finca", "oficio",
)
_HOUSEHOLD_MARKS = (
    "children", "child", "people", "personas", "family", "household", "hijos",
    "niñas", "caregiver", "marital",
)
_LEFT_BEHIND_MARKS = (
    "abandon", "land", "home", "housing", "damage", "crops", "assets",
    "displacement", "casa", "tierra",
)
_DETAIL_MAX_CHARS = 90


def _first_detail(facts: list[dict[str, Any]], marks: tuple[str, ...]) -> str:
    """Primer valor legible cuya clave lleve alguna de las marcas."""
    for fact in facts:
        key = str(fact.get("key") or "").casefold()
        if not any(mark in key for mark in marks):
            continue
        value = fact.get("display_value") or fact.get("value")
        if not isinstance(value, str):
            continue
        limpio = " ".join(value.split())
        if 2 < len(limpio) <= _DETAIL_MAX_CHARS:
            return limpio
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
        place=_first_detail(facts, _PLACE_MARKS),
        livelihood=_first_detail(facts, _LIVELIHOOD_MARKS),
        household=_first_detail(facts, _HOUSEHOLD_MARKS),
        left_behind=_first_detail(facts, _LEFT_BEHIND_MARKS),
    )


# Lo que se toma del fotograma y lo que no. Sin esta instruccion el modelo tiende
# a reproducir el encuadre —y un testimonio se graba de frente, a una persona.
_REFERENCE_GUIDANCE = (
    "La imagen adjunta es un fotograma del testimonio y sirve sólo como "
    "referencia del lugar: toma de ella el paisaje, la vegetación, el tipo de "
    "construcción, la hora del día, la calidad de la luz y la paleta. No copies "
    "su encuadre ni su composición, y no reproduzcas a ninguna persona que "
    "aparezca en ella: si hay alguien, queda fuera de la ilustración. "
)


def _case_detail(context: VisualContext) -> str:
    """El lugar, el oficio y lo perdido: lo que vuelve única a esta lámina.

    Sin esto el prompt sólo conoce categoría y región —cinco paisajes para todo
    el país—, y dos casos parecidos reciben la misma ilustración.
    """
    partes: list[str] = []
    if context.place:
        partes.append(f"el lugar documentado es {context.place}")
    if context.livelihood:
        partes.append(f"de lo que se vivía allí: {context.livelihood}")
    if context.household:
        partes.append(f"quiénes eran: {context.household}")
    if context.left_behind:
        partes.append(f"lo que quedó atrás: {context.left_behind}")
    if not partes:
        return ""
    return (
        "Este caso en concreto —tómalo como referencia del sitio y de la vida "
        "que allí había, no como datos que deban leerse en la imagen—: "
        + "; ".join(partes)
        + ". "
    )


# La frase no es una cita: la escribe el modelo desde los hechos documentados.
# Por eso el encargo insiste en no entrecomillar ni fingir la voz de nadie.
PHRASE_INSTRUCTIONS = (
    "Escribes la línea que acompaña la lámina de cierre del expediente de una "
    "persona que narró lo que vivió en el conflicto colombiano. "
    "Escribe en español, en tercera persona, sin entrecomillar y sin imitar la "
    "voz de la persona: no es una cita suya. "
    "Una o dos oraciones breves —no más de 140 caracteres en total—, sobrias y "
    "concretas, apoyadas sólo en los hechos que recibes. Que se lea de un "
    "vistazo bajo la ilustración. No inventes nombres, cifras, fechas ni "
    "lugares que no estén ahí. "
    "Nombra lo que quedó y lo que se sostiene, no el hecho violento: la lámina "
    "acompaña la memoria, no reconstruye el daño. "
    "Nada de consuelo fácil, moralejas, promesas institucionales ni lenguaje "
    "de informe. "
    "En `context_line` devuelve una línea breve de contexto con el lugar y, si "
    "consta, el año —por ejemplo 'Cauca, 2019'—; si no hay lugar, déjala vacía."
)


def build_phrase_request(context: VisualContext) -> str:
    """Los hechos del caso, tal como se le entregan al modelo que escribe."""
    campos = {
        "categoría": context.category,
        "subcategoría": context.subcategory,
        "lugar": context.place,
        "medio de vida": context.livelihood,
        "quiénes": context.household,
        "lo que quedó atrás": context.left_behind,
    }
    return "\n".join(f"{clave}: {valor}" for clave, valor in campos.items() if valor)


class OpenAIMemoryPhraseAdapter:
    """Escribe la línea de la lámina con el modelo de texto, no con el de imagen."""

    def __init__(self, *, client: Any, model: str) -> None:
        self.client = client
        self.model = model

    def write(self, context: VisualContext) -> tuple[str, str]:
        from app.ai.contracts import MemoryPhrase

        response = self.client.responses.parse(
            model=self.model,
            instructions=PHRASE_INSTRUCTIONS,
            input=build_phrase_request(context),
            text_format=MemoryPhrase,
            store=False,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise MemoryImageProviderError("phrase provider returned nothing")
        return parsed.phrase.strip(), parsed.context_line.strip()


def build_memory_prompt(context: VisualContext, *, with_reference: bool = False) -> str:
    if type(context) is not VisualContext:
        raise TypeError("context must be a VisualContext")
    reference = _REFERENCE_GUIDANCE if with_reference else ""
    return (
        reference
        + "Ilustración horizontal 16:9 dibujada a mano, de trazo sobrio y paleta "
        "contenida, con textura de papel y acuarela tenue. No es una fotografía "
        "ni pretende serlo. "
        "Propósito: esta ilustración cierra el expediente de una persona que "
        "contó lo que vivió. Acompaña su memoria y reconoce lo que perdió; no "
        "reconstruye el hecho ni lo ilustra. Es una pieza para volver a mirar, "
        "no una portada. "
        f"Escena: {context.scene}, en {_REGION_LANDSCAPE[context.region]}, "
        f"dentro de un tránsito {context.setting}. "
        f"Matiz: {context.nuance}. "
        + _case_detail(context)
        + "Huella: en primer plano, la señal de que allí hubo una vida —un "
        "objeto de uso cotidiano dejado en su sitio, una planta que alguien "
        "regó, un umbral gastado por el paso, ropa tendida, una puerta que "
        "alguien pintó alguna vez—. Puede haber personas: quienes habitan ese "
        "lugar, vistos de espaldas, a media distancia o en la penumbra, en un "
        "gesto corriente —caminar, esperar, cargar algo, mirar el camino—. "
        "Están vivas y en calma; no son víctimas en escena. "
        f"Temas: {', '.join(context.themes)}, durante {context.period}. "
        "Composición: cercana y habitada, nunca panorámica ni de postal. La luz "
        "es la de una hora concreta del día. Deja una franja inferior discreta y "
        "de tono parejo, donde después se sobreimprime una línea de texto: "
        "esa franja forma parte de la ilustración, no es un margen en blanco. "
        "Prohibiciones: sin violencia explícita, sin heridas, sin cuerpos, sin "
        "armas, sin uniformes, sin escenas del hecho, sin retratos ni rostros "
        "en primer plano, sin texto generado —la línea se sobreimprime "
        "después—, sin logotipos, sin banderas, sin escudos, sin "
        "sensacionalismo y sin afirmaciones de documentación real."
    )


class OpenAIMemoryImageAdapter:
    def __init__(self, *, client: Any, max_bytes: int, model: str) -> None:
        self.client = client
        self.max_bytes = max_bytes
        self.model = model

    def generate(self, prompt: str, reference: bytes | None = None) -> GeneratedImage:
        """Genera el cierre; con `reference`, anclado en un fotograma del testimonio.

        Sin referencia el prompt sólo conoce categoría, subcategoría y región, así
        que dos casos parecidos reciben la misma ilustración. El fotograma le
        devuelve el lugar y la luz de ESE testimonio. Sigue siendo una referencia:
        el prompt pide ilustración a mano y conserva sus prohibiciones, así que lo
        que se hereda es el carácter del sitio, no su literalidad.
        """
        try:
            if reference is None:
                response = self.client.images.generate(
                    model=self.model,
                    prompt=prompt,
                    size="1536x864",
                    quality="high",
                    output_format="png",
                )
            else:
                response = self.client.images.edit(
                    model=self.model,
                    image=("referencia.png", reference, "image/png"),
                    prompt=prompt,
                    size="1536x864",
                    quality="high",
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
