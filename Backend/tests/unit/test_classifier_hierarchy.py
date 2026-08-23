"""Contrato jerárquico del clasificador: enmascaramiento y abstención.

Estas pruebas no cargan los pesos del transformer; ejercitan la lógica que decide
qué subcategorías son alcanzables desde la categoría predicha.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.ai.ml_service.classifier_service import ViolenceClassifier


class _Encoder:
    def __init__(self, classes: list[str]) -> None:
        self.classes_ = np.array(classes)


def _service(hierarchy: object) -> ViolenceClassifier:
    service = ViolenceClassifier.__new__(ViolenceClassifier)
    service.config = {"category_to_subcategories": hierarchy} if hierarchy is not None else {}
    service.category_encoder = _Encoder(["Acciones armadas", "Desplazamiento forzado"])
    service.subcategory_encoder = _Encoder(["Combates", "Hostigamiento"])
    service.category_to_subcategories = service._load_hierarchy()
    service.subcategory_mask = service._build_mask()
    return service


def test_artifacts_without_hierarchy_keep_the_previous_behaviour():
    service = _service(None)

    assert service.category_to_subcategories is None
    assert service.subcategory_mask is None


def test_mask_marks_only_the_subcategories_of_each_category():
    service = _service(
        {
            "Acciones armadas": ["Combates", "Hostigamiento"],
            "Desplazamiento forzado": [],
        }
    )

    assert service.subcategory_mask.tolist() == [[True, True], [False, False]]


def test_a_category_without_reachable_subcategories_has_an_empty_row():
    service = _service({"Acciones armadas": ["Combates"], "Desplazamiento forzado": []})

    fila = service.subcategory_mask[1]
    assert not fila.any()


def test_unknown_subcategories_in_the_artifact_are_ignored():
    """Un artefacto puede nombrar subcategorías que el encoder no conoce."""
    service = _service({"Acciones armadas": ["Combates", "Clase inexistente"]})

    assert service.category_to_subcategories["Acciones armadas"] == ["Combates"]
    assert service.subcategory_mask[0].tolist() == [True, False]


@pytest.mark.parametrize("hierarchy", ["no es un dict", 42, []])
def test_a_malformed_hierarchy_falls_back_instead_of_crashing(hierarchy):
    service = _service(hierarchy)

    assert service.category_to_subcategories is None
