from __future__ import annotations

import json
import unicodedata
from typing import Any

from app.ai.contracts import (
    ConfidenceBand,
    Origin,
    ProviderSignal,
    ReconciledSignal,
    VerificationStatus,
)


def _canonical(value: Any) -> str:
    if isinstance(value, str):
        return unicodedata.normalize("NFKC", value).strip().casefold()
    if isinstance(value, list):
        normalized = [
            unicodedata.normalize("NFKC", item).strip().casefold()
            for item in value
        ]
        return json.dumps(sorted(normalized), ensure_ascii=False)
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _evidence_is_valid(
    signal: ProviderSignal,
    known_segments: set[str],
) -> bool:
    if signal.value is None:
        return not signal.evidence
    return bool(signal.evidence) and all(
        evidence.segment_id in known_segments
        and evidence.end_ms >= evidence.start_ms
        for evidence in signal.evidence
    )


def reconcile_readings(
    *,
    gpt: ProviderSignal | None,
    claude: ProviderSignal | None,
    known_segments: set[str],
) -> ReconciledSignal:
    available = {"gpt": gpt, "claude": claude}
    provider_values = {
        provider: signal.value
        for provider, signal in available.items()
        if signal is not None
    }
    key = gpt.key if gpt is not None else claude.key if claude is not None else "unknown"
    # El rótulo legible viene del proveedor; si ninguno lo dio, cae en la clave.
    readable = next(
        (
            (signal.label, signal.display_value)
            for signal in (gpt, claude)
            if signal is not None and getattr(signal, "label", "")
        ),
        (key, ""),
    )
    label, display_value = readable
    origins = [
        signal.origin for signal in available.values() if signal is not None
    ]
    evidence = [
        item
        for signal in available.values()
        if signal is not None
        for item in signal.evidence
    ]
    invalid = [
        provider
        for provider, signal in available.items()
        if signal is not None and not _evidence_is_valid(signal, known_segments)
    ]

    if (
        gpt is not None
        and claude is not None
        and gpt.value is None
        and claude.value is None
        and not invalid
    ):
        return ReconciledSignal(
            key=key,
            label=label,
            display_value=display_value,
            value=None,
            origin=origins[0] if origins else Origin.MENTIONED,
            verification_status=VerificationStatus.NOT_IDENTIFIED,
            confidence_band=ConfidenceBand.LOW,
            evidence=[],
            provider_values=provider_values,
        )

    valid_non_null = {
        provider: signal
        for provider, signal in available.items()
        if signal is not None
        and signal.value is not None
        and provider not in invalid
    }
    if invalid:
        return ReconciledSignal(
            key=key,
            label=label,
            display_value=display_value,
            value=None,
            origin=Origin.CONTRASTED,
            verification_status=VerificationStatus.INCONSISTENT,
            confidence_band=ConfidenceBand.LOW,
            evidence=evidence,
            provider_values=provider_values,
            invalid_evidence_providers=invalid,
        )
    if len(valid_non_null) == 2:
        values = list(valid_non_null.values())
        if _canonical(values[0].value) == _canonical(values[1].value):
            return ReconciledSignal(
                key=key,
                label=label,
                display_value=display_value,
                value=values[0].value,
                origin=Origin.CONTRASTED,
                verification_status=VerificationStatus.CONFIRMED,
                confidence_band=ConfidenceBand.HIGH,
                evidence=evidence,
                provider_values=provider_values,
            )
        return ReconciledSignal(
            key=key,
            label=label,
            display_value=display_value,
            value=None,
            origin=Origin.CONTRASTED,
            verification_status=VerificationStatus.INCONSISTENT,
            confidence_band=ConfidenceBand.LOW,
            evidence=evidence,
            provider_values=provider_values,
        )
    if len(valid_non_null) == 1:
        signal = next(iter(valid_non_null.values()))
        return ReconciledSignal(
            key=key,
            label=label,
            display_value=display_value,
            value=signal.value,
            origin=signal.origin,
            verification_status=VerificationStatus.PENDING,
            confidence_band=ConfidenceBand.MEDIUM,
            evidence=signal.evidence,
            provider_values=provider_values,
        )
    return ReconciledSignal(
        key=key,
        label=label,
        display_value=display_value,
        value=None,
        origin=Origin.CONTRASTED,
        verification_status=VerificationStatus.INCONSISTENT,
        confidence_band=ConfidenceBand.LOW,
        evidence=evidence,
        provider_values=provider_values,
    )

