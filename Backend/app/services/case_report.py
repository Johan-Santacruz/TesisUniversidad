"""El resumen del caso en PDF.

Recoge lo que SENDA sacó del testimonio —tipo de caso, señales, cronología,
rutas y fuentes— con el estado de revisión de cada dato, para llevarlo a una
reunión o anexarlo a un expediente sin abrir la aplicación.

Quedan fuera, a propósito, la transcripción y el video. El resumen sale del
sistema cifrado y viaja por correo o en papel: lo que no lleva no se puede
filtrar. Las rutas siguen la misma regla que la pantalla: mientras haya
señales críticas sin confirmar no se imprimen, porque una ruta impresa es una
ruta que alguien va a seguir.

El módulo no toca la base: recibe el caso ya descifrado y devuelve bytes. Así
se prueba sin servidor y no hay forma de que lea más de lo que se le pasa.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache, partial
from io import BytesIO
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFError, TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    BaseDocTemplate,
    CondPageBreak,
    Flowable,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.flowables import HRFlowable

from app.ai.vulnerabilities import VULNERABILITIES_KEY
from app.schemas import CaseRead, FactRead, RouteRead, SourceRead


logger = logging.getLogger(__name__)


# La paleta de index.css, pasada de OKLCH a sRGB. La página va en blanco y no
# en el papel de la pantalla: un PDF termina impreso, y un fondo de color es
# tinta que no dice nada.
INK = HexColor("#1A120C")
INK_SOFT = HexColor("#473E36")
INK_FADED = HexColor("#564E48")
RULE = HexColor("#C5B8A9")
PAPER = HexColor("#F9F4EA")
PAPER_DEEP = HexColor("#EEE5D5")
AMARILLO = HexColor("#EFBD24")
AZUL = HexColor("#0A4483")
ROJO = HexColor("#901114")
GREEN = HexColor("#064420")

FONT_DIR = Path(__file__).resolve().parents[1] / "data" / "fonts"

PAGE_WIDTH, PAGE_HEIGHT = LETTER
MARGIN = 22 * mm
HEADER_Y = PAGE_HEIGHT - 14 * mm
FOOTER_Y = 12 * mm

# Colombia no cambia de hora desde 1993: un desfase fijo evita depender de la
# base de zonas horarias del sistema, que la imagen slim no garantiza.
COLOMBIA = timezone(timedelta(hours=-5), "COT")
MONTHS = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
    "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)

# Los textos de estado son los de la pantalla, para que el papel y la
# aplicación digan lo mismo del mismo dato. Si cambian allá, cambian aquí.
# Revisión de una señal: verification-panel.tsx.
FACT_REVIEW_LABELS = {
    "confirmed": "Confirmada",
    "pending": "Por confirmar",
    "not_identified": "Sin dato",
    "inconsistent": "Requiere revisión",
}
# Estado de una ruta: status-badge.tsx.
VERIFICATION_LABELS = {
    "confirmed": "Confirmado",
    "pending": "Pendiente",
    "not_identified": "No identificado",
    "inconsistent": "Inconsistente",
}
CONFIDENCE_LABELS = {
    "high": "Confianza alta",
    "medium": "Confianza media",
    "low": "Confianza baja",
}
# La palabra que matiza la confianza de la categoría: classification-panel.tsx.
CERTAINTY_FLOORS = (
    (0.85, "lectura firme"),
    (0.65, "lectura probable"),
    (0.35, "lectura provisional"),
)
ROLE_LABELS = {
    "operador": "operador",
    "validador": "validador",
    "admin": "administrador",
}


@dataclass(frozen=True)
class ReportContext:
    """Lo que el caso no sabe de sí mismo y el resumen necesita decir."""

    reference: str
    analyzed_at: datetime
    is_demo: bool
    generated_at: datetime
    generated_by_role: str


@dataclass(frozen=True)
class _Fonts:
    serif: str
    sans: str
    sans_medium: str
    sans_bold: str


@lru_cache(maxsize=1)
def _fonts() -> _Fonts:
    faces = {
        "SendaSerif": "LibreCaslonText-Regular.ttf",
        "SendaSerif-Italic": "LibreCaslonText-Italic.ttf",
        "SendaSans": "Poppins-Regular.ttf",
        "SendaSans-Medium": "Poppins-Medium.ttf",
        "SendaSans-SemiBold": "Poppins-SemiBold.ttf",
    }
    try:
        for name, filename in faces.items():
            pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / filename)))
    except (OSError, TTFError) as exc:
        # Sin las fuentes el resumen sale igual, con las estándar del PDF:
        # perder la tipografía es preferible a perder el documento.
        logger.warning("case_report_fonts_unavailable: %s", exc)
        return _Fonts("Times-Roman", "Helvetica", "Helvetica", "Helvetica-Bold")
    pdfmetrics.registerFontFamily(
        "SendaSans",
        normal="SendaSans",
        bold="SendaSans-SemiBold",
        italic="SendaSans",
        boldItalic="SendaSans-SemiBold",
    )
    pdfmetrics.registerFontFamily(
        "SendaSerif",
        normal="SendaSerif",
        bold="SendaSerif",
        italic="SendaSerif-Italic",
        boldItalic="SendaSerif-Italic",
    )
    return _Fonts("SendaSerif", "SendaSans", "SendaSans-Medium", "SendaSans-SemiBold")


def _local(value: datetime) -> datetime:
    # SQLite devuelve las fechas sin zona aunque se guardaron en UTC.
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(COLOMBIA)


def _spelled(value: datetime) -> str:
    return f"{value.day} de {MONTHS[value.month - 1]} de {value.year}"


def _date(value: datetime) -> str:
    return _spelled(_local(value))


def _calendar_date(value: datetime) -> str:
    """Una fecha de calendario guardada como medianoche UTC, como la vigencia
    de una fuente. Pasarla a hora de Colombia la correría al día anterior."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc)
    return _spelled(value)


