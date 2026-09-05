"""Text extraction for a file attached directly to an AI Assistant chat question
(POST /api/v1/ai/assistant) -- deliberately separate from app/services/document_parser.py's
persistent upload pipeline (documents.py): a chat attachment is transient (never written to the
`documents`/`document_chunks` tables, never chunked or embedded), scoped to the one question it
was sent with. Reuses document_parser.parse_document for PDF/DOCX text extraction rather than
duplicating that logic, and adds CSV/JSON handling (allowed here but not in the persistent
pipeline, which only needs PDF/DOCX/TXT).
"""

import csv
import json
from io import StringIO

from app.services.document_parser import UnsupportedFileError, parse_document

ALLOWED_CHAT_EXTENSIONS = {"pdf", "docx", "txt", "csv", "json"}
MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024  # 5MB -- well under the persistent pipeline's 20MB;
# this text goes straight into a single prompt, not a chunked/embedded store.
MAX_EXTRACTED_CHARS = 6000  # keeps the prompt bounded regardless of source file size


def _extract_csv_text(data: bytes) -> str:
    text = data.decode("utf-8")
    reader = csv.reader(StringIO(text))
    rows = list(reader)
    return "\n".join(", ".join(cell for cell in row) for row in rows)


def _extract_json_text(data: bytes) -> str:
    text = data.decode("utf-8")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise UnsupportedFileError(f"could not parse JSON: {exc}") from exc
    return json.dumps(parsed, indent=2)


def extract_chat_attachment_text(filename: str, content_type: str | None, data: bytes) -> dict:
    """Returns {"filename": str, "text": str} -- text truncated to MAX_EXTRACTED_CHARS. Raises
    UnsupportedFileError (same exception type document_parser.py's own validation raises, so
    callers already handle it identically) for anything unreadable or over the size cap."""
    if len(data) == 0:
        raise UnsupportedFileError("attached file is empty")
    if len(data) > MAX_CHAT_ATTACHMENT_BYTES:
        raise UnsupportedFileError(f"attachment exceeds the {MAX_CHAT_ATTACHMENT_BYTES // (1024 * 1024)}MB limit")

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "csv":
        text = _extract_csv_text(data)
    elif ext == "json":
        text = _extract_json_text(data)
    else:
        # PDF/DOCX/TXT (and anything whose real magic bytes say PDF/DOCX even if misnamed) --
        # reuse the exact same validated extraction the persistent upload pipeline uses.
        parsed = parse_document(filename, content_type, data)
        text = parsed.text

    if not text.strip():
        raise UnsupportedFileError("no extractable text was found in this file")

    truncated = text[:MAX_EXTRACTED_CHARS]
    return {"filename": filename, "text": truncated}
