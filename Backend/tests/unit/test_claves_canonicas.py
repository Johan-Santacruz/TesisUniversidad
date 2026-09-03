"""El prompt y el código tienen que nombrar las mismas claves.

Durante dos corridas completas —57 hechos en diez videos— `is_critical` fue
falso siempre y la etapa `people_places` llegó vacía siempre. La causa no era
ninguna de las dos piezas por separado: el código consumía un vocabulario de
claves que el prompt nunca le pedía al modelo, así que éste las inventaba y
nada casaba. Estas pruebas fijan ese acuerdo.
"""
from app.ai.providers import ANALYSIS_INSTRUCTIONS
from app.services.analysis import CRITICAL_KEYS, PEOPLE_PLACE_KEYS


def test_el_prompt_nombra_todas_las_claves_que_el_codigo_consume():
    for clave in PEOPLE_PLACE_KEYS | CRITICAL_KEYS:
        assert f"'{clave}'" in ANALYSIS_INSTRUCTIONS, (
            f"El código separa o marca hechos por '{clave}', pero el prompt no "
            f"se la pide al modelo: nunca la va a emitir."
        )


def test_el_prompt_explica_que_la_grafia_es_exacta():
    """Sin esto el modelo traduce o renombra y el acuerdo se rompe igual."""
    assert "grafía exacta" in ANALYSIS_INSTRUCTIONS


def test_las_dos_listas_no_se_pisan():
    """Una clave crítica que además fuera de personas y lugares saldría en una
    etapa donde la revisión crítica no se muestra."""
    assert not (PEOPLE_PLACE_KEYS & CRITICAL_KEYS)