def _datetime(value: datetime) -> str:
    local = _local(value)
    hour = local.hour % 12 or 12
    suffix = "a. m." if local.hour < 12 else "p. m."
    return f"{_date(local)}, {hour}:{local.minute:02d} {suffix}"


def _stamp(milliseconds: int) -> str:
    seconds = max(0, milliseconds // 1000)
    return f"{seconds // 60}:{seconds % 60:02d}"


def _text(value: object) -> str:
    """Texto seguro para un Paragraph, que interpreta marcas tipo XML.

    Todo lo que viene del caso lo escribió un modelo o una persona: un "<" o
    un "&" sueltos romperían el documento entero.
    """
    return escape(str(value)).replace("\n", "<br/>")


def _scalar_text(value: Any) -> str:
    if isinstance(value, bool):
        return "Sí" if value else "No"
    if isinstance(value, list):
        parts = [str(item) for item in value]
        if len(parts) > 1:
            return f"{', '.join(parts[:-1])} y {parts[-1]}"
        return parts[0] if parts else ""
    return str(value)


def _fact_value(fact: FactRead) -> tuple[str, bool]:
    """El valor que se imprime y si es un valor o el aviso de que falta."""
    if fact.value is None:
        readings = [
            reading
            for reading in fact.provider_values.values()
            if reading not in (None, "")
        ]
        if readings and fact.key != VULNERABILITIES_KEY:
            return "Las lecturas no coinciden", False
        return "No se encontró en el relato", False
    shown = (fact.display_value or "").strip() or _scalar_text(fact.value)
    return shown, True


def _certainty(confidence: float) -> str:
    for floor, word in CERTAINTY_FLOORS:
        if confidence >= floor:
            return word
    return "lectura débil"


def _classification_entry(classification: dict[str, Any], level: str) -> tuple[str, float | None] | None:
    value = classification.get(level)
    if not isinstance(value, dict) or not isinstance(value.get("label"), str):
        return None
    confidence = value.get("confidence")
    return value["label"], confidence if isinstance(confidence, (int, float)) else None


def is_route_held(case: CaseRead) -> bool:
    """Espejo de isRouteHeld en route-stage.tsx."""
    return any(
        fact.is_critical and fact.verification_status != "confirmed"
        for fact in case.facts
    )


def includes_routes(case: CaseRead) -> bool:
    """Si el resumen imprime las rutas y sus fuentes.

    No mientras se retienen por señales críticas, ni mientras se ajustan: la
    versión anterior es justo la que las señales confirmadas pueden cambiar.
    """
    return bool(case.routes) and not is_route_held(case) and case.routes_status != "rebuilding"


class _Eyebrow(Flowable):
    """Antetítulo en versalitas espaciadas, como .eyebrow en la interfaz.

    Paragraph no sabe espaciar letras; el lienzo sí.
    """

    def __init__(self, text: str, font: str, color: Color = INK_FADED) -> None:
        super().__init__()
        self.text = text.upper()
        self.font = font
        self.color = color
        self.size = 7.2

    def wrap(self, available_width: float, available_height: float) -> tuple[float, float]:
        return available_width, self.size * 1.5

    def draw(self) -> None:
        _tracked(self.canv, self.text, 0, self.size * 0.3, self.font, self.size, self.color)


class _Tricolor(Flowable):
    """El trazo amarillo, azul y rojo con que la portada y la subida
    subrayan su titular."""

    def __init__(self, width: float = 54, height: float = 2.4) -> None:
        super().__init__()
        self.width = width
        self.height = height

    def wrap(self, available_width: float, available_height: float) -> tuple[float, float]:
        return self.width, self.height

    def draw(self) -> None:
        third = self.width / 3
        for index, color in enumerate((AMARILLO, AZUL, ROJO)):
            self.canv.setFillColor(color)
            self.canv.rect(index * third, 0, third, self.height, stroke=0, fill=1)


def _tracked(
    canvas: Canvas,
    text: str,
    x: float,
    y: float,
    font: str,
    size: float,
    color: Color,
    *,
    align_right: bool = False,
) -> None:
    char_space = size * 0.12
    if align_right:
        x -= pdfmetrics.stringWidth(text, font, size) + char_space * (len(text) - 1)
    line = canvas.beginText(x, y)
    line.setFont(font, size)
    line.setCharSpace(char_space)
    line.setFillColor(color)
    line.textOut(text)
    canvas.drawText(line)


def _draw_chrome(canvas: Canvas, _document: BaseDocTemplate, *, fonts: _Fonts, context: ReportContext) -> None:
    """Cabecera y pie de cada página. El número de página lo pone el lienzo
    al final, cuando ya sabe cuántas hay."""
    canvas.saveState()
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    # La portada ya nombra el caso en su antetítulo: la cabecera corrida
    # empieza en la segunda página, como en un informe impreso.
    if canvas.getPageNumber() > 1:
        _tracked(canvas, "SENDA · RESUMEN DEL CASO", MARGIN, HEADER_Y, fonts.sans_medium, 6.8, INK_FADED)
        _tracked(
            canvas,
            f"CASO {context.reference}",
            PAGE_WIDTH - MARGIN,
            HEADER_Y,
            fonts.sans_medium,
            6.8,
            INK_FADED,
            align_right=True,
        )
        canvas.line(MARGIN, HEADER_Y - 3.2 * mm, PAGE_WIDTH - MARGIN, HEADER_Y - 3.2 * mm)
    canvas.line(MARGIN, FOOTER_Y + 4.2 * mm, PAGE_WIDTH - MARGIN, FOOTER_Y + 4.2 * mm)
    canvas.setFont(fonts.sans, 7)
    canvas.setFillColor(INK_FADED)
    canvas.drawString(
        MARGIN,
        FOOTER_Y,
        f"Documento confidencial · Generado el {_datetime(context.generated_at)}",
    )
    canvas.restoreState()


def _numbered_canvas(font: str) -> type[Canvas]:
    """Un lienzo que guarda las páginas y las numera al cerrar el documento:
    "Página 2 de 5" exige saber el total antes de escribir la primera."""

    class NumberedCanvas(Canvas):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            self._pending_pages: list[dict[str, Any]] = []

        def showPage(self) -> None:  # noqa: N802 — nombre de reportlab
            self._pending_pages.append(dict(self.__dict__))
            self._startPage()

        def save(self) -> None:
            total = len(self._pending_pages)
            for page in self._pending_pages:
                self.__dict__.update(page)
                self.setFont(font, 7)
                self.setFillColor(INK_FADED)
                self.drawRightString(
                    PAGE_WIDTH - MARGIN,
                    FOOTER_Y,
                    f"Página {self._pageNumber} de {total}",
                )
                super().showPage()
            super().save()

    return NumberedCanvas


class _ReportBuilder:
    def __init__(self, case: CaseRead, context: ReportContext, fonts: _Fonts, width: float) -> None:
        self.case = case
        self.context = context
        self.fonts = fonts
        self.width = width
        # Las fuentes se numeran en el orden en que el caso las trae, y las
        # rutas las citan por ese número.
        self.source_numbers = {source.id: index for index, source in enumerate(case.sources, start=1)}
        self.sources = {source.id: source for source in case.sources}
        body = ParagraphStyle(
            "body",
            fontName=fonts.sans,
            fontSize=8.8,
            leading=13.4,
            textColor=INK_SOFT,
        )
        self.styles = {
            "title": ParagraphStyle(
                "title", fontName=fonts.serif, fontSize=26, leading=31, textColor=INK
            ),
            "lede": ParagraphStyle("lede", parent=body, fontSize=9.8, leading=15.2),
            "h2": ParagraphStyle(
                "h2", fontName=fonts.sans_bold, fontSize=12.4, leading=16, textColor=INK
            ),
            "h3": ParagraphStyle(
                "h3", fontName=fonts.sans_bold, fontSize=10.2, leading=14, textColor=INK
            ),
            "body": body,
            "strong": ParagraphStyle(
                "strong", parent=body, fontName=fonts.sans_bold, textColor=INK
            ),
            "label": ParagraphStyle(
                "label",
                fontName=fonts.sans_medium,
                fontSize=7.2,
                leading=10.2,
                textColor=INK_FADED,
            ),
            "meta": ParagraphStyle(
                "meta", fontName=fonts.sans, fontSize=7.4, leading=10.6, textColor=INK_FADED
            ),
            "cell": ParagraphStyle("cell", parent=body, fontSize=8.4, leading=12),
            "cell_strong": ParagraphStyle(
                "cell_strong",
                parent=body,
                fontName=fonts.sans_bold,
                fontSize=8.4,
                leading=12,
                textColor=INK,
            ),
        }

    def p(self, text: str, style: str, **overrides: Any) -> Paragraph:
        chosen = self.styles[style]
        if overrides:
            chosen = ParagraphStyle(f"{style}-variant", parent=chosen, **overrides)
        return Paragraph(text, chosen)

    def story(self) -> list[Flowable]:
        return [
            *self._cover(),
            *self._classification(),
            *self._signals(),
            *self._timeline(),
            *self._routes(),
            *self._sources(),
            *self._closing(),
        ]

    # ── Portada ─────────────────────────────────────────────────────────

    def _cover(self) -> list[Flowable]:
        case, context = self.case, self.context
        category = _classification_entry(case.classification, "category")
        title = category[0] if category else "Caso sin clasificar"
        flowables: list[Flowable] = [
            Spacer(1, 4 * mm),
            _Eyebrow(
                f"Caso {context.reference}" + (" · Demostración" if context.is_demo else ""),
                self.fonts.sans_bold,
            ),
            Spacer(1, 2.5 * mm),
            self.p(_text(title), "title"),
            Spacer(1, 4 * mm),
            _Tricolor(),
            Spacer(1, 4.5 * mm),
            self.p(
                "Resumen de lo que SENDA extrajo del testimonio: el tipo de caso, "
                "las señales, la cronología y las rutas institucionales, con el "
                "estado de revisión de cada dato.",
                "lede",
            ),
            Spacer(1, 7 * mm),
            self._facts_sheet(),
            Spacer(1, 6 * mm),
        ]
        if case.recommendation_status != "final":
            flowables += [
                self._callout(
                    "Orientación preliminar",
                    "Ninguna persona validadora ha aprobado todavía esta orientación. "
                    "No la entregue como definitiva y confirme disponibilidad y "
                    "requisitos con cada entidad.",
                    AMARILLO,
                ),
                Spacer(1, 6 * mm),
            ]
        return flowables

    def _facts_sheet(self) -> Table:
        case, context = self.case, self.context
        critical_pending = sum(
            fact.is_critical and fact.verification_status != "confirmed"
            for fact in case.facts
        )
        signals = (
            "1 señal" if len(case.facts) == 1 else f"{len(case.facts)} señales"
        )
        if critical_pending:
            signals += (
                " · 1 crítica sin confirmar"
                if critical_pending == 1
                else f" · {critical_pending} críticas sin confirmar"
            )
        status = (
            f"Aprobado el {_date(case.approved_at)}"
            if case.status == "approved" and case.approved_at is not None
            else "En revisión"
        )
        routes = {
            "rebuilt": "Ajustadas con las señales confirmadas",
            "rebuilding": "Ajustándose con las señales confirmadas",
            "rebuild_failed": "No se pudieron ajustar; se conserva la versión anterior",
        }.get(case.routes_status, "Las del análisis del testimonio")
        cells = [
            ("Analizado el", _datetime(context.analyzed_at)),
            ("Estado", status),
            (
                "Orientación",
                "Final, aprobada" if case.recommendation_status == "final" else "Preliminar",
            ),
            ("Señales", signals),
            (
                "Origen",
                "Demostración con datos ficticios" if context.is_demo else "Testimonio cargado",
            ),
            ("Rutas", routes),
        ]
        grid = [
            [
                [self.p(_text(label), "label"), self.p(_text(value), "cell_strong")]
                for label, value in cells[row:row + 3]
            ]
            for row in (0, 3)
        ]
        table = Table(grid, colWidths=[self.width / 3] * 3)
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEABOVE", (0, 0), (-1, 0), 0.8, INK),
                    ("LINEABOVE", (0, 1), (-1, 1), 0.4, RULE),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        return table

    def _callout(self, title: str, body: str, accent: Color, extra: list[Flowable] | None = None) -> Table:
        content: list[Flowable] = [
            self.p(_text(title), "strong"),
            Spacer(1, 1.2 * mm),
            self.p(_text(body), "body"),
            *(extra or []),
        ]
        table = Table([[content]], colWidths=[self.width])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                    ("LINEBEFORE", (0, 0), (0, -1), 2.6, accent),
                    ("LEFTPADDING", (0, 0), (-1, -1), 11),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 11),
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ]
            )
        )
        return table

    def _section(self, title: str, note: str | None = None) -> list[Flowable]:
        # Un título no se queda solo al pie de una página: si no cabe con algo
        # de su contenido, empieza en la siguiente.
        flowables: list[Flowable] = [
            CondPageBreak(42 * mm),
            Spacer(1, 3 * mm),
            self.p(_text(title), "h2"),
        ]
        if note:
            flowables += [Spacer(1, 0.8 * mm), self.p(_text(note), "meta")]
        flowables += [
            HRFlowable(width="100%", thickness=0.8, color=INK, spaceBefore=5, spaceAfter=7),
        ]
        return flowables

    def _rows(self, rows: list[list[Any]], widths: list[float], *, header: bool) -> Table:
        table = Table(rows, colWidths=[self.width * share for share in widths], repeatRows=1 if header else 0)
        commands: list[tuple[Any, ...]] = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ]
        if header:
            commands.append(("LINEBELOW", (0, 0), (-1, 0), 0.6, INK_SOFT))
        table.setStyle(TableStyle(commands))
        return table

    # ── Tipo de caso ────────────────────────────────────────────────────

    def _classification(self) -> list[Flowable]:
        classification = self.case.classification
        category = _classification_entry(classification, "category")
        subcategory = _classification_entry(classification, "subcategory")
        flowables = self._section("Tipo de caso")
        if category is None and subcategory is None:
            return flowables + [
                self.p("La clasificación no estuvo disponible para este caso.", "body"),
            ]
        rows: list[list[Any]] = []
        if category is not None:
            label, confidence = category
            reading = (
                f"{_certainty(confidence)} · {round(confidence * 100)}% de confianza"
                if confidence is not None
                else ""
            )
            rows.append(
                [
                    self.p("Categoría", "label"),
                    [self.p(_text(label), "cell_strong"), self.p(_text(reading), "meta")],
                ]
            )
        if subcategory is not None:
            # Sin porcentaje, como en pantalla: la "confianza" de la
            # subcategoría depende de cuántas cuelgan de la categoría y no mide
            # qué tan segura es la lectura.
            rows.append(
                [
                    self.p("Subcategoría", "label"),
                    [
                        self.p(_text(subcategory[0]), "cell_strong"),
                        self.p("sin calibrar · contrástela con el relato", "meta"),
                    ],
                ]
            )
        return flowables + [self._rows(rows, [0.24, 0.76], header=False)]

    # ── Señales ─────────────────────────────────────────────────────────

    def _signals(self) -> list[Flowable]:
        facts = self.case.facts
        flowables = self._section(
            "Señales del relato",
            "Lo que el análisis identificó en el testimonio y cómo quedó tras la revisión humana.",
        )
        if not facts:
            return flowables + [self.p("El análisis no identificó señales.", "body")]
        rows: list[list[Any]] = [
            [
                self.p("SEÑAL", "label"),
                self.p("VALOR", "label"),
                self.p("REVISIÓN", "label"),
                self.p("MINUTO", "label"),
            ]
        ]
        for fact in facts:
            value, identified = _fact_value(fact)
            name: list[Flowable] = [self.p(_text(fact.label), "cell_strong")]
            if fact.is_critical:
                blocking = fact.verification_status != "confirmed"
                name.append(
                    self.p(
                        "Crítica · bloquea la aprobación" if blocking else "Crítica",
                        "meta",
                        textColor=ROJO if blocking else INK_FADED,
                    )
                )
            review_color = {
                "confirmed": GREEN,
                "inconsistent": ROJO,
            }.get(fact.verification_status, INK_FADED)
            rows.append(
                [
                    name,
                    self.p(
                        _text(value),
                        "cell",
                        textColor=INK if identified else INK_FADED,
                    ),
                    self.p(
                        _text(FACT_REVIEW_LABELS.get(fact.verification_status, fact.verification_status)),
                        "cell_strong",
                        textColor=review_color,
                    ),
                    self.p(
                        _stamp(fact.evidence[0].start_ms) if fact.evidence else "—",
                        "cell",
                    ),
                ]
            )
        return flowables + [self._rows(rows, [0.3, 0.38, 0.2, 0.12], header=True)]

    # ── Cronología ──────────────────────────────────────────────────────

    def _timeline(self) -> list[Flowable]:
        events = sorted(self.case.timeline, key=lambda event: event.start_ms)
        flowables = self._section(
            "Cronología del relato",
            "Los momentos del testimonio en el orden en que ocurren en el video.",
        )
        if not events:
            return flowables + [self.p("El análisis no ordenó momentos del relato.", "body")]
        rows = [
            [
                self.p(f"{_stamp(event.start_ms)}–{_stamp(event.end_ms)}", "meta"),
                [
                    self.p(_text(event.title), "cell_strong"),
                    self.p(_text(event.description), "cell"),
                ],
            ]
            for event in events
        ]
        return flowables + [self._rows(rows, [0.16, 0.84], header=False)]

    # ── Rutas ───────────────────────────────────────────────────────────

    def _routes(self) -> list[Flowable]:
        case = self.case
        flowables = self._section(
            "Rutas institucionales",
            "Confirme siempre la disponibilidad y los requisitos con la entidad.",
        )
        if is_route_held(case):
            pending = [
                fact.label
                for fact in case.facts
                if fact.is_critical and fact.verification_status != "confirmed"
            ]
            listing = [
                self.p(f"·&nbsp;&nbsp;{_text(label)}", "body") for label in pending
            ]
            return flowables + [
                self._callout(
                    "Las rutas se incluirán cuando las señales críticas estén confirmadas",
                    "Una ruta construida sobre una señal en duda es una ruta en duda. "
                    "Faltan por confirmar:",
                    ROJO,
                    [Spacer(1, 1.2 * mm), *listing],
                )
            ]
        if case.routes_status == "rebuilding":
            return flowables + [
                self._callout(
                    "La ruta se está ajustando con las señales confirmadas",
                    "Vuelva a exportar el resumen cuando termine el ajuste: la "
                    "versión anterior es justo la que las señales pueden cambiar.",
                    AZUL,
                )
            ]
        if not case.routes:
            return flowables + [self.p("El análisis no propuso rutas.", "body")]
        if case.routes_status == "rebuild_failed" and case.recommendation_status != "final":
            flowables += [
                self._callout(
                    "No se pudo ajustar la ruta con las señales confirmadas",
                    "Se conserva la última versión disponible. Reintente el ajuste "
                    "antes de aprobarla.",
                    ROJO,
                ),
                Spacer(1, 4 * mm),
            ]
        for index, route in enumerate(case.routes):
            if index:
                flowables.append(Spacer(1, 5 * mm))
            flowables += self._route(route)
        return flowables

    def _route(self, route: RouteRead) -> list[Flowable]:
        status = " · ".join(
            [
                VERIFICATION_LABELS.get(route.verification_status, route.verification_status),
                CONFIDENCE_LABELS.get(route.confidence_band, route.confidence_band),
            ]
        )
        head = [
            self.p(_text(route.title), "h3"),
            Spacer(1, 0.8 * mm),
            self.p(_text(status), "meta"),
            Spacer(1, 1.6 * mm),
            self.p(_text(route.summary), "body"),
            Spacer(1, 2.4 * mm),
        ]
        if not route.steps:
            return [KeepTogether(head + [self.p("Esta ruta no trae paradas.", "meta")])]
        rows = []
        for number, step in enumerate(route.steps, start=1):
            body: list[Flowable] = [self.p(_text(step.title), "cell_strong")]
            if step.key_point:
                body += [
                    Spacer(1, 0.8 * mm),
                    self.p(f"<b>Lo esencial:</b> {_text(step.key_point)}", "cell", textColor=INK),
                ]
            if step.instructions:
                body += [Spacer(1, 0.8 * mm), self.p(_text(step.instructions), "cell")]
            for claim in step.claims:
                number_of = self.source_numbers.get(claim.source_entry_id)
                source = self.sources.get(claim.source_entry_id)
                cite = (
                    f"Fuente {number_of}: {_text(source.entity)} · {_text(source.program)}"
                    if number_of is not None and source is not None
                    else "Sin fuente institucional verificable."
                )
                body += [
                    Spacer(1, 1 * mm),
                    self.p(_text(claim.text), "cell"),
                    self.p(
                        cite,
                        "meta",
                        textColor=INK_FADED if source is not None else ROJO,
                    ),
                ]
            rows.append([self.p(f"{number:02d}", "cell_strong", textColor=INK_FADED), body])
        # El encabezado de la ruta viaja con su primera parada: solo, al pie
        # de una página, sería un título sin nada debajo.
        widths = [0.08, 0.92]
        flowables: list[Flowable] = [
            KeepTogether(head + [self._rows(rows[:1], widths, header=False)])
        ]
        if len(rows) > 1:
            flowables.append(self._rows(rows[1:], widths, header=False))
        return flowables

    # ── Fuentes ─────────────────────────────────────────────────────────

    def _sources(self) -> list[Flowable]:
        case = self.case
        if not case.sources or not includes_routes(case):
            # Las fuentes respaldan las rutas: sin rutas impresas no hay nada
            # que citar.
            return []
        flowables = self._section(
            "Fuentes institucionales",
            "Las entidades que respaldan las paradas de las rutas, con su vigencia.",
        )
        rows = [self._source_row(source) for source in case.sources]
        return flowables + [self._rows(rows, [0.08, 0.92], header=False)]

    def _source_row(self, source: SourceRead) -> list[Any]:
        validity = (
            self.p("Vigencia vencida — confirmar con la entidad", "meta", textColor=ROJO)
            if source.is_expired
            else self.p(f"Vigente hasta el {_calendar_date(source.expires_at)}", "meta")
        )
        url = escape(source.url, {'"': "&quot;"})
        body: list[Flowable] = [
            self.p(f"{_text(source.entity)} · {_text(source.program)}", "cell_strong"),
            self.p(f"Cubre {_text(source.coverage)}", "meta"),
            Spacer(1, 1 * mm),
            self.p(f"<b>Requisitos:</b> {_text(source.requirements)}", "cell"),
            self.p(f"<b>Contacto:</b> {_text(source.contact)}", "cell"),
            self.p(f'<link href="{url}" color="#0A4483">{url}</link>', "meta"),
            validity,
        ]
        if source.disclaimer:
            body.append(self.p(_text(source.disclaimer), "meta", textColor=INK))
        return [self.p(f"{self.source_numbers[source.id]:02d}", "cell_strong", textColor=INK_FADED), body]

    # ── Cierre ──────────────────────────────────────────────────────────

    def _closing(self) -> list[Flowable]:
        context = self.context
        role = ROLE_LABELS.get(context.generated_by_role, context.generated_by_role)
        return [
            Spacer(1, 9 * mm),
            HRFlowable(width="100%", thickness=0.4, color=RULE, spaceAfter=6),
            self.p(
                f"Generado desde SENDA el {_datetime(context.generated_at)} por una "
                f"persona con rol {_text(role)}. Este resumen no incluye la "
                "transcripción ni el video del testimonio. Contiene información "
                "sensible: compártalo sólo con quien lo necesite para atender el caso.",
                "meta",
            ),
        ]


def render_case_report(case: CaseRead, context: ReportContext) -> bytes:
    """El resumen del caso como un PDF tamaño carta."""
    fonts = _fonts()
    buffer = BytesIO()
    document = BaseDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=26 * mm,
        bottomMargin=24 * mm,
        title=f"Resumen del caso {context.reference}",
        author="SENDA",
        subject="Resumen del análisis de un testimonio",
        creator="SENDA",
        lang="es-CO",
    )
    frame = Frame(
        document.leftMargin,
        document.bottomMargin,
        document.width,
        document.height,
        id="cuerpo",
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    document.addPageTemplates(
        [
            PageTemplate(
                id="caso",
                frames=[frame],
                onPage=partial(_draw_chrome, fonts=fonts, context=context),
            )
        ]
    )
    builder = _ReportBuilder(case, context, fonts, document.width)
    document.build(builder.story(), canvasmaker=_numbered_canvas(fonts.sans))
    return buffer.getvalue()
