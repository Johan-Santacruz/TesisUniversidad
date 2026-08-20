from __future__ import annotations

import os

import pytest

from app.ai.contracts import TranscriptSegment
from app.ai.providers import AnthropicAnalysisAdapter, OpenAIAnalysisAdapter


pytestmark = [
    pytest.mark.smoke,
    pytest.mark.skipif(
        os.getenv("RUN_REAL_PROVIDER_SMOKE") != "1",
        reason="set RUN_REAL_PROVIDER_SMOKE=1 to call real providers",
    ),
]

FICTITIOUS_SEGMENTS = [
    TranscriptSegment(
        id="synthetic-segment-1",
        start_ms=0,
        end_ms=5000,
        text=(
            "Caso completamente ficticio: una familia imaginaria llega a "
            "Popayán y solicita orientación institucional."
        ),
    )
]


def test_real_structured_providers_accept_only_the_fictitious_smoke_case():
    from anthropic import Anthropic
    from openai import OpenAI

    openai_key = os.getenv("SENDA_OPENAI_API_KEY")
    anthropic_key = os.getenv("SENDA_ANTHROPIC_API_KEY")
    if not openai_key or not anthropic_key:
        pytest.skip("both provider API keys are required")

    gpt = OpenAIAnalysisAdapter(
        client=OpenAI(api_key=openai_key),
        model=os.getenv("SENDA_OPENAI_ANALYSIS_MODEL", "gpt-5.6-terra"),
    ).analyze(FICTITIOUS_SEGMENTS)
    claude = AnthropicAnalysisAdapter(
        client=Anthropic(api_key=anthropic_key),
        model=os.getenv("SENDA_ANTHROPIC_ANALYSIS_MODEL", "claude-sonnet-5"),
    ).analyze(FICTITIOUS_SEGMENTS)

    assert gpt.provider == "gpt"
    assert claude.provider == "claude"
    assert all(
        evidence.segment_id == "synthetic-segment-1"
        for result in (gpt, claude)
        for signal in result.signals
        for evidence in signal.evidence
    )
