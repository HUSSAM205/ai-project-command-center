"""Upload validation (MIME + magic bytes, not just file extension) and text extraction for
PDF / DOCX / TXT. Anything else — including a renamed/disguised file — is rejected with a
clear error before it ever touches the parser.
"""

from dataclasses import dataclass
from io import BytesIO

ALLOWED_EXTENSIONS = {"pdf", "docx", "txt"}
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20MB

_PDF_MAGIC = b"%PDF-"
_ZIP_MAGIC = b"PK\x03\x04"
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .doc/.xls — explicitly unsupported


class UnsupportedFileError(ValueError):
    """Raised for anything that fails MIME/magic-byte validation. Callers should turn this
    into a 415/422, never a 500 — an untrusted upload failing validation is expected input,
    not a server error."""


@dataclass
class ParsedDocument:
    file_type: str  # "pdf" | "docx" | "txt"
    text: str
    pages: list[str]  # per-page text; PDFs only — DOCX/TXT are a single "page"


def detect_file_type(filename: str, content_type: str | None, data: bytes) -> str:
    """Validates the upload by its actual bytes (magic numbers), cross-checked against the
    declared content-type/extension — never trusts the extension alone."""
    if len(data) == 0:
        raise UnsupportedFileError("uploaded file is empty")
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise UnsupportedFileError(f"file exceeds the {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB size limit")

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if data.startswith(_PDF_MAGIC):
        return "pdf"

    if data.startswith(_OLE_MAGIC):
        raise UnsupportedFileError(
            "legacy .doc/.xls binary format is not supported — please upload PDF, DOCX, or TXT"
        )

    if data.startswith(_ZIP_MAGIC):
        # A DOCX is a zip archive. Confirm it's actually a Word document (not some other
        # zip-based format, e.g. .xlsx/.pptx/.zip) by trying to open it as one.
        try:
            from docx import Document as _DocxDocument

            _DocxDocument(BytesIO(data))
        except Exception as exc:
            raise UnsupportedFileError(
                "file looks like a zip archive but is not a valid DOCX document"
            ) from exc
        return "docx"

    # No recognized binary magic number — only accept as plain text, and only if it actually
    # decodes cleanly as UTF-8 text (rejects disguised/corrupt binaries masquerading as .txt).
    try:
        data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise UnsupportedFileError(
            "unrecognized file format — only PDF, DOCX, and TXT are accepted"
        ) from exc

    if ext and ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileError(f".{ext} is not accepted — only PDF, DOCX, and TXT are supported")
    if content_type and content_type not in ("text/plain", "application/octet-stream", ""):
        # Some browsers send a generic/absent content-type for .txt; only hard-reject a
        # content-type that positively claims to be something else.
        if not content_type.startswith("text/"):
            raise UnsupportedFileError(f"declared content-type '{content_type}' does not match file content")
    return "txt"


def parse_document(filename: str, content_type: str | None, data: bytes) -> ParsedDocument:
    file_type = detect_file_type(filename, content_type, data)

    if file_type == "pdf":
        from pypdf import PdfReader

        try:
            reader = PdfReader(BytesIO(data))
            pages = [(page.extract_text() or "").strip() for page in reader.pages]
        except Exception as exc:
            raise UnsupportedFileError(f"could not parse PDF: {exc}") from exc
        text = "\n\n".join(p for p in pages if p)
        return ParsedDocument(file_type="pdf", text=text, pages=pages)

    if file_type == "docx":
        from docx import Document as DocxDocument

        try:
            doc = DocxDocument(BytesIO(data))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        except Exception as exc:
            raise UnsupportedFileError(f"could not parse DOCX: {exc}") from exc
        text = "\n".join(paragraphs)
        return ParsedDocument(file_type="docx", text=text, pages=[text])

    # txt
    text = data.decode("utf-8")
    return ParsedDocument(file_type="txt", text=text, pages=[text])
