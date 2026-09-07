from __future__ import annotations

import pytest

from app.ai.providers import RawTranscriptChunk, RawTranscriptSegment
from app.services.media import AudioChunk
from app.ai.contracts import TranscriptSegment
from app.services.transcription import (
    MAX_FRAGMENT_CHARS,
    MAX_FRAGMENT_MS,
    TranscriptionError,
    TranscriptionService,
    merge_into_sentences,
)


class FakeWhisper:
    def __init__(self, results):
        self.results = iter(results)

    def transcribe_chunk(self, audio: bytes, *, filename: str):
        assert audio.startswith(b"RIFF")
        assert filename.endswith(".wav")
        return next(self.results)


def _audio_chunk(index: int, start_ms: int, end_ms: int) -> AudioChunk:
    return AudioChunk(
        index=index,
        start_ms=start_ms,
        end_ms=end_ms,
        wav_bytes=b"RIFF-fake-wav",
    )


def test_transcription_offsets_timestamps_and_assigns_canonical_identity():
    whisper = FakeWhisper(
        [
            RawTranscriptChunk(
                text="Primer fragmento.",
                segments=(
                    RawTranscriptSegment(start_ms=100, end_ms=700, text=" Primero. "),
                    RawTranscriptSegment(start_ms=800, end_ms=1200, text=" Segundo. "),
                ),
            ),
            RawTranscriptChunk(
                text="Segundo fragmento.",
                segments=(
                    RawTranscriptSegment(start_ms=50, end_ms=400, text=" Tercero. "),
                ),
            ),
        ]
    )

    result = TranscriptionService(whisper).transcribe(
        analysis_id="analysis-1",
        video_id="video-1",
        chunks=[
            _audio_chunk(0, 0, 2_000),
            _audio_chunk(1, 2_000, 4_000),
        ],
    )

    assert result.text == "Primer fragmento. Segundo fragmento."
    assert [segment.id for segment in result.segments] == [
        "segment-0000-0000",
        "segment-0000-0001",
        "segment-0001-0000",
    ]
    assert [segment.order_index for segment in result.segments] == [0, 1, 2]
    assert [segment.start_ms for segment in result.segments] == [100, 800, 2050]
    assert [segment.end_ms for segment in result.segments] == [700, 1200, 2400]
    assert all(
        segment.analysis_id == "analysis-1"
        and segment.video_id == "video-1"
        for segment in result.segments
    )


def test_transcription_rejects_no_audio_chunks():
    with pytest.raises(TranscriptionError, match="audio chunks"):
        TranscriptionService(FakeWhisper([])).transcribe(
            analysis_id="analysis-1",
            video_id="video-1",
            chunks=[],
        )


def test_transcription_rejects_blank_provider_text():
    whisper = FakeWhisper(
        [
            RawTranscriptChunk(
                text="   ",
                segments=(
                    RawTranscriptSegment(start_ms=0, end_ms=100, text="texto"),
                ),
            )
        ]
    )

    with pytest.raises(TranscriptionError, match="blank"):
        TranscriptionService(whisper).transcribe(
            analysis_id="analysis-1",
            video_id="video-1",
            chunks=[_audio_chunk(0, 0, 100)],
        )


def test_transcription_rejects_zero_valid_segments():
    whisper = FakeWhisper(
        [
            RawTranscriptChunk(
                text="Texto general.",
                segments=(
                    RawTranscriptSegment(start_ms=0, end_ms=100, text=" "),
                ),
            )
        ]
    )

    with pytest.raises(TranscriptionError, match="segments"):
        TranscriptionService(whisper).transcribe(
            analysis_id="analysis-1",
            video_id="video-1",
            chunks=[_audio_chunk(0, 0, 100)],
        )


# ── Frases partidas por la mitad ───────────────────────────────────────────


def _segmento(indice: int, inicio: int, fin: int, texto: str) -> TranscriptSegment:
    return TranscriptSegment(
        id=f"segment-{indice:04d}",
        analysis_id="analysis-1",
        video_id="video-1",
        order_index=indice,
        start_ms=inicio,
        end_ms=fin,
        text=texto,
    )


def test_une_la_frase_que_whisper_partio_por_la_mitad():
    """El caso que se reportó: el corte caía dentro de la cifra."""
    unidos = merge_into_sentences([
        _segmento(0, 0, 4_000, "Bueno, ya después duramos viviendo 7"),
        _segmento(1, 4_000, 6_000, "años en Popayán."),
        _segmento(2, 6_000, 9_000, "Volvimos en 2019."),
    ])

    assert [s.text for s in unidos] == [
        "Bueno, ya después duramos viviendo 7 años en Popayán.",
        "Volvimos en 2019.",
    ]


def test_el_fragmento_unido_conserva_los_tiempos_de_los_extremos():
    """Sin esto, el clic en el riel dejaría de caer en el minuto correcto."""
    unidos = merge_into_sentences([
        _segmento(0, 1_500, 4_000, "La casa quedó"),
        _segmento(1, 4_000, 7_200, "sin puertas."),
    ])

    assert (unidos[0].start_ms, unidos[0].end_ms) == (1_500, 7_200)
    assert unidos[0].order_index == 0


def test_un_relato_sin_pausas_no_se_vuelve_un_ladrillo():
    """Los topes cierran el fragmento aunque la frase siga abierta."""
    largo = [
        _segmento(i, i * 3_000, (i + 1) * 3_000, "y seguimos caminando sin parar")
        for i in range(12)
    ]

    unidos = merge_into_sentences(largo)

    assert len(unidos) > 1
    for fragmento in unidos:
        assert fragmento.end_ms - fragmento.start_ms <= MAX_FRAGMENT_MS
        assert len(fragmento.text) <= MAX_FRAGMENT_CHARS


def test_une_tambien_a_traves_de_los_trozos_de_audio():
    """El troceado parte el archivo por tamaño, sin mirar quién está hablando."""
    whisper = FakeWhisper([
        RawTranscriptChunk(
            text="Uno",
            segments=(RawTranscriptSegment(start_ms=0, end_ms=1_900, text="Duramos viviendo 7"),),
        ),
        RawTranscriptChunk(
            text="Dos",
            segments=(RawTranscriptSegment(start_ms=0, end_ms=800, text="años allá."),),
        ),
    ])

    resultado = TranscriptionService(whisper).transcribe(
        analysis_id="analysis-1",
        video_id="video-1",
        chunks=[_audio_chunk(0, 0, 2_000), _audio_chunk(1, 2_000, 4_000)],
    )

    assert [s.text for s in resultado.segments] == ["Duramos viviendo 7 años allá."]
    assert resultado.segments[0].start_ms == 0
    assert resultado.segments[0].end_ms == 2_800
