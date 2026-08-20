from __future__ import annotations

from pathlib import Path
from typing import Any

from app.ai.contracts import BetoClassification, LabelProbability


class BetoAdapter:
    def __init__(
        self,
        *,
        classifier: Any | None,
        unavailable_reason: str | None = None,
    ) -> None:
        self.classifier = classifier
        self.unavailable_reason = unavailable_reason

    @classmethod
    def load(cls, artifact_dir: Path) -> "BetoAdapter":
        try:
            from app.ai.ml_service.classifier_service import ViolenceClassifier

            return cls(classifier=ViolenceClassifier(artifact_dir))
        except (ImportError, FileNotFoundError, RuntimeError) as exc:
            return cls(
                classifier=None,
                unavailable_reason=f"{type(exc).__name__}:{exc}",
            )

    def classify(self, text: str) -> BetoClassification:
        if self.classifier is None:
            return BetoClassification(
                status="unavailable",
                unavailable_reason=self.unavailable_reason or "not_loaded",
            )
        result = self.classifier.predict(text)
        # predict() añade la distribución completa por clase; el contrato
        # público sólo expone la etiqueta ganadora y su confianza.
        return BetoClassification(
            status="available",
            category=_label(result["category"]),
            subcategory=_label(result["subcategory"]),
        )


def _label(reading: dict[str, Any]) -> LabelProbability:
    return LabelProbability(
        label=str(reading["label"]),
        confidence=float(reading["confidence"]),
    )

