from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
import time
from typing import Any, Callable, TypeVar

from app.ai.contracts import (
    ProviderAnalysis,
    TranscriptResult,
    TranscriptSegment,
)


T = TypeVar("T")


class ProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class RawTranscriptSegment:
    start_ms: int
    end_ms: int
    text: str


@dataclass(frozen=True)
class RawTranscriptChunk:
    text: str
    segments: tuple[RawTranscriptSegment, ...]


def retry_call(
    operation: Callable[[], T],
    *,
    attempts: int,
    retryable: tuple[type[BaseException], ...],
    delay_seconds: float = 0.05,
) -> T:
    for attempt in range(attempts + 1):
        try:
            return operation()
        except retryable:
            if attempt == attempts:
                raise
            time.sleep(delay_seconds * (attempt + 1))
    raise RuntimeError("retry loop ended unexpectedly")


class WhisperAdapter:
    def __init__(self, *, client: Any, model: str) -> None:
        self.client = client
        self.model = model

    def transcribe_chunk(
        self,
        audio: bytes,
        *,
        filename: str,
    ) -> RawTranscriptChunk:
        file_payload = (filename, BytesIO(audio), "audio/wav")
        response = self.client.audio.transcriptions.create(
            file=file_payload,
            model=self.model,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
            language="es",
        )
        segments = tuple(
            RawTranscriptSegment(
                start_ms=round(float(segment.start) * 1000),
                end_ms=round(float(segment.end) * 1000),
                text=str(segment.text).strip(),
            )
            for segment in response.segments or []
        )
        return RawTranscriptChunk(
            text=str(response.text).strip(),
            segments=segments,
        )


def _analysis_input(
    segments: list[TranscriptSegment],
    sources: list[Any] | None = None,
    classification: dict[str, Any] | None = None,
) -> str:
    # El catálogo viaja junto a los segmentos: sin él el modelo no conoce
    # ningún source_entry_id válido y no puede sustentar ninguna ruta.
    catalog = [
        {
            "source_entry_id": item.id,
            "entity": item.entity,
            "program": item.program,
            "coverage": item.coverage,
            "requirements": item.requirements,
            "route_types": list(item.route_types),
        }
        for item in (sources or [])
    ]
    payload: dict[str, Any] = {
        "segments": [
            segment.model_dump(mode="json") for segment in segments
        ],
        "source_catalog": catalog,
    }
    # La clasificación del desplazamiento es lo que permite que las rutas
    # respondan al caso concreto en vez de servir tres plantillas iguales.
    # Antes se calculaba después de llamar al modelo, así que nunca le llegaba.
    if classification is not None:
        payload["case_classification"] = classification

    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


