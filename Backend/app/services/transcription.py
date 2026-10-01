from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable
from typing import Protocol

from app.ai.contracts import TranscriptResult, TranscriptSegment
from app.ai.providers import (
    RawTranscriptChunk,
    RawTranscriptSegment,
    RawTranscriptWord,
)
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

# Donde termina una oración dentro del texto de Whisper: tras el punto (y sus
# comillas o paréntesis de cierre), si lo que sigue arranca en mayúscula o con
# signo de apertura. «Sr. Pérez» no termina nada, pero tampoco hay forma barata
# de distinguirlo de «…en la casa. Pérez llegó»; la mayúscula es la mejor señal
# que da el texto, junto con las abreviaturas de trato que sí se conocen.
# Se corta sólo en el espacio: ningún carácter se pierde.
_SENTENCE_BREAK = re.compile(r"[.?!…][\"'»)\]]*(?=\s+[¿¡\"«(]?[A-ZÁÉÍÓÚÜÑ])")
_ABBREVIATIONS = frozenset(
    "sr sra srta sres dr dra lic ing prof av gral cnel tte cap mons".split()
)


def _sentences(text: str) -> list[str]:
    pieces: list[str] = []
    start = 0
    for match in _SENTENCE_BREAK.finditer(text):
        before = text[start : match.start()].split()
        if before and _bare(before[-1]) in _ABBREVIATIONS:
            continue
        pieces.append(text[start : match.end()].strip())
        start = match.end()
    pieces.append(text[start:].strip())
    return [piece for piece in pieces if piece]


# Palabras que no pueden quedar al final de un fragmento: anuncian algo que
# viene después. Un corte tras «por», «de» o «que» deja la frase colgando.
_FUNCTION_WORDS = frozenset(
    """
    a al ante bajo con contra de del desde durante en entre hacia hasta mediante
    para por según sin sobre tras el la lo los las un una unos unas mi mis tu tus
    su sus nuestro nuestra nuestros nuestras me te se nos le les y e o u ni que
    pero porque pues como cuando donde si aunque mientras muy más tan
    """.split()
)

# Palabras con las que arranca una idea nueva: cortar justo antes de ellas
# deja dos partes que se entienden solas.
_CLAUSE_OPENERS = frozenset(
    """
    cuando porque pero entonces después luego mientras aunque así pues y e o
    ya además también incluso hasta que
    """.split()
)


def _closes_sentence(text: str) -> bool:
    """Si el fragmento termina una oración, contando el cierre de comillas."""
    trimmed = text.rstrip(" \"'»)]}")
    return bool(trimmed) and trimmed[-1] in SENTENCE_END


def _bare(token: str) -> str:
    """La palabra sin puntuación ni mayúsculas, para casarla con la de Whisper."""
    normal = unicodedata.normalize("NFC", token).casefold()
    return "".join(char for char in normal if char.isalnum())


def split_at_sentences(
    segments: tuple[RawTranscriptSegment, ...],
    words: tuple[RawTranscriptWord, ...],
) -> list[RawTranscriptSegment]:
    """Parte los trozos de Whisper donde termina cada oración.

    Whisper corta en las pausas, así que un trozo puede traer el final de una
    oración y el arranque de la siguiente («…a nuestra vivienda. Por»). Con el
    minuto de cada palabra el corte va donde termina la oración, y cada parte
    empieza en el minuto de su primera palabra y termina en el de la última.

    Sólo si las palabras casan una a una con el texto: si Whisper escribió una
    cifra de un modo y la dictó de otro, el reparto ya no es fiable y los trozos
    se quedan como vinieron. Mejor un fragmento largo que un minuto inventado.
    """
    timed = [word for word in words if _bare(word.text)]
    spoken = [
        _bare(token)
        for segment in segments
        for token in segment.text.split()
        if _bare(token)
    ]
    if (
        not spoken
        or len(spoken) != len(timed)
        or any(token != _bare(word.text) for token, word in zip(spoken, timed))
    ):
        return list(segments)

    pieces: list[RawTranscriptSegment] = []
    cursor = 0
    for segment in segments:
        for sentence in _sentences(segment.text):
            count = sum(1 for token in sentence.split() if _bare(token))
            if not count:
                # Un signo suelto («—») no tiene minuto propio: va con lo
                # anterior, que es donde se escribió.
                if pieces:
                    last = pieces[-1]
                    pieces[-1] = RawTranscriptSegment(
                        start_ms=last.start_ms,
                        end_ms=last.end_ms,
                        text=f"{last.text} {sentence}",
                    )
                continue
            first, last = timed[cursor], timed[cursor + count - 1]
            pieces.append(
                RawTranscriptSegment(
                    start_ms=first.start_ms,
                    end_ms=last.end_ms,
                    text=sentence,
                )
            )
            cursor += count
    return pieces


