"""Canonical RAG status: a single ON_TRACK/AT_RISK/CRITICAL/COMPLETED status computed from a
project's already-real status/health_score/risk_level (see app/services/health_score.py).

Exists so every surface that shows a project's status agrees on the same vocabulary regardless of
where the underlying data originated -- this deployment's own seeded data today, and, if this app
is ever pointed at Jira/Asana/Monday.com or similar, whatever status taxonomy that tool uses
tomorrow. That external-tool integration is NOT implemented in this deployment (no connector, no
credentials, no ingestion pipeline exists here) -- this function only normalizes the status this
app's own project model already produces. Building a "canonical status" for platforms that were
never actually connected would just be fabricated UI with nothing real behind it.
"""

from app.models.enums import ProjectStatus, RagStatus, RiskLevel

# Below this health score, a project is CRITICAL regardless of its explicit status/risk_level --
# matches the same "compute the real signal, don't just relabel it" discipline health_score.py
# already applies.
CRITICAL_HEALTH_THRESHOLD = 40
AT_RISK_HEALTH_THRESHOLD = 65


def compute_rag_status(status: ProjectStatus, health_score: int, risk_level: RiskLevel) -> RagStatus:
    if status in (ProjectStatus.COMPLETED, ProjectStatus.CANCELLED):
        # CANCELLED maps here too: neither of the 4 canonical values fits "closed, not a delivery
        # success" precisely, but a cancelled project is not an open RAG concern either, and
        # COMPLETED is the closer of the two ("done tracking this") than any open-status value.
        return RagStatus.COMPLETED
    if status == ProjectStatus.AT_RISK or risk_level == RiskLevel.CRITICAL or health_score < CRITICAL_HEALTH_THRESHOLD:
        return RagStatus.CRITICAL
    if status == ProjectStatus.ON_HOLD or risk_level == RiskLevel.HIGH or health_score < AT_RISK_HEALTH_THRESHOLD:
        return RagStatus.AT_RISK
    return RagStatus.ON_TRACK