ANALYSIS_INSTRUCTIONS = (
    "Analiza exclusivamente los segmentos suministrados. No completes datos "
    "ausentes y apunta toda evidencia a identificadores de segmento existentes."
    "\n\n"
    "SEÑALES. Quien lee esta ficha es una persona desplazada o quien la "
    "atiende, no un ingeniero. Por cada señal entrega tres cosas: 'key', un "
    "identificador técnico estable en inglés con guiones bajos; 'label', el "
    "nombre en español que verá esa persona, en minúscula salvo nombres "
    "propios y sin jerga (por ejemplo 'Presencia de grupos armados', no "
    "'armed_conflict_presence'); y 'display_value', el valor escrito en "
    "español natural ('Sí', 'No', 'Viuda', 'Guerrilla y paramilitares'), "
    "nunca true/false ni términos en inglés. 'value' conserva el dato "
    "canónico para poder compararlo entre proveedores."
    "\n\n"
    "LÍNEA DE TIEMPO. Reconstruye los momentos que hacen avanzar la historia: "
    "qué ocurrió, dónde y en qué orden. Incluye sólo hechos con peso narrativo "
    "—amenazas, un intento de reclutamiento, una muerte, la salida del "
    "territorio, la llegada al lugar actual— y omite las frases de relleno o "
    "las que sólo repiten lo ya dicho. Cada momento lleva un título breve en "
    "español, una descripción de una o dos frases y la evidencia del segmento "
    "que lo sustenta. Es la pieza central del análisis: no la dejes vacía si "
    "el relato contiene hechos."
    "\n\n"
    "RUTAS. Construye las tres (emergency, housing_stabilization, "
    "return_relocation) citando en cada afirmación un source_entry_id tomado "
    "literalmente de source_catalog; nunca inventes uno ni cites una entidad "
    "que no aparezca ahí. Si el catálogo no sustenta un paso, omítelo en "
    "lugar de improvisarlo."
    "\n\n"
    "PARTE DE LA CLASIFICACIÓN. Cuando el input traiga 'case_classification' "
    "con la categoría y subcategoría del desplazamiento, ése es tu punto de "
    "partida: las tres rutas deben responder a ese tipo de caso y no ser "
    "plantillas intercambiables. En 'summary' de cada ruta di en una frase "
    "por qué esa ruta aplica a este caso, nombrando la circunstancia concreta "
    "que la justifica (el tipo de desplazamiento, quiénes viajan, qué se "
    "perdió, dónde está ahora). Si dos casos distintos podrían recibir el "
    "mismo texto, no has usado la clasificación."
    "\n\n"
    "CÓMO ESCRIBIR LAS RUTAS. Le hablas a la persona que vivió los hechos, no "
    "a un funcionario. Usa 'usted' y dirígete a ella directamente: 'Lleve "
    "consigo…', 'Si no tiene la cédula, pida…', 'Antes de ir, confirme…'. "
    "Cada paso empieza por la acción concreta que debe hacer, no por el "
    "nombre del trámite. Apóyate en lo que el relato ya dijo para que el "
    "consejo encaje con su situación —si contó que perdió los documentos, "
    "dilo al explicar el paso; si mencionó que viaja con menores de edad, "
    "tenlo en cuenta— pero sin repetir datos sensibles ni suponer nada que "
    "no esté en los segmentos. "
    "No uses el nombre propio de la persona ni ningún dato que permita "
    "identificarla: el expediente se comparte entre quienes la atienden. "
    "Frases cortas, sin jerga jurídica; si un término legal es inevitable, "
    "explícalo en la misma frase."
    "\n\n"
    "LEGIBILIDAD. Puede que quien reciba esta ruta lea con dificultad, así "
    "que la brevedad no es estilo sino accesibilidad. El título de cada paso "
    "no pasa de seis palabras y empieza por un verbo ('Pida una cita', "
    "'Guarde el recibo'). Prefiere la palabra corriente a la técnica "
    "('ayuda de emergencia' antes que 'atención humanitaria inmediata') "
    "siempre que no cambie el significado. Nada de siglas sin explicar ni "
    "números de artículos o decretos en el cuerpo del paso."
    "\n\n"
    "UN PASO, UNA ACCIÓN. Vale más una ruta de siete pasos cortos que una de "
    "tres pasos largos: si un paso encierra dos acciones, pártelo en dos. "
    "'key_point' es la única cosa que no puede fallar en ese paso, en una "
    "frase de diez palabras como mucho y en imperativo ('Lleve la denuncia "
    "impresa'). Va aparte porque dentro de un párrafo se pierde, y quien lee "
    "con dificultad tiene que poder quedarse sólo con esa línea y aun así "
    "actuar bien. 'instructions' añade el resto —cuándo, dónde, qué pasa si "
    "no puede— en dos frases cortas como máximo, y nunca repite literalmente "
    "el key_point."
)


class OpenAIAnalysisAdapter:
    def __init__(self, *, client: Any, model: str) -> None:
        self.client = client
        self.model = model

    def analyze(
        self,
        segments: list[TranscriptSegment],
        sources: list[Any] | None = None,
        classification: dict[str, Any] | None = None,
    ) -> ProviderAnalysis:
        response = self.client.responses.parse(
            model=self.model,
            instructions=ANALYSIS_INSTRUCTIONS,
            input=_analysis_input(segments, sources, classification),
            text_format=ProviderAnalysis,
            store=False,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise ProviderUnavailable("OpenAI did not return structured output")
        if parsed.provider != "gpt":
            parsed = parsed.model_copy(update={"provider": "gpt"})
        return parsed


class AnthropicAnalysisAdapter:
    def __init__(self, *, client: Any, model: str) -> None:
        self.client = client
        self.model = model

    def analyze(
        self,
        segments: list[TranscriptSegment],
        sources: list[Any] | None = None,
        classification: dict[str, Any] | None = None,
    ) -> ProviderAnalysis:
        response = self.client.messages.parse(
            model=self.model,
            max_tokens=6000,
            system=ANALYSIS_INSTRUCTIONS,
            messages=[
                {
                    "role": "user",
                    "content": _analysis_input(
                        segments, sources, classification
                    ),
                }
            ],
            output_format=ProviderAnalysis,
        )
        parsed = response.parsed_output
        if parsed is None:
            raise ProviderUnavailable("Anthropic did not return structured output")
        if parsed.provider != "claude":
            parsed = parsed.model_copy(update={"provider": "claude"})
        return parsed
