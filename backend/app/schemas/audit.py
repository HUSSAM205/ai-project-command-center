from pydantic import BaseModel
from uuid import UUID


class AuditHealthOut(BaseModel):
    """GET /api/v1/audit/health -- every field here is a real, freshly-computed value (a live
    hash-chain re-verification for chain_status, a real row count for hash_chained_records), never
    a hardcoded "green checkmark". See app/services/audit.py::verify_chain_continuity and
    app/api/audit.py for exactly what each one measures."""

    tenant_isolation_status: str
    tenant_isolation_detail: str
    transport_encryption_status: str
    transport_encryption_detail: str
    storage_encryption_status: str
    storage_encryption_detail: str
    chain_status: str
    chain_records_verified: int
    chain_total_hash_chained: int
    chain_broken_at_id: UUID | None
    chain_broken_reason: str | None
    total_audit_records: int
