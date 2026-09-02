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
