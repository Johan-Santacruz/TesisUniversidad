from __future__ import annotations

from collections.abc import Iterable
from typing import Protocol

from app.ai.contracts import TranscriptResult, TranscriptSegment
from app.ai.providers import RawTranscriptChunk
from app.services.media import AudioChunk


class TranscriptionError(ValueError):
    pass


# Whisper corta por su propio ritmo de silencios, no por el de la lengua. Quien
# narra un desplazamiento hace pausas donde le pesa el recuerdo, no donde
# termina la oración, así que un fragmento acababa en «duramos viviendo 7» y el
# siguiente empezaba en «años». Leído en el riel, eso no es una transcripción:
# es una frase partida por la mitad.
SENTENCE_END = ".?!…"
# Dos topes para que un relato sin pausas no se convierta en un ladrillo: el
# fragmento se cierra igual al llegar a cualquiera de los dos, aunque la frase
# siga. Veinte segundos es lo que se alcanza a seguir leyendo mientras el video
# corre; trescientos caracteres, unas cuatro líneas en el riel.
MAX_FRAGMENT_MS = 20_000
MAX_FRAGMENT_CHARS = 300


def _closes_sentence(text: str) -> bool:
    """Si el fragmento termina una oración, contando el cierre de comillas."""
    trimmed = text.rstrip(" \"'»)]}")
    return bool(trimmed) and trimmed[-1] in SENTENCE_END


def merge_into_sentences(
    segments: list[TranscriptSegment],
) -> list[TranscriptSegment]:
    """Une fragmentos consecutivos hasta que la frase cierre.

    No inventa tiempos ni toca el texto: el fragmento unido empieza donde
    empezaba el primero y termina donde terminaba el último, que es lo que hace
    que el clic siga cayendo en el minuto correcto del video. Une también a
    través de los trozos de audio, que es justo donde el corte era peor: el
    troceado parte el archivo por tamaño, sin mirar dónde está hablando nadie.
    """
    if not segments:
        return []

    merged: list[TranscriptSegment] = []
    buffer: list[TranscriptSegment] = []

    def flush() -> None:
        if not buffer:
            return
        first = buffer[0]
        merged.append(
            first.model_copy(
                update={
                    "order_index": len(merged),
                    "end_ms": buffer[-1].end_ms,
                    "text": " ".join(part.text for part in buffer),
                }
            )
        )
        buffer.clear()

    for segment in segments:
        if buffer:
            texto = " ".join(part.text for part in buffer)
            duracion = segment.end_ms - buffer[0].start_ms
            cabe = (
                duracion <= MAX_FRAGMENT_MS
                and len(texto) + 1 + len(segment.text) <= MAX_FRAGMENT_CHARS
            )
            # La frase cerrada manda: aunque quepa, ahí termina el fragmento.
            if _closes_sentence(texto) or not cabe:
                flush()
        buffer.append(segment)

    flush()
    return merged


class _Whisper(Protocol):
    def transcribe_chunk(
        self,
        audio: bytes,
        *,
        filename: str,
    ) -> RawTranscriptChunk: ...


class TranscriptionService:
    def __init__(self, whisper: _Whisper) -> None:
        self.whisper = whisper

    def transcribe(
        self,
        *,
        analysis_id: str,
        video_id: str,
        chunks: Iterable[AudioChunk],
    ) -> TranscriptResult:
        saw_chunk = False
        texts: list[str] = []
        segments: list[TranscriptSegment] = []
        for chunk in chunks:
            saw_chunk = True
            raw = self.whisper.transcribe_chunk(
                chunk.wav_bytes,
                filename=f"audio-{chunk.index:04d}.wav",
            )
            text = raw.text.strip()
            if not text:
                raise TranscriptionError("provider returned blank text")
            texts.append(text)
            for local_index, segment in enumerate(raw.segments):
                segment_text = segment.text.strip()
                if (
                    not segment_text
                    or segment.start_ms < 0
                    or segment.end_ms < segment.start_ms
                ):
                    continue
                segments.append(
                    TranscriptSegment(
                        id=(
                            f"segment-{chunk.index:04d}-"
                            f"{local_index:04d}"
                        ),
                        analysis_id=analysis_id,
                        video_id=video_id,
                        order_index=len(segments),
                        start_ms=chunk.start_ms + segment.start_ms,
                        end_ms=chunk.start_ms + segment.end_ms,
                        text=segment_text,
                    )
                )
        if not saw_chunk:
            raise TranscriptionError("transcription requires audio chunks")
        if not segments:
            raise TranscriptionError("provider returned zero valid segments")
        return TranscriptResult(
            text=" ".join(texts),
            segments=merge_into_sentences(segments),
        )