def _boundary_score(left: str, right: str) -> int:
    """Qué tan bien se lee un corte entre `left` y `right`.

    Un fin de oración es el corte natural; una coma o un punto y coma separan
    dos partes que se sostienen; antes de «cuando», «porque» o «pero» empieza
    una idea nueva. Lo que nunca: dejar al final una palabra que anuncia lo que
    sigue, como «por» o «de».
    """
    if _closes_sentence(left):
        return 4
    last_word = _bare(left.split()[-1]) if left.split() else ""
    if last_word in _FUNCTION_WORDS:
        return 0
    if left.rstrip()[-1:] in ",;:—–":
        return 3
    first_word = _bare(right.split()[0]) if right.split() else ""
    if first_word in _CLAUSE_OPENERS:
        return 2
    return 1


def merge_into_sentences(
    segments: list[TranscriptSegment],
) -> list[TranscriptSegment]:
    """Une fragmentos consecutivos hasta que la frase cierre.

    No inventa tiempos ni toca el texto: el fragmento unido empieza donde
    empezaba el primero y termina donde terminaba el último, que es lo que hace
    que el clic siga cayendo en el minuto correcto del video. Une también a
    través de los trozos de audio, que es justo donde el corte era peor: el
    troceado parte el archivo por tamaño, sin mirar dónde está hablando nadie.

    Cuando el tope obliga a cerrar antes de que la frase termine, no se corta
    en el último límite disponible sino en el que mejor se lee: así un
    fragmento terminaba en «…a nuestra vivienda. Por», con el «Por» colgando.
    """
    if not segments:
        return []

    merged: list[TranscriptSegment] = []
    buffer: list[TranscriptSegment] = []

    def text_of(parts: list[TranscriptSegment]) -> str:
        return " ".join(part.text for part in parts)

    def flush(count: int) -> None:
        taken = buffer[:count]
        first = taken[0]
        merged.append(
            first.model_copy(
                update={
                    "order_index": len(merged),
                    "end_ms": taken[-1].end_ms,
                    "text": text_of(taken),
                }
            )
        )
        del buffer[:count]

    def fits(segment: TranscriptSegment) -> bool:
        return (
            segment.end_ms - buffer[0].start_ms <= MAX_FRAGMENT_MS
            and len(text_of(buffer)) + 1 + len(segment.text) <= MAX_FRAGMENT_CHARS
        )

    for segment in segments:
        # La frase cerrada manda: aunque quepa, ahí termina el fragmento.
        if buffer and _closes_sentence(text_of(buffer)):
            flush(len(buffer))
        while buffer and not fits(segment):
            # El mejor corte entre los límites que hay; a igual calidad, el
            # más tardío, para no dejar fragmentos de tres palabras.
            following = [part.text for part in buffer[1:]] + [segment.text]
            scores = [
                _boundary_score(text_of(buffer[: index + 1]), following[index])
                for index in range(len(buffer))
            ]
            best = max(scores)
            cut = max(index for index, score in enumerate(scores) if score == best)
            flush(cut + 1)
        buffer.append(segment)

    if buffer:
        flush(len(buffer))
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
            for local_index, segment in enumerate(
                split_at_sentences(raw.segments, raw.words)
            ):
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
