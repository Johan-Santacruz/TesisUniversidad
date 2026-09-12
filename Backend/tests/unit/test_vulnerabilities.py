"""Vulnerabilidades se responde con casillas cerradas, no con texto libre."""
from app.ai.contracts import EvidenceRef, Origin, ProviderSignal
from app.ai.vulnerabilities import (
    VULNERABILITIES_LABEL,
    close_vulnerabilities,
    display_vulnerabilities,
    normalize_vulnerabilities,
)


def test_solo_quedan_las_opciones_de_la_lista_y_en_su_orden():
    assert normalize_vulnerabilities(["illness", "Children", "dos niñas"]) == [
        "children",
        "illness",
    ]


def test_ninguna_no_convive_con_otra_opcion():
    assert normalize_vulnerabilities(["none", "pregnancy"]) == ["pregnancy"]
    assert normalize_vulnerabilities(["none"]) == ["none"]


def test_sin_opcion_reconocible_no_hay_valor():
    assert normalize_vulnerabilities("dos niñas") is None
    assert normalize_vulnerabilities([]) is None
    assert normalize_vulnerabilities(None) is None


def test_el_texto_visible_sale_de_las_opciones():
    assert (
        display_vulnerabilities(["children", "pregnancy"])
        == "Niñas, niños o adolescentes · Embarazo"
    )


def test_el_rotulo_del_modelo_se_reemplaza_y_el_texto_libre_no_ancla_evidencia():
    """El caso real: el modelo escribió su propio rótulo y un valor libre."""
    signal = ProviderSignal(
        key="vulnerabilities",
        label="personas con necesidades especiales en el hogar",
        display_value="Dos niñas",
        value="dos niñas",
        origin=Origin.MENTIONED,
        evidence=[EvidenceRef(segment_id="segment-1", start_ms=0, end_ms=1000)],
    )

    closed = close_vulnerabilities(signal)

    assert closed.label == VULNERABILITIES_LABEL
    assert closed.value is None
    assert closed.evidence == []
