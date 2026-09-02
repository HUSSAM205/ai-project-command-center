"""Deterministic Transformation Roadmap scaffold (Phase 4 — Consulting Workspace, spec §37).

Produces the structural shape of the 5 fixed phases — order, duration, budget split, resource
roles — from the business case's own budget/timeline. No AI, no randomness. The narrative
content per phase (objectives/deliverables/KPIs/risks) is generated separately via AIRouter
(see app/ai/context.py::build_roadmap_phase_document + app/api/consulting.py), grounded in
this same real business case + opportunity data. This module only owns the transparent
scaffold numbers, mirroring the "deterministic core, AI only for narrative" split used
throughout the AI Consulting Workspace.
"""

import re
from dataclasses import dataclass
from decimal import Decimal

from app.models.enums import RoadmapPhaseType

# Fixed order + relative weight of each phase. The same weight is used to split BOTH the
# program's total duration and its total budget across phases — one transparent allocation,
# not two independently-tuned ones.
PHASE_PLAN: list[tuple[RoadmapPhaseType, float]] = [
    (RoadmapPhaseType.DISCOVERY, 0.15),
    (RoadmapPhaseType.DATA_READINESS, 0.20),
    (RoadmapPhaseType.PILOT, 0.20),
    (RoadmapPhaseType.IMPLEMENTATION, 0.30),
    (RoadmapPhaseType.SCALE, 0.15),
]

# Deterministic role suggestions per phase — a fixed lookup by phase type, not AI-generated.
PHASE_RESOURCES: dict[RoadmapPhaseType, list[str]] = {
    RoadmapPhaseType.DISCOVERY: ["Engagement Lead", "Business Analyst"],
    RoadmapPhaseType.DATA_READINESS: ["Data Engineer", "Data Architect"],
    RoadmapPhaseType.PILOT: ["Solution Architect", "ML Engineer", "QA Analyst"],
    RoadmapPhaseType.IMPLEMENTATION: ["Delivery Lead", "Software Engineer", "Change Manager"],
    RoadmapPhaseType.SCALE: ["Change Management Lead", "Support Engineer"],
}

# The business case's `timeline` field is free text (spec §35 doesn't require a parseable
# duration), so this falls back to a fixed, documented default total program length unless the
# text contains an explicit "<n> week(s)"/"<n> month(s)" figure — a simple, honest rule rather
# than a fragile natural-language date parser.
DEFAULT_TOTAL_WEEKS = 26

_WEEKS_RE = re.compile(r"(\d+)\s*week", re.IGNORECASE)
_MONTHS_RE = re.compile(r"(\d+)\s*month", re.IGNORECASE)


def _parse_total_weeks(timeline: str | None) -> int:
    if timeline:
        m = _WEEKS_RE.search(timeline)
        if m:
            return max(1, int(m.group(1)))
        m = _MONTHS_RE.search(timeline)
        if m:
            return max(1, round(int(m.group(1)) * 4.345))
    return DEFAULT_TOTAL_WEEKS


@dataclass
class PhaseScaffold:
    phase: RoadmapPhaseType
    sequence_order: int
    duration_weeks: int
    budget: Decimal
    resources: list[str]


def build_phase_scaffold(total_budget: Decimal | float, timeline: str | None) -> list[PhaseScaffold]:
    total_weeks = _parse_total_weeks(timeline)
    budget = float(total_budget or 0)
    scaffolds: list[PhaseScaffold] = []
    for i, (phase, weight) in enumerate(PHASE_PLAN, start=1):
        duration_weeks = max(1, round(total_weeks * weight))
        phase_budget = round(budget * weight, 2)
        scaffolds.append(
            PhaseScaffold(
                phase=phase,
                sequence_order=i,
                duration_weeks=duration_weeks,
                budget=Decimal(str(phase_budget)),
                resources=list(PHASE_RESOURCES[phase]),
            )
        )
    return scaffolds
