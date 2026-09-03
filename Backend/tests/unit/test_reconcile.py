from __future__ import annotations

from app.ai.contracts import EvidenceRef, Origin, ProviderSignal
from app.ai.reconcile import reconcile_readings


def _reading(value, segment_id: str = "segment-1") -> ProviderSignal:
    return ProviderSignal(
        key="urgency",
        label="Urgency",
        display_value="",
        value=value,
        origin=Origin.INFERRED,
        evidence=[
            EvidenceRef(segment_id=segment_id, start_ms=0, end_ms=3000)
        ],
    )


def test_matching_values_and_valid_evidence_produce_high_confidence():
    result = reconcile_readings(
        gpt=_reading("high"),
        claude=_reading("HIGH"),
        known_segments={"segment-1"},
    )

    assert result.verification_status == "confirmed"
    assert result.confidence_band == "high"
    assert result.value == "high"
    assert result.provider_values == {"gpt": "high", "claude": "HIGH"}


def test_disagreement_is_visible_and_never_silently_selected():
    result = reconcile_readings(
        gpt=_reading("high"),
        claude=_reading("medium"),
        known_segments={"segment-1"},
    )

    assert result.verification_status == "inconsistent"
    assert result.value is None
    assert result.provider_values == {"gpt": "high", "claude": "medium"}


def test_one_valid_reading_stays_pending_and_cannot_exceed_medium():
    result = reconcile_readings(
        gpt=_reading("high"),
        claude=None,
        known_segments={"segment-1"},
    )

    assert result.verification_status == "pending"
    assert result.confidence_band == "medium"
    assert result.value == "high"


def test_unknown_evidence_makes_the_result_inconsistent():
    result = reconcile_readings(
        gpt=_reading("high", segment_id="invented"),
        claude=_reading("high"),
        known_segments={"segment-1"},
    )

    assert result.verification_status == "inconsistent"
    assert result.value is None
    assert result.invalid_evidence_providers == ["gpt"]


def test_both_explicitly_unidentified_values_group_as_not_identified():
    gpt = ProviderSignal(
        key="date",
        label="Date",
        display_value="",
        value=None,
        origin=Origin.MENTIONED,
        evidence=[],
    )
    claude = ProviderSignal(
        key="date",
        label="Date",
        display_value="",
        value=None,
        origin=Origin.MENTIONED,
        evidence=[],
    )

    result = reconcile_readings(
        gpt=gpt,
        claude=claude,
        known_segments={"segment-1"},
    )

    assert result.verification_status == "not_identified"
    assert result.confidence_band == "low"



# Con un solo proveedor configurado —que es como corrieron las dos pruebas con
# videos reales— un valor nulo caía en INCONSISTENT: el sistema reportaba una
# contradicción entre proveedores donde sólo había uno, y encima diciendo con
# toda claridad que el dato no aparecía en el relato.
def test_un_solo_proveedor_que_no_encuentra_el_dato_no_es_una_contradiccion():
    result = reconcile_readings(
        gpt=ProviderSignal(
            key="urgency",
            label="qué tan urgente es la atención",
            display_value="No se menciona",
            value=None,
            origin="mentioned",
            evidence=[],
        ),
        claude=None,
        known_segments={"segment-1"},
    )

    assert result.verification_status == "not_identified"
    assert result.value is None
