"""Sobreimprime la frase de cierre en la lámina ya generada.

El texto no se le pide al modelo de imagen: `gpt-image-2` todavía deforma
tildes y eñes, y una lámina conmemorativa con "memria" encima no sirve. El
prompt reserva una franja inferior de tono parejo y aquí se escribe encima con
Pillow, que compone el español correcto y a resolución completa.
"""
from __future__ import annotations

from functools import lru_cache
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont


_MARGIN = 96
_PHRASE_SIZE = 46
_CONTEXT_SIZE = 28
_PHRASE_LEADING = 62
# La franja se oscurece lo justo para sostener el texto blanco sobre una
# acuarela clara. Más opacidad taparía la ilustración que acompaña.
_SCRIM_ALPHA = 150


# `ImageFont.load_default()` no trae glifos acentuados: escribía "Sali□ atr□s"
# en una lámina conmemorativa. Se busca una fuente real; el orden cubre la
# imagen Docker primero y el desarrollo en macOS después.
_FONT_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
)


@lru_cache(maxsize=8)
def _font(size: int):
    for ruta in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(ruta, size)
        except OSError:
            continue
    # Sin fuente instalada la lámina sigue saliendo, con las tildes rotas: es
    # peor que el texto correcto y mejor que quedarse sin cierre.
    return ImageFont.load_default(size=size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    lines: list[str] = []
    line = ""
    for word in text.split():
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=font) <= width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def compose_caption(image: bytes, phrase: str, context_line: str = "") -> bytes:
    """Devuelve el PNG con la frase escrita en su franja inferior.

    Sin frase devuelve la imagen intacta: una lámina sin texto es un resultado
    válido, y es preferible a una franja oscura y vacía.
    """
    if not phrase.strip():
        return image

    with Image.open(BytesIO(image)) as source:
        canvas = source.convert("RGBA")

    width, height = canvas.size
    usable = width - 2 * _MARGIN
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    phrase_font = _font(_PHRASE_SIZE)
    context_font = _font(_CONTEXT_SIZE)
    lines = _wrap(draw, " ".join(phrase.split()), phrase_font, usable)
    context = " ".join(context_line.split())

    block = len(lines) * _PHRASE_LEADING
    if context:
        block += _CONTEXT_SIZE + 22
    top = height - _MARGIN - block

    # El degradado evita el corte recto de un rectángulo: la franja se funde
    # con la ilustración en vez de recortarla.
    scrim = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    scrim_draw = ImageDraw.Draw(scrim)
    fade = top - 90
    for offset in range(fade, height):
        progress = (offset - fade) / max(height - fade, 1)
        scrim_draw.line(
            [(0, offset), (width, offset)],
            fill=(18, 20, 24, int(_SCRIM_ALPHA * progress)),
        )
    overlay = Image.alpha_composite(scrim, overlay)
    draw = ImageDraw.Draw(overlay)

    for index, line in enumerate(lines):
        draw.text(
            (_MARGIN, top + index * _PHRASE_LEADING),
            line,
            font=phrase_font,
            fill=(255, 253, 248, 255),
        )
    if context:
        draw.text(
            (_MARGIN, top + len(lines) * _PHRASE_LEADING + 14),
            context,
            font=context_font,
            fill=(228, 224, 214, 235),
        )

    composed = Image.alpha_composite(canvas, overlay).convert("RGB")
    buffer = BytesIO()
    composed.save(buffer, format="PNG")
    return buffer.getvalue()
