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
        # subcategory llega en None cuando la categoría predicha no tiene
        # ninguna subcategoría alcanzable: preferimos abstenernos antes que
        # devolver una etiqueta de otra familia con alta confianza.
        return BetoClassification(
            status="available",
            category=_label(result["category"]),
            subcategory=_label(result.get("subcategory")),
        )


def _label(reading: dict[str, Any] | None) -> LabelProbability | None:
    if reading is None:
        return None
    return LabelProbability(
        label=str(reading["label"]),
        confidence=float(reading["confidence"]),
    )

