"""Server-generated PDF rendering for the report engine (app/api/reports.py). Renders the exact
same ReportOut structure the JSON endpoint returns — same sections/headings/bodies/data tables —
so the PDF is never a second, divergent representation of the report.

Uses reportlab (pure-Python, no native/system dependency — see requirements.txt for why it was
picked over weasyprint). This is a genuine one-click server-side download: the browser's own
print dialog (frontend's existing "Print / Save as PDF" button, which stays as-is) depends on the
visitor's browser/OS; this endpoint returns real `application/pdf` bytes regardless of client.
"""

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas.report import ReportOut

_BRAND = colors.HexColor("#4338ca")
_MUTED = colors.HexColor("#6b7280")
_BORDER = colors.HexColor("#d1d5db")

_SOURCE_LABELS = {
    "gemini": "Gemini (live)",
    "groq": "Groq (live)",
    "cache": "Cached live response",
    "demo_ai": "Demo AI",
}


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="AIPCCTitle", fontSize=18, leading=22, textColor=colors.HexColor("#111827"), spaceAfter=4))
    styles.add(ParagraphStyle(name="AIPCCSubtitle", fontSize=10, leading=14, textColor=_MUTED, spaceAfter=2))
    styles.add(ParagraphStyle(name="AIPCCHeading", fontSize=12, leading=16, textColor=_BRAND, spaceBefore=14, spaceAfter=4))
    styles.add(ParagraphStyle(name="AIPCCBody", fontSize=9.5, leading=14, textColor=colors.HexColor("#1f2937")))
    return styles


def _format_scalar(value) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)


def _section_data_flowables(data: dict, styles) -> list:
    flowables = []
    for key, value in data.items():
        if value is None or value == "" or value == []:
            continue
        label = key.replace("_", " ").title()
        if isinstance(value, list) and value and isinstance(value[0], dict):
            columns = list(value[0].keys())
            table_data = [[c.replace("_", " ").title() for c in columns]]
            for row in value[:15]:  # cap rows so a huge dataset can't blow up the PDF page count
                table_data.append([_format_scalar(row.get(c)) for c in columns])
            flowables.append(Paragraph(f"<b>{label}</b>", styles["AIPCCBody"]))
            t = Table(table_data, hAlign="LEFT", repeatRows=1)
            t.setStyle(
                TableStyle(
                    [
                        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("BACKGROUND", (0, 0), (-1, 0), _BRAND),
                        ("GRID", (0, 0), (-1, -1), 0.5, _BORDER),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ]
                )
            )
            flowables.append(t)
            flowables.append(Spacer(1, 6))
        elif isinstance(value, list):
            flowables.append(Paragraph(f"<b>{label}:</b> {', '.join(_format_scalar(v) for v in value)}", styles["AIPCCBody"]))
        elif isinstance(value, dict):
            bits = "; ".join(f"{k} {_format_scalar(v)}" for k, v in value.items())
            flowables.append(Paragraph(f"<b>{label}:</b> {bits}", styles["AIPCCBody"]))
        else:
            flowables.append(Paragraph(f"<b>{label}:</b> {_format_scalar(value)}", styles["AIPCCBody"]))
    return flowables


def render_report_pdf(report: ReportOut) -> bytes:
    """Returns raw PDF bytes for the given already-generated report."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title=report.title,
    )
    styles = _styles()
    story: list = []

    story.append(Paragraph(report.title, styles["AIPCCTitle"]))
    scope = report.project_name if report.project_name else "Portfolio-wide"
    # Plain ASCII separators (not em-dash/middle-dot) — reportlab's base14 Helvetica renders
    # them fine, but avoiding non-ASCII punctuation sidesteps any font/encoding ambiguity in a
    # machine-generated PDF meant to be reliably readable in any viewer.
    story.append(Paragraph(f"{report.organization_name} - {scope}", styles["AIPCCSubtitle"]))
    story.append(
        Paragraph(
            f"Generated {report.generated_at.strftime('%B %d, %Y %H:%M UTC')} - "
            f"AI narrative source: {_SOURCE_LABELS.get(report.source, report.source)}",
            styles["AIPCCSubtitle"],
        )
    )
    story.append(Spacer(1, 10))

    for section in report.sections:
        story.append(Paragraph(section.heading, styles["AIPCCHeading"]))
        body = (section.body or "").replace("\n", "<br/>")
        story.append(Paragraph(body, styles["AIPCCBody"]))
        if section.data:
            story.append(Spacer(1, 4))
            story.extend(_section_data_flowables(section.data, styles))

    doc.build(story)
    return buffer.getvalue()
