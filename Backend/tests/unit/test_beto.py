from __future__ import annotations

from app.ai.beto import BetoAdapter


def test_beto_returns_category_and_subcategory_without_urgency():
    class FakeClassifier:
        def predict(self, text: str):
            assert text == "testimonio ficticio"
            return {
                "category": {"label": "Desplazamiento", "confidence": 0.91},
                "subcategory": {
                    "label": "Desplazamiento forzado",
                    "confidence": 0.87,
                },
            }

    result = BetoAdapter(classifier=FakeClassifier()).classify(
        "testimonio ficticio"
    )

    assert result.status == "available"
    assert result.category.label == "Desplazamiento"
    assert result.subcategory.label == "Desplazamiento forzado"
    assert "urgency" not in result.model_dump()
    assert "risk" not in result.model_dump()


def test_beto_unavailability_is_explicit_instead_of_inventing_a_label():
    result = BetoAdapter(classifier=None, unavailable_reason="torch_missing").classify(
        "testimonio ficticio"
    )

    assert result.status == "unavailable"
    assert result.category is None
    assert result.subcategory is None
    assert result.unavailable_reason == "torch_missing"

