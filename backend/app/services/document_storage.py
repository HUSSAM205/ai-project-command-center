"""Local-disk storage for uploaded documents — backend/uploads/ (gitignored), never a cloud
bucket, per Phase 3 scope."""

import re
import uuid
from pathlib import Path
from uuid import UUID

# backend/app/services/document_storage.py -> backend/uploads
UPLOAD_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads"

_UNSAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_filename(filename: str) -> str:
    name = Path(filename).name  # strip any path components
    name = _UNSAFE_FILENAME_RE.sub("_", name)
    return name[:200] or "upload"


def save_upload(organization_id: UUID, filename: str, data: bytes) -> str:
    """Writes `data` to backend/uploads/<org_id>/<uuid>_<safe_filename> and returns the path
    (as a string, relative to the repo) to store as Document.storage_path."""
    org_dir = UPLOAD_ROOT / str(organization_id)
    org_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4()}_{_safe_filename(filename)}"
    path = org_dir / stored_name
    path.write_bytes(data)
    return str(path)


def read_upload(storage_path: str) -> bytes:
    return Path(storage_path).read_bytes()
