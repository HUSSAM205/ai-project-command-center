import enum


class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MANAGER = "MANAGER"
    MEMBER = "MEMBER"
    VIEWER = "VIEWER"


class ProjectStatus(str, enum.Enum):
    PLANNING = "PLANNING"
    ACTIVE = "ACTIVE"
    ON_HOLD = "ON_HOLD"
    AT_RISK = "AT_RISK"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Priority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RiskLevel(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RagStatus(str, enum.Enum):
    """Canonical 4-value executive status, computed on read (see
    app/services/rag_status.py) -- never a DB column. Not a native Postgres enum since nothing
    ever stores one: it's a pure function of a project's already-real status/health_score/
    risk_level, the same computed-not-stored pattern this app already uses for health_score
    itself. Exists specifically so every view of a project (dashboard tile, PMO table, a future
    external-tool import) can agree on one status vocabulary instead of five different ones."""

    ON_TRACK = "ON_TRACK"
    AT_RISK = "AT_RISK"
    CRITICAL = "CRITICAL"
    COMPLETED = "COMPLETED"


class TaskStatus(str, enum.Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    REVIEW = "REVIEW"
    DONE = "DONE"


class MilestoneStatus(str, enum.Enum):
    PENDING = "PENDING"
    AT_RISK = "AT_RISK"
    COMPLETED = "COMPLETED"


class UtilizationState(str, enum.Enum):
    UNDERUTILIZED = "UNDERUTILIZED"
    OPTIMAL = "OPTIMAL"
    OVERLOADED = "OVERLOADED"


class RiskCategory(str, enum.Enum):
    SCHEDULE = "SCHEDULE"
    BUDGET = "BUDGET"
    RESOURCE = "RESOURCE"
    TECHNICAL = "TECHNICAL"
    SECURITY = "SECURITY"
    OPERATIONAL = "OPERATIONAL"
    DEPENDENCY = "DEPENDENCY"
    EXTERNAL = "EXTERNAL"


class RiskSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RiskStatus(str, enum.Enum):
    OPEN = "OPEN"
    MITIGATING = "MITIGATING"
    CLOSED = "CLOSED"


class DocumentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class RoadmapPhaseType(str, enum.Enum):
    """Fixed 5-phase order for the AI Consulting Workspace's transformation roadmap
    (Phase 4, spec §37) — see app/services/transformation_roadmap.py."""

    DISCOVERY = "DISCOVERY"
    DATA_READINESS = "DATA_READINESS"
    PILOT = "PILOT"
    IMPLEMENTATION = "IMPLEMENTATION"
    SCALE = "SCALE"


class StageGateNumber(str, enum.Enum):
    """Fixed 5-gate steering-committee sequence for app/models/pmo.py::StageGate."""

    G1 = "G1"
    G2 = "G2"
    G3 = "G3"
    G4 = "G4"
    G5 = "G5"


class StageGateStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_REVIEW = "IN_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AutomationTriggerType(str, enum.Enum):
    """The 3 standard pre-configured enterprise triggers -- see
    app/services/automation_engine.py for what each one actually checks against real, current
    data (never a fabricated condition)."""

    TASK_OVERDUE = "TASK_OVERDUE"
    BUDGET_BURNOVER = "BUDGET_BURNOVER"
    CRITICAL_RISK_SPOTTED = "CRITICAL_RISK_SPOTTED"


class AutomationActionType(str, enum.Enum):
    AUTO_CREATE_RISK = "AUTO_CREATE_RISK"
    DISPATCH_NOTIFICATION = "DISPATCH_NOTIFICATION"
    RECALCULATE_HEALTH = "RECALCULATE_HEALTH"


class AutomationOutcome(str, enum.Enum):
    """Real outcome of one rule evaluation -- FIRED only when the condition was genuinely met
    against real data and the action actually ran; CONDITION_NOT_MET is a normal, honest result
    (most evaluations), not an error."""

    FIRED = "FIRED"
    CONDITION_NOT_MET = "CONDITION_NOT_MET"
    ERROR = "ERROR"


class NotificationCategory(str, enum.Enum):
    CRITICAL = "CRITICAL"
    AI_ALERT = "AI_ALERT"
    WORKFLOW = "WORKFLOW"
