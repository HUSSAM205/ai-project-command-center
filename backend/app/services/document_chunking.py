"""Splits parsed document text into overlapping ~500-character chunks for embedding.

A simple sliding window over the full text, snapped to whitespace so chunks don't split a
word in half. Overlap keeps context from being lost right at a chunk boundary (a sentence
that straddles two chunks is still fully present in at least one of them).
"""

CHUNK_SIZE = 500
CHUNK_OVERLAP = 75


def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    length = len(text)
    while start < length:
        end = min(start + chunk_size, length)
        if end < length:
            # snap end back to the last whitespace so we don't cut a word in half
            snap = text.rfind(" ", start, end)
            if snap > start:
                end = snap
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= length:
            break
        start = max(end - overlap, start + 1)  # always make forward progress
    return chunks


def chunk_pages(pages: list[str], chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[dict]:
    """For formats with real page boundaries (PDF). Returns
    [{"content": str, "page_number": int}], chunked independently per page so a chunk's
    page_number citation is always accurate."""
    out: list[dict] = []
    for page_number, page_text in enumerate(pages, start=1):
        for chunk in chunk_text(page_text, chunk_size, overlap):
            out.append({"content": chunk, "page_number": page_number})
    return out
