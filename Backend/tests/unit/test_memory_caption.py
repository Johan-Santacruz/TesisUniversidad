from __future__ import annotations

from io import BytesIO

from PIL import Image

from app.services.memory_caption import compose_caption


def _plate(color: tuple[int, int, int] = (240, 236, 228)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (1536, 864), color).save(buffer, format="PNG")
    return buffer.getvalue()


def _pixels(data: bytes) -> Image.Image:
    with Image.open(BytesIO(data)) as image:
        return image.convert("RGB").copy()


def test_the_phrase_is_written_over_the_lower_band_of_the_plate():
    """Breaks if the closing line never reaches the image the reviewer approves."""
    composed = compose_caption(_plate(), "Volvió al camino con lo que pudo cargar.")

    image = _pixels(composed)
    assert image.size == (1536, 864)
    # La franja inferior deja de ser plana: ahí es donde entra el texto.
    banda = image.crop((0, 700, 1536, 864)).getcolors(maxcolors=1_000_000)
    assert banda is not None and len(banda) > 1
    # La mitad superior no se toca: la ilustración sigue intacta.
    arriba = image.crop((0, 0, 1536, 400)).getcolors(maxcolors=1_000_000)
    assert arriba == [(1536 * 400, (240, 236, 228))]


def test_a_plate_without_a_phrase_is_returned_untouched():
    """Breaks if a failed writer costs the illustration its own bytes."""
    original = _plate()

    assert compose_caption(original, "") is original
    assert compose_caption(original, "   ") is original


def test_the_context_line_accompanies_the_phrase_without_replacing_it():
    """Breaks if place and year push the phrase out of the band."""
    solo = compose_caption(_plate(), "Volvió al camino con lo que pudo cargar.")
    con_contexto = compose_caption(
        _plate(),
        "Volvió al camino con lo que pudo cargar.",
        "Cauca, 2019",
    )

    assert _pixels(solo).size == _pixels(con_contexto).size
    assert solo != con_contexto


def test_a_long_phrase_wraps_instead_of_running_past_the_margin():
    """Breaks if a two-sentence line is silently cut at the edge of the plate."""
    larga = (
        "Salió de la vereda una noche de marzo con sus cuatro hijos y lo que "
        "cupo en dos costales, y el cafetal quedó atrás sin nadie que lo cuidara."
    )

    image = _pixels(compose_caption(_plate(), larga))

    # El texto es lo único casi blanco de la lámina: el fondo es (240,236,228)
    # y el degradado sólo lo oscurece. Si un glifo cruzara el margen, ese blanco
    # aparecería en las franjas laterales.
    def _tiene_texto(caja: tuple[int, int, int, int]) -> bool:
        # Luminancia: el fondo llega a 236 y el degradado sólo lo baja; el
        # texto, en (255,253,248), pasa de 250.
        return image.crop(caja).convert("L").getextrema()[1] >= 245

    assert not _tiene_texto((0, 0, 90, 864))
    assert not _tiene_texto((1446, 0, 1536, 864))
    # Y la frase larga sí se escribió: en la banda inferior hay blanco.
    assert _tiene_texto((90, 600, 1446, 864))
