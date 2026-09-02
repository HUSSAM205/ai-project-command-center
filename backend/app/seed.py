"""Seed script for the demo organization "Vertex Technologies" (is_demo=true).

Run with: python -m app.seed

Idempotent: if the demo org already exists it is deleted (FK ON DELETE CASCADE removes
every dependent row) and recreated fresh, so this script is safe to re-run.

Dataset shape follows docs/PRODUCT_REQUIREMENTS.md "Demo dataset targets" as a floor, then
substantially enriches it to enterprise/Fortune-500 scale for the Advanced PMO engines (EVM,
RACI, stage gates, contract ledger, boardroom memo — app/services/evm.py, app/models/pmo.py):
7 projects total (the original 5 plus 2 new large fictional engagements), 60+ linked tasks with
a real critical-path dependency graph (app/models/task.py::TaskDependency — previously unused),
20+ risks spread across categories/severities, 24 resources with hourly_cost varying $42-$225/hr
by role/seniority (a real blended billing matrix), and RACI/stage-gate/contract-ledger rows for
every project so the new engines always have real, internally consistent numbers to display —
never empty tables. "Vertex Technologies" is the demo org's own operating identity (a fictional
strategy/technology consulting firm); every client name below is entirely fictional — see
CLAUDE.md's "Critical constraint" for why no real company name is ever used here.

Data is constructed so computed values (health score, EVM, margin leakage) are what actually
determine which project reads as troubled, not a coincidence: Digital Transformation Program
and Global ERP Consolidation Program are both seeded with real schedule slippage / cost overrun
shaped like scope creep, so they show real margin leakage; Sovereign Cloud Data Platform and AI
Customer Intelligence run under their earned-value baseline, so they show zero leakage — a
genuine spread, not every project flagged red.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.budget import Budget, BudgetTransaction
from app.models.enums import (
    MilestoneStatus,
    Priority,
    ProjectStatus,
    RiskCategory,
    RiskStatus,
    StageGateNumber,
    StageGateStatus,
    TaskStatus,
    UserRole,
)
from app.models.milestone import Milestone
from app.models.organization import Organization
from app.models.pmo import ContractLedger, RaciEntry, StageGate
from app.models.project import Project, ProjectMember
from app.models.resource import Resource, ResourceAllocation
from app.models.risk import Risk
from app.models.task import Task, TaskDependency
from app.models.user import User

TODAY = date(2026, 9, 1)


def make_task(db, project_id, **kwargs):
    task = Task(project_id=project_id, **kwargs)
    db.add(task)
    db.flush()
    return task


def make_risk(db, project_id, **kwargs):
    risk = Risk(project_id=project_id, **kwargs)
    db.add(risk)
    return risk


def make_milestone(db, project_id, **kwargs):
    db.add(Milestone(project_id=project_id, **kwargs))


def make_allocation(db, resource_id, project_id, allocation_percent, start_date=None, end_date=None):
    db.add(
        ResourceAllocation(
            resource_id=resource_id,
            project_id=project_id,
            allocation_percent=allocation_percent,
            start_date=start_date,
            end_date=end_date,
        )
    )


def make_dependency(db, task: Task, depends_on: Task):
    db.add(TaskDependency(task_id=task.id, depends_on_task_id=depends_on.id))


def make_raci(db, project_id, task_or_deliverable, responsible=None, accountable=None, consulted=None, informed=None, notes=None):
    db.add(
        RaciEntry(
            project_id=project_id,
            task_or_deliverable=task_or_deliverable,
            responsible_id=responsible.id if responsible else None,
            accountable_id=accountable.id if accountable else None,
            consulted_id=consulted.id if consulted else None,
            informed_id=informed.id if informed else None,
            notes=notes,
        )
    )


def make_stage_gate(db, project_id, gate, name, gate_status, approver=None, signed_off_at=None, notes=None):
    db.add(
        StageGate(
            project_id=project_id,
            gate=gate,
            name=name,
            status=gate_status,
            approver=approver,
            signed_off_at=signed_off_at,
            notes=notes,
        )
    )


def make_contract_ledger(db, project_id, total_contract_value, billed_to_date, wip, currency="USD"):
    db.add(
        ContractLedger(
            project_id=project_id,
            total_contract_value=Decimal(str(total_contract_value)),
            billed_to_date=Decimal(str(billed_to_date)),
            wip=Decimal(str(wip)),
            currency=currency,
        )
    )


def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 17, 0, tzinfo=timezone.utc)


def seed() -> dict:
    Base.metadata.create_all(bind=engine)  # no-op once Alembic has run; safe belt-and-suspenders
    db = SessionLocal()
    try:
        # A plain ORM db.delete(existing) would first load Organization.users (no
        # passive_deletes=True on that relationship) and try to null out each child's
        # organization_id before deleting the parent — violating that column's NOT NULL
        # constraint, since every dependent table's real cleanup path is the DB-level ON
        # DELETE CASCADE already declared on every FK (see docs/DATABASE_SCHEMA.md). Issuing a
        # raw DELETE statement instead skips ORM relationship management entirely and lets
        # Postgres's own cascade do the (correct, already-declared) cleanup.
        existing_id = db.scalar(select(Organization.id).where(Organization.slug == "vertex-technologies"))
        if existing_id is not None:
            db.execute(delete(Organization).where(Organization.id == existing_id))
            db.commit()

        org = Organization(name="Vertex Technologies", slug="vertex-technologies", is_demo=True)
        db.add(org)
        db.flush()

        admin = User(
            organization_id=org.id,
            email="demo@vertextech.com",
            password_hash=hash_password("DemoPass123!"),
            full_name="Morgan Reyes",
            role=UserRole.ADMIN,
        )
        pm = User(
            organization_id=org.id,
            email="pm@vertextech.com",
            password_hash=hash_password("DemoPass123!"),
            full_name="Jordan Ellis",
            role=UserRole.MANAGER,
        )
        db.add_all([admin, pm])
        db.flush()

        # ---------------------------------------------------------------- resources
        resource_defs = [
            dict(name="Sarah Chen", role="Senior AI Engineer", department="Engineering",
                 skills=["Python", "Machine Learning", "NLP", "TensorFlow"], hourly_cost=95, capacity_hours_per_week=40),
            dict(name="James Rodriguez", role="Cloud Architect", department="DevOps",
                 skills=["AWS", "Kubernetes", "Terraform", "Docker"], hourly_cost=110, capacity_hours_per_week=40),
            dict(name="Priya Patel", role="Data Scientist", department="Data Science",
                 skills=["Python", "SQL", "Machine Learning", "Data Visualization"], hourly_cost=85, capacity_hours_per_week=40),
            dict(name="Michael Brown", role="Backend Engineer", department="Engineering",
                 skills=["Python", "FastAPI", "PostgreSQL", "Docker"], hourly_cost=80, capacity_hours_per_week=40),
            dict(name="Emily Davis", role="Frontend Engineer", department="Engineering",
                 skills=["React", "TypeScript", "Next.js", "Tailwind"], hourly_cost=78, capacity_hours_per_week=40),
            dict(name="David Kim", role="DevOps Engineer", department="DevOps",
                 skills=["Kubernetes", "CI/CD", "AWS", "Terraform"], hourly_cost=90, capacity_hours_per_week=40),
            dict(name="Lisa Wang", role="Product Manager", department="Product",
                 skills=["Roadmapping", "Stakeholder Management", "Agile"], hourly_cost=100, capacity_hours_per_week=40),
            dict(name="Robert Garcia", role="QA Engineer", department="QA",
                 skills=["Test Automation", "Selenium", "Python"], hourly_cost=65, capacity_hours_per_week=40),
            dict(name="Anna Kowalski", role="UX Designer", department="Design",
                 skills=["Figma", "User Research", "Prototyping"], hourly_cost=75, capacity_hours_per_week=40),
            dict(name="Thomas Mueller", role="Security Engineer", department="Security",
                 skills=["Penetration Testing", "SOC2", "IAM"], hourly_cost=105, capacity_hours_per_week=40),
            dict(name="Grace Lee", role="Data Engineer", department="Data Science",
                 skills=["Python", "Spark", "Airflow", "SQL"], hourly_cost=88, capacity_hours_per_week=40),
            dict(name="Carlos Mendez", role="Solutions Architect", department="Engineering",
                 skills=["System Design", "AWS", "Microservices"], hourly_cost=115, capacity_hours_per_week=35),
            # ---- enterprise-scale additions: wider seniority/role spread for a real blended
            # billing matrix ($42-$225/hr), and to staff the two new large engagements below.
            dict(name="Elena Voss", role="Engagement Partner", department="Consulting Leadership",
                 skills=["Executive Advisory", "Program Governance", "Change Leadership"], hourly_cost=225, capacity_hours_per_week=30),
            dict(name="Marcus Alvarez", role="Principal Consultant", department="Consulting Leadership",
                 skills=["Program Management", "Risk Management", "Stakeholder Management"], hourly_cost=175, capacity_hours_per_week=40),
            dict(name="Nadia Hussein", role="Senior Solutions Architect", department="Engineering",
                 skills=["Enterprise Architecture", "SAP", "Integration"], hourly_cost=150, capacity_hours_per_week=40),
            dict(name="Oliver Bennett", role="ERP Functional Lead", department="Engineering",
                 skills=["SAP S/4HANA", "Finance Modules", "Process Design"], hourly_cost=140, capacity_hours_per_week=40),
            dict(name="Fatima Al-Sayed", role="Data Platform Architect", department="Data Science",
                 skills=["Snowflake", "Data Governance", "Python"], hourly_cost=145, capacity_hours_per_week=40),
            dict(name="Ravi Shankar", role="Cloud Security Lead", department="Security",
                 skills=["Zero Trust", "IAM", "SOC2", "HIPAA"], hourly_cost=135, capacity_hours_per_week=40),
            dict(name="Ingrid Larsson", role="Change Management Lead", department="Product",
                 skills=["Change Management", "Training Design", "Communications"], hourly_cost=95, capacity_hours_per_week=40),
            dict(name="Kenji Watanabe", role="Integration Engineer", department="Engineering",
                 skills=["APIs", "Middleware", "MuleSoft"], hourly_cost=98, capacity_hours_per_week=40),
            dict(name="Beatrice Novak", role="QA Lead", department="QA",
                 skills=["Test Strategy", "Automation", "Compliance Testing"], hourly_cost=88, capacity_hours_per_week=40),
            dict(name="Samuel Okafor", role="Associate Consultant", department="Consulting Leadership",
                 skills=["Business Analysis", "Documentation"], hourly_cost=58, capacity_hours_per_week=40),
            dict(name="Chloe Bergstrom", role="Junior Data Analyst", department="Data Science",
                 skills=["SQL", "Data Visualization"], hourly_cost=42, capacity_hours_per_week=40),
            dict(name="Deepa Krishnan", role="Regulatory Affairs Specialist", department="Compliance",
                 skills=["GxP", "FDA Validation", "Quality Systems"], hourly_cost=120, capacity_hours_per_week=35),
        ]
        resources = {}
        for rd in resource_defs:
            r = Resource(organization_id=org.id, **{**rd, "hourly_cost": Decimal(str(rd["hourly_cost"])),
                                                      "capacity_hours_per_week": Decimal(str(rd["capacity_hours_per_week"]))})
            db.add(r)
            db.flush()
            resources[rd["name"]] = r

        # ---------------------------------------------------------------- projects (original 5)
        p1 = Project(
            organization_id=org.id, manager_id=admin.id, name="AI Customer Intelligence",
            description="Predictive customer segmentation and sentiment analysis platform for the retail division.",
            client="Meridian Retail Group", status=ProjectStatus.ACTIVE, priority=Priority.HIGH,
            start_date=date(2026, 3, 1), end_date=date(2026, 12, 1),
            budget=Decimal("500000"), actual_cost=Decimal("330000"), progress=68,
        )
        p2 = Project(
            organization_id=org.id, manager_id=pm.id, name="Digital Transformation Program",
            description="Enterprise-wide ERP replacement and business process modernization.",
            client="Northbridge Financial", status=ProjectStatus.AT_RISK, priority=Priority.CRITICAL,
            start_date=date(2026, 1, 15), end_date=date(2026, 11, 15),
            budget=Decimal("800000"), actual_cost=Decimal("700000"), progress=38,
        )
        p3 = Project(
            organization_id=org.id, manager_id=admin.id, name="Cloud Migration Initiative",
            description="Lift-and-shift plus re-architecture of on-prem workloads to a hybrid cloud model.",
            client="Vertex Technologies Internal IT", status=ProjectStatus.ON_HOLD, priority=Priority.MEDIUM,
            start_date=date(2026, 2, 1), end_date=date(2027, 2, 1),
            budget=Decimal("350000"), actual_cost=Decimal("180000"), progress=45,
        )
        p4 = Project(
            organization_id=org.id, manager_id=pm.id, name="Enterprise Automation Platform",
            description="RPA and workflow automation rollout across finance and operations.",
            client="Halcyon Manufacturing", status=ProjectStatus.PLANNING, priority=Priority.MEDIUM,
            start_date=date(2026, 8, 1), end_date=date(2027, 6, 1),
            budget=Decimal("600000"), actual_cost=Decimal("20000"), progress=5,
        )
        p5 = Project(
            organization_id=org.id, manager_id=admin.id, name="Smart Operations System",
            description="IoT-enabled predictive maintenance and real-time operations dashboard.",
            client="Ferrow Industrial", status=ProjectStatus.COMPLETED, priority=Priority.HIGH,
            start_date=date(2025, 6, 1), end_date=date(2026, 6, 1),
            budget=Decimal("450000"), actual_cost=Decimal("440000"), progress=100,
        )
        # ---------------------------------------------------------------- projects (new, enterprise-scale)
        p6 = Project(
            organization_id=org.id, manager_id=pm.id, name="Global ERP Consolidation Program",
            description=(
                "Multi-year consolidation of 14 regional ERP instances onto a single global finance and "
                "supply-chain platform, spanning North America, EMEA, and APAC business units."
            ),
            client="Solari Continental Holdings", status=ProjectStatus.ACTIVE, priority=Priority.CRITICAL,
            start_date=date(2026, 1, 5), end_date=date(2027, 4, 30),
            budget=Decimal("4200000"), actual_cost=Decimal("1850000"), progress=40,
        )
        p7 = Project(
            organization_id=org.id, manager_id=admin.id, name="Sovereign Cloud Data Platform",
            description=(
                "GxP-validated cloud data platform consolidating clinical and commercial data pipelines "
                "onto a Zero Trust landing zone with full regulatory validation."
            ),
            client="Braxton Pharmaceutical Group", status=ProjectStatus.ACTIVE, priority=Priority.HIGH,
            start_date=date(2026, 4, 1), end_date=date(2027, 1, 31),
            budget=Decimal("3600000"), actual_cost=Decimal("2100000"), progress=62,
        )
        db.add_all([p1, p2, p3, p4, p5, p6, p7])
        db.flush()

        for proj, member_id, role_label in [
            (p1, admin.id, "Program Sponsor"), (p2, pm.id, "Program Manager"),
            (p3, admin.id, "Program Sponsor"), (p4, pm.id, "Program Manager"),
            (p5, admin.id, "Program Sponsor"), (p6, pm.id, "Program Manager"),
            (p7, admin.id, "Program Sponsor"),
        ]:
            db.add(ProjectMember(project_id=proj.id, user_id=member_id, role_on_project=role_label))

        # ---------------------------------------------------------------- tasks (p1)
        p1_t1 = make_task(db, p1.id, title="Define AI model requirements", status=TaskStatus.DONE, priority=Priority.HIGH,
                           completion_percentage=100, start_date=date(2026, 3, 1), due_date=date(2026, 3, 20),
                           estimated_hours=80, actual_hours=76)
        make_task(db, p1.id, title="Collect and clean training data", status=TaskStatus.DONE, priority=Priority.HIGH,
                  completion_percentage=100, start_date=date(2026, 3, 15), due_date=date(2026, 4, 15),
                  estimated_hours=160, actual_hours=175, assignee_id=resources["Grace Lee"].id,
                  required_skills=["Python", "SQL"])
        make_task(db, p1.id, title="Build customer segmentation model", status=TaskStatus.DONE, priority=Priority.HIGH,
                  completion_percentage=100, start_date=date(2026, 4, 15), due_date=date(2026, 5, 30),
                  estimated_hours=200, actual_hours=210, assignee_id=resources["Priya Patel"].id,
                  required_skills=["Python", "Machine Learning"])
        p1_t4 = make_task(db, p1.id, title="Train sentiment analysis pipeline", status=TaskStatus.IN_PROGRESS, priority=Priority.HIGH,
                           completion_percentage=75, start_date=date(2026, 6, 1), due_date=date(2026, 8, 15),
                           estimated_hours=220, actual_hours=180, assignee_id=resources["Sarah Chen"].id,
                           required_skills=["Python", "Machine Learning", "NLP"])
        p1_t5 = make_task(db, p1.id, title="Integrate model with CRM API", status=TaskStatus.IN_PROGRESS, priority=Priority.MEDIUM,
                           completion_percentage=60, start_date=date(2026, 7, 1), due_date=date(2026, 9, 30),
                           estimated_hours=120, actual_hours=70, assignee_id=resources["Michael Brown"].id,
                           required_skills=["Python", "FastAPI"])
        make_task(db, p1.id, title="Set up model monitoring dashboard", status=TaskStatus.IN_PROGRESS, priority=Priority.MEDIUM,
                  completion_percentage=50, start_date=date(2026, 7, 15), due_date=date(2026, 10, 1),
                  estimated_hours=90, actual_hours=40, assignee_id=resources["Emily Davis"].id,
                  required_skills=["React", "TypeScript"])
        p1_t7 = make_task(db, p1.id, title="Conduct UAT with customer success team", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                           completion_percentage=0, start_date=date(2026, 10, 15), due_date=date(2026, 11, 5),
                           estimated_hours=60)
        p1_t8 = make_task(db, p1.id, title="Deploy to production", status=TaskStatus.TODO, priority=Priority.CRITICAL,
                           completion_percentage=0, start_date=date(2026, 11, 10), due_date=date(2026, 11, 25),
                           estimated_hours=40, required_skills=["AWS", "Kubernetes"])
        make_dependency(db, p1_t5, depends_on=p1_t4)
        make_dependency(db, p1_t7, depends_on=p1_t5)
        make_dependency(db, p1_t8, depends_on=p1_t7)

        # ---------------------------------------------------------------- tasks (p2)
        make_task(db, p2.id, title="Stakeholder alignment workshop", status=TaskStatus.DONE, priority=Priority.HIGH,
                  completion_percentage=100, start_date=date(2026, 1, 15), due_date=date(2026, 2, 1),
                  estimated_hours=40, actual_hours=44)
        make_task(db, p2.id, title="Legacy system audit", status=TaskStatus.DONE, priority=Priority.HIGH,
                  completion_percentage=100, start_date=date(2026, 2, 1), due_date=date(2026, 3, 1),
                  estimated_hours=120, actual_hours=140)
        make_task(db, p2.id, title="ERP vendor selection", status=TaskStatus.DONE, priority=Priority.CRITICAL,
                  completion_percentage=100, start_date=date(2026, 3, 1), due_date=date(2026, 4, 15),
                  estimated_hours=100, actual_hours=130)
        p2_t4 = make_task(db, p2.id, title="Data migration mapping", status=TaskStatus.BLOCKED, priority=Priority.CRITICAL,
                           completion_percentage=30, start_date=date(2026, 5, 1), due_date=date(2026, 7, 1),
                           estimated_hours=180, actual_hours=90, assignee_id=resources["Priya Patel"].id,
                           required_skills=["SQL", "Python"])
        p2_t5 = make_task(db, p2.id, title="Security compliance review", status=TaskStatus.BLOCKED, priority=Priority.HIGH,
                           completion_percentage=20, start_date=date(2026, 6, 1), due_date=date(2026, 8, 1),
                           estimated_hours=100, actual_hours=35, assignee_id=resources["Thomas Mueller"].id,
                           required_skills=["SOC2", "IAM"])
        p2_t6 = make_task(db, p2.id, title="Employee training program design", status=TaskStatus.BLOCKED, priority=Priority.MEDIUM,
                           completion_percentage=10, start_date=date(2026, 7, 1), due_date=date(2026, 9, 15),
                           estimated_hours=80, actual_hours=15)
        p2_t7 = make_task(db, p2.id, title="Change management rollout", status=TaskStatus.IN_PROGRESS, priority=Priority.HIGH,
                           completion_percentage=25, start_date=date(2026, 7, 15), due_date=date(2026, 10, 1),
                           estimated_hours=140, actual_hours=45, assignee_id=resources["David Kim"].id)
        p2_t8 = make_task(db, p2.id, title="Integration testing", status=TaskStatus.TODO, priority=Priority.CRITICAL,
                           completion_percentage=0, start_date=date(2026, 9, 15), due_date=date(2026, 11, 1),
                           estimated_hours=160)
        make_dependency(db, p2_t8, depends_on=p2_t4)
        make_dependency(db, p2_t8, depends_on=p2_t5)
        make_dependency(db, p2_t7, depends_on=p2_t6)

        # ---------------------------------------------------------------- tasks (p3)
        make_task(db, p3.id, title="Cloud readiness assessment", status=TaskStatus.DONE, priority=Priority.MEDIUM,
                  completion_percentage=100, start_date=date(2026, 2, 1), due_date=date(2026, 2, 28),
                  estimated_hours=60, actual_hours=58)
        make_task(db, p3.id, title="Cost-benefit analysis", status=TaskStatus.DONE, priority=Priority.MEDIUM,
                  completion_percentage=100, start_date=date(2026, 3, 1), due_date=date(2026, 3, 20),
                  estimated_hours=50, actual_hours=52)
        make_task(db, p3.id, title="Migration architecture design", status=TaskStatus.DONE, priority=Priority.HIGH,
                  completion_percentage=100, start_date=date(2026, 3, 15), due_date=date(2026, 4, 30),
                  estimated_hours=140, actual_hours=150, assignee_id=resources["Carlos Mendez"].id,
                  required_skills=["System Design", "AWS"])
        make_task(db, p3.id, title="Pilot workload migration", status=TaskStatus.REVIEW, priority=Priority.HIGH,
                  completion_percentage=90, start_date=date(2026, 5, 1), due_date=date(2026, 7, 1),
                  estimated_hours=160, actual_hours=150, assignee_id=resources["James Rodriguez"].id,
                  required_skills=["AWS", "Kubernetes"])
        make_task(db, p3.id, title="Network security redesign", status=TaskStatus.IN_PROGRESS, priority=Priority.HIGH,
                  completion_percentage=40, start_date=date(2026, 6, 15), due_date=date(2026, 9, 30),
                  estimated_hours=120, actual_hours=45)
        p3_t6 = make_task(db, p3.id, title="Database migration scripts", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                           completion_percentage=0, start_date=date(2026, 10, 1), due_date=date(2026, 12, 1),
                           estimated_hours=100)
        p3_t7 = make_task(db, p3.id, title="DR/backup strategy", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                           completion_percentage=0, start_date=date(2026, 11, 1), due_date=date(2027, 1, 1),
                           estimated_hours=70)
        make_dependency(db, p3_t7, depends_on=p3_t6)

        # ---------------------------------------------------------------- tasks (p4)
        make_task(db, p4.id, title="Process discovery workshops", status=TaskStatus.IN_PROGRESS, priority=Priority.MEDIUM,
                  completion_percentage=40, start_date=date(2026, 8, 1), due_date=date(2026, 9, 15),
                  estimated_hours=60, actual_hours=25, assignee_id=resources["Lisa Wang"].id)
        make_task(db, p4.id, title="RPA tool evaluation", status=TaskStatus.IN_PROGRESS, priority=Priority.MEDIUM,
                  completion_percentage=30, start_date=date(2026, 8, 5), due_date=date(2026, 9, 20),
                  estimated_hours=50, actual_hours=15)
        make_task(db, p4.id, title="Automation roadmap draft", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                  completion_percentage=0, start_date=date(2026, 9, 20), due_date=date(2026, 10, 15),
                  estimated_hours=40)
        make_task(db, p4.id, title="Pilot process selection", status=TaskStatus.TODO, priority=Priority.LOW,
                  completion_percentage=0, start_date=date(2026, 10, 1), due_date=date(2026, 10, 20),
                  estimated_hours=30)
        make_task(db, p4.id, title="Governance framework design", status=TaskStatus.TODO, priority=Priority.LOW,
                  completion_percentage=0, start_date=date(2026, 10, 15), due_date=date(2026, 11, 10),
                  estimated_hours=45)
        make_task(db, p4.id, title="Budget & staffing plan", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                  completion_percentage=0, start_date=date(2026, 9, 1), due_date=date(2026, 9, 25),
                  estimated_hours=25, assignee_id=resources["Anna Kowalski"].id)

        # ---------------------------------------------------------------- tasks (p5)
        for title, hrs in [
            ("Requirements gathering", 60), ("IoT sensor integration", 220),
            ("Real-time dashboard build", 180), ("Predictive maintenance model", 200),
            ("Field pilot testing", 120), ("Operator training", 50), ("Go-live & handover", 40),
        ]:
            make_task(db, p5.id, title=title, status=TaskStatus.DONE, priority=Priority.HIGH,
                      completion_percentage=100, start_date=date(2025, 6, 1), due_date=date(2026, 5, 15),
                      estimated_hours=hrs, actual_hours=hrs + 5)

        # ---------------------------------------------------------------- tasks (p6) — Global ERP
        # Consolidation Program: a real critical-path dependency graph, 14 tasks.
        p6_t1 = make_task(db, p6.id, title="Program charter & governance setup", status=TaskStatus.DONE,
                           priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 1, 5),
                           due_date=date(2026, 1, 20), estimated_hours=120, actual_hours=128,
                           assignee_id=resources["Elena Voss"].id)
        p6_t2 = make_task(db, p6.id, title="Current-state ERP landscape assessment", status=TaskStatus.DONE,
                           priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 1, 21),
                           due_date=date(2026, 3, 15), estimated_hours=300, actual_hours=310,
                           assignee_id=resources["Marcus Alvarez"].id, required_skills=["Program Management"])
        p6_t3 = make_task(db, p6.id, title="Target architecture & platform selection", status=TaskStatus.DONE,
                           priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 3, 16),
                           due_date=date(2026, 4, 10), estimated_hours=260, actual_hours=290,
                           assignee_id=resources["Nadia Hussein"].id, required_skills=["Enterprise Architecture", "SAP"])
        p6_t4 = make_task(db, p6.id, title="Finance module design & configuration", status=TaskStatus.IN_PROGRESS,
                           priority=Priority.HIGH, completion_percentage=70, start_date=date(2026, 4, 11),
                           due_date=date(2026, 8, 30), estimated_hours=400, actual_hours=300,
                           assignee_id=resources["Oliver Bennett"].id, required_skills=["SAP S/4HANA", "Finance Modules"])
        p6_t5 = make_task(db, p6.id, title="Supply chain module design & configuration", status=TaskStatus.IN_PROGRESS,
                           priority=Priority.HIGH, completion_percentage=55, start_date=date(2026, 4, 11),
                           due_date=date(2026, 9, 15), estimated_hours=420, actual_hours=260,
                           assignee_id=resources["Nadia Hussein"].id, required_skills=["Enterprise Architecture"])
        p6_t6 = make_task(db, p6.id, title="Legacy data extraction & cleansing", status=TaskStatus.IN_PROGRESS,
                           priority=Priority.CRITICAL, completion_percentage=60, start_date=date(2026, 4, 11),
                           due_date=date(2026, 8, 1), estimated_hours=350, actual_hours=230,
                           assignee_id=resources["Fatima Al-Sayed"].id, required_skills=["Data Governance", "Python"])
        p6_t7 = make_task(db, p6.id, title="Data migration mapping & rules", status=TaskStatus.BLOCKED,
                           priority=Priority.CRITICAL, completion_percentage=25, start_date=date(2026, 7, 15),
                           due_date=date(2026, 10, 1), estimated_hours=300, actual_hours=90,
                           assignee_id=resources["Samuel Okafor"].id, required_skills=["Business Analysis"])
        p6_t8 = make_task(db, p6.id, title="Integration middleware build", status=TaskStatus.TODO,
                           priority=Priority.HIGH, completion_percentage=0, start_date=date(2026, 9, 1),
                           due_date=date(2026, 12, 15), estimated_hours=280,
                           assignee_id=resources["Kenji Watanabe"].id, required_skills=["Middleware", "APIs"])
        p6_t9 = make_task(db, p6.id, title="Regulatory & compliance validation", status=TaskStatus.TODO,
                           priority=Priority.HIGH, completion_percentage=0, start_date=date(2026, 9, 1),
                           due_date=date(2026, 11, 15), estimated_hours=150,
                           assignee_id=resources["Deepa Krishnan"].id, required_skills=["GxP", "Quality Systems"])
        p6_t10 = make_task(db, p6.id, title="User acceptance testing", status=TaskStatus.TODO,
                            priority=Priority.HIGH, completion_percentage=0, start_date=date(2026, 12, 16),
                            due_date=date(2027, 2, 10), estimated_hours=220,
                            assignee_id=resources["Beatrice Novak"].id, required_skills=["Test Strategy"])
        p6_t11 = make_task(db, p6.id, title="Cutover rehearsal", status=TaskStatus.TODO,
                            priority=Priority.CRITICAL, completion_percentage=0, start_date=date(2027, 2, 11),
                            due_date=date(2027, 3, 5), estimated_hours=100)
        p6_t12 = make_task(db, p6.id, title="Change management & training rollout", status=TaskStatus.IN_PROGRESS,
                            priority=Priority.MEDIUM, completion_percentage=30, start_date=date(2026, 4, 11),
                            due_date=date(2027, 3, 20), estimated_hours=260, actual_hours=70,
                            assignee_id=resources["Ingrid Larsson"].id, required_skills=["Change Management"])
        p6_t13 = make_task(db, p6.id, title="Go-live cutover", status=TaskStatus.TODO,
                            priority=Priority.CRITICAL, completion_percentage=0, start_date=date(2027, 3, 21),
                            due_date=date(2027, 4, 5), estimated_hours=80)
        p6_t14 = make_task(db, p6.id, title="Hypercare & stabilization", status=TaskStatus.TODO,
                            priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 4, 6),
                            due_date=date(2027, 4, 30), estimated_hours=160)
        make_dependency(db, p6_t2, depends_on=p6_t1)
        make_dependency(db, p6_t3, depends_on=p6_t2)
        make_dependency(db, p6_t4, depends_on=p6_t3)
        make_dependency(db, p6_t5, depends_on=p6_t3)
        make_dependency(db, p6_t6, depends_on=p6_t3)
        make_dependency(db, p6_t7, depends_on=p6_t6)
        make_dependency(db, p6_t8, depends_on=p6_t4)
        make_dependency(db, p6_t8, depends_on=p6_t5)
        make_dependency(db, p6_t9, depends_on=p6_t4)
        make_dependency(db, p6_t10, depends_on=p6_t7)
        make_dependency(db, p6_t10, depends_on=p6_t8)
        make_dependency(db, p6_t11, depends_on=p6_t10)
        make_dependency(db, p6_t12, depends_on=p6_t3)
        make_dependency(db, p6_t13, depends_on=p6_t11)
        make_dependency(db, p6_t13, depends_on=p6_t12)
        make_dependency(db, p6_t14, depends_on=p6_t13)

        # ---------------------------------------------------------------- tasks (p7) — Sovereign
        # Cloud Data Platform: a second real critical-path dependency graph, 12 tasks.
        p7_t1 = make_task(db, p7.id, title="Data platform strategy & vendor selection", status=TaskStatus.DONE,
                           priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 4, 1),
                           due_date=date(2026, 4, 20), estimated_hours=150, actual_hours=145,
                           assignee_id=resources["Marcus Alvarez"].id)
        p7_t2 = make_task(db, p7.id, title="Landing zone & network architecture", status=TaskStatus.DONE,
                           priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 4, 21),
                           due_date=date(2026, 5, 25), estimated_hours=220, actual_hours=235,
                           assignee_id=resources["Nadia Hussein"].id, required_skills=["Enterprise Architecture"])
        p7_t3 = make_task(db, p7.id, title="Identity & access (Zero Trust) design", status=TaskStatus.DONE,
                           priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 5, 26),
                           due_date=date(2026, 6, 20), estimated_hours=180, actual_hours=175,
                           assignee_id=resources["Ravi Shankar"].id, required_skills=["Zero Trust", "IAM"])
        p7_t4 = make_task(db, p7.id, title="GxP validation framework setup", status=TaskStatus.DONE,
                           priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 4, 21),
                           due_date=date(2026, 6, 30), estimated_hours=200, actual_hours=240,
                           assignee_id=resources["Deepa Krishnan"].id, required_skills=["GxP", "FDA Validation"])
        p7_t5 = make_task(db, p7.id, title="Core data lake build", status=TaskStatus.DONE,
                           priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 5, 26),
                           due_date=date(2026, 8, 15), estimated_hours=300, actual_hours=280,
                           assignee_id=resources["Fatima Al-Sayed"].id, required_skills=["Snowflake"])
        p7_t6 = make_task(db, p7.id, title="Data governance & lineage tooling", status=TaskStatus.IN_PROGRESS,
                           priority=Priority.MEDIUM, completion_percentage=70, start_date=date(2026, 8, 16),
                           due_date=date(2026, 10, 31), estimated_hours=240, actual_hours=190,
                           assignee_id=resources["Fatima Al-Sayed"].id, required_skills=["Data Governance"])
        p7_t7 = make_task(db, p7.id, title="Clinical data pipeline migration", status=TaskStatus.IN_PROGRESS,
                           priority=Priority.HIGH, completion_percentage=65, start_date=date(2026, 8, 16),
                           due_date=date(2026, 11, 15), estimated_hours=320, actual_hours=260,
                           assignee_id=resources["Grace Lee"].id, required_skills=["Python", "Spark"])
        p7_t8 = make_task(db, p7.id, title="Commercial data pipeline migration", status=TaskStatus.IN_PROGRESS,
                           priority=Priority.MEDIUM, completion_percentage=55, start_date=date(2026, 8, 16),
                           due_date=date(2026, 11, 15), estimated_hours=300, actual_hours=200,
                           assignee_id=resources["Priya Patel"].id, required_skills=["Python", "SQL"])
        p7_t9 = make_task(db, p7.id, title="Validation & GxP qualification testing", status=TaskStatus.BLOCKED,
                           priority=Priority.CRITICAL, completion_percentage=20, start_date=date(2026, 11, 1),
                           due_date=date(2026, 12, 20), estimated_hours=260, actual_hours=60,
                           assignee_id=resources["Beatrice Novak"].id, required_skills=["Compliance Testing"])
        p7_t10 = make_task(db, p7.id, title="Security penetration test & remediation", status=TaskStatus.TODO,
                            priority=Priority.HIGH, completion_percentage=0, start_date=date(2026, 11, 1),
                            due_date=date(2026, 12, 5), estimated_hours=140,
                            assignee_id=resources["Ravi Shankar"].id, required_skills=["Zero Trust"])
        p7_t11 = make_task(db, p7.id, title="Production cutover & decommission legacy", status=TaskStatus.TODO,
                            priority=Priority.CRITICAL, completion_percentage=0, start_date=date(2026, 12, 21),
                            due_date=date(2027, 1, 20), estimated_hours=120)
        p7_t12 = make_task(db, p7.id, title="Post-launch hypercare", status=TaskStatus.TODO,
                            priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 1, 21),
                            due_date=date(2027, 1, 31), estimated_hours=90)
        make_dependency(db, p7_t2, depends_on=p7_t1)
        make_dependency(db, p7_t3, depends_on=p7_t2)
        make_dependency(db, p7_t4, depends_on=p7_t1)
        make_dependency(db, p7_t5, depends_on=p7_t2)
        make_dependency(db, p7_t6, depends_on=p7_t5)
        make_dependency(db, p7_t7, depends_on=p7_t5)
        make_dependency(db, p7_t8, depends_on=p7_t5)
        make_dependency(db, p7_t9, depends_on=p7_t6)
        make_dependency(db, p7_t9, depends_on=p7_t7)
        make_dependency(db, p7_t9, depends_on=p7_t4)
        make_dependency(db, p7_t10, depends_on=p7_t3)
        make_dependency(db, p7_t11, depends_on=p7_t9)
        make_dependency(db, p7_t11, depends_on=p7_t10)
        make_dependency(db, p7_t12, depends_on=p7_t11)

        # ---------------------------------------------------------------- risks (p1, p2, p3, p4, p5 — original)
        make_risk(db, p1.id, title="Model accuracy below target for edge cases",
                  description="Sentiment model underperforms on non-English customer messages.",
                  category=RiskCategory.TECHNICAL, probability=3, impact=3,
                  owner="Sarah Chen", mitigation="Expand multilingual training set.", status=RiskStatus.OPEN)
        make_risk(db, p1.id, title="Key ML engineer bandwidth constrained",
                  description="Sarah Chen is split across two initiatives during Q4.",
                  category=RiskCategory.RESOURCE, probability=2, impact=2,
                  owner="Morgan Reyes", mitigation="Bring in contractor support for monitoring work.",
                  status=RiskStatus.MITIGATING)

        make_risk(db, p2.id, title="ERP licensing costs exceeding estimates",
                  description="Vendor renegotiation pushed per-seat licensing 20% over budget.",
                  category=RiskCategory.BUDGET, probability=5, impact=4,
                  owner="Jordan Ellis", mitigation="Renegotiate tiered pricing; explore module de-scoping.",
                  status=RiskStatus.OPEN)
        make_risk(db, p2.id, title="Data migration behind schedule risking go-live",
                  description="Legacy data mapping has repeatedly slipped, threatening the November cutover.",
                  category=RiskCategory.SCHEDULE, probability=4, impact=4,
                  owner="Priya Patel", mitigation="Add dedicated migration squad; phase the cutover.",
                  status=RiskStatus.OPEN)
        make_risk(db, p2.id, title="Overallocated security & infrastructure staff",
                  description="Thomas Mueller and David Kim are both over capacity across concurrent projects.",
                  category=RiskCategory.RESOURCE, probability=4, impact=3,
                  owner="Jordan Ellis", mitigation="Backfill with contract DevOps support.", status=RiskStatus.OPEN)
        make_risk(db, p2.id, title="Vendor deliverable delays blocking testing",
                  description="Third-party integration adapters are consistently late.",
                  category=RiskCategory.DEPENDENCY, probability=3, impact=3,
                  owner="Jordan Ellis", mitigation="Escalate to vendor account team; add contract penalties.",
                  status=RiskStatus.MITIGATING)

        make_risk(db, p3.id, title="Network latency concerns for hybrid setup",
                  description="Cross-region latency may affect real-time workloads post-migration.",
                  category=RiskCategory.TECHNICAL, probability=3, impact=3,
                  owner="James Rodriguez", mitigation="Pilot with latency-sensitive workload first.",
                  status=RiskStatus.OPEN)
        make_risk(db, p3.id, title="Cloud provider pricing changes",
                  description="Announced pricing tier changes could affect the cost-benefit case.",
                  category=RiskCategory.EXTERNAL, probability=2, impact=3,
                  owner="Carlos Mendez", mitigation="Lock in reserved-instance pricing early.",
                  status=RiskStatus.OPEN)

        make_risk(db, p4.id, title="Process documentation incomplete",
                  description="Several finance workflows lack up-to-date SOPs needed for automation scoping.",
                  category=RiskCategory.OPERATIONAL, probability=2, impact=2,
                  owner="Lisa Wang", mitigation="Run targeted SOP capture sessions.", status=RiskStatus.OPEN)
        make_risk(db, p4.id, title="RPA specialist hiring delayed",
                  description="Open req for an automation engineer has been unfilled for 6 weeks.",
                  category=RiskCategory.RESOURCE, probability=3, impact=2,
                  owner="Jordan Ellis", mitigation="Engage staffing agency; consider contractor.",
                  status=RiskStatus.MITIGATING)

        make_risk(db, p5.id, title="Initial IoT device firmware vulnerability",
                  description="Pen test found a firmware flaw in the sensor gateway, patched before rollout.",
                  category=RiskCategory.SECURITY, probability=1, impact=3,
                  owner="Thomas Mueller", mitigation="Firmware patched and re-tested.", status=RiskStatus.CLOSED)
        make_risk(db, p5.id, title="Sensor calibration drift in pilot",
                  description="Early pilot sensors drifted out of calibration after 30 days.",
                  category=RiskCategory.OPERATIONAL, probability=2, impact=2,
                  owner="Grace Lee", mitigation="Added automated recalibration schedule.", status=RiskStatus.CLOSED)

        # ---------------------------------------------------------------- risks (p6, p7 — new, deepen the multi-tier register)
        make_risk(db, p6.id, title="Legacy data quality worse than initial assessment",
                  description="Source-system profiling found materially higher duplicate/orphan record rates than scoped.",
                  category=RiskCategory.TECHNICAL, probability=4, impact=4,
                  owner="Fatima Al-Sayed", mitigation="Expand cleansing squad; extend data-quality gate before migration.",
                  status=RiskStatus.OPEN)
        make_risk(db, p6.id, title="Regional finance teams resisting standardized chart of accounts",
                  description="EMEA finance leads are pushing back on the global standard COA design.",
                  category=RiskCategory.OPERATIONAL, probability=3, impact=3,
                  owner="Ingrid Larsson", mitigation="Run regional change-impact workshops; escalate to sponsors.",
                  status=RiskStatus.MITIGATING)
        make_risk(db, p6.id, title="Regulatory sign-off delays in EU entities",
                  description="Works-council consultation requirements are extending the compliance review timeline.",
                  category=RiskCategory.EXTERNAL, probability=3, impact=4,
                  owner="Deepa Krishnan", mitigation="Engage EU works councils early; build schedule buffer.",
                  status=RiskStatus.OPEN)
        make_risk(db, p6.id, title="Integration middleware vendor capacity constrained",
                  description="Selected middleware vendor has flagged limited implementation bandwidth this quarter.",
                  category=RiskCategory.DEPENDENCY, probability=4, impact=3,
                  owner="Kenji Watanabe", mitigation="Secure dedicated vendor capacity in the statement of work.",
                  status=RiskStatus.OPEN)
        make_risk(db, p6.id, title="Budget contingency erosion from extended data cleansing",
                  description="Cleansing rework is consuming contingency faster than the program plan assumed.",
                  category=RiskCategory.BUDGET, probability=4, impact=4,
                  owner="Jordan Ellis", mitigation="Reforecast EAC monthly; escalate de-scoping options to steering committee.",
                  status=RiskStatus.OPEN)
        make_risk(db, p6.id, title="Key finance SME attrition risk",
                  description="Two regional finance SMEs critical to configuration sign-off are flight risks.",
                  category=RiskCategory.RESOURCE, probability=2, impact=4,
                  owner="Oliver Bennett", mitigation="Retention conversations underway; cross-train backups.",
                  status=RiskStatus.MITIGATING)

        make_risk(db, p7.id, title="Validation backlog risks GxP compliance timeline",
                  description="Qualification testing backlog has grown faster than the validation team can clear it.",
                  category=RiskCategory.TECHNICAL, probability=4, impact=5,
                  owner="Deepa Krishnan", mitigation="Add a second validation pod; prioritize by regulatory criticality.",
                  status=RiskStatus.OPEN)
        make_risk(db, p7.id, title="Clinical data pipeline throughput below target",
                  description="Current pipeline throughput is ~30% below the target needed for the November cutover.",
                  category=RiskCategory.TECHNICAL, probability=3, impact=4,
                  owner="Grace Lee", mitigation="Profile and optimize the slowest transform stages; add compute.",
                  status=RiskStatus.OPEN)
        make_risk(db, p7.id, title="Third-party cloud vendor SOC2 renewal pending",
                  description="A subprocessor's SOC2 Type II renewal is delayed, affecting the vendor risk assessment.",
                  category=RiskCategory.SECURITY, probability=2, impact=4,
                  owner="Ravi Shankar", mitigation="Obtain bridge letter; track renewal weekly.", status=RiskStatus.MITIGATING)
        make_risk(db, p7.id, title="Commercial data steward turnover",
                  description="The commercial-side data steward role has turned over twice this year.",
                  category=RiskCategory.RESOURCE, probability=3, impact=3,
                  owner="Priya Patel", mitigation="Document stewardship runbook; recruit a permanent backfill.",
                  status=RiskStatus.OPEN)
        make_risk(db, p7.id, title="Budget contingency tightening from validation rework",
                  description="Repeated validation test cycles are consuming the program's cost contingency.",
                  category=RiskCategory.BUDGET, probability=3, impact=3,
                  owner="Morgan Reyes", mitigation="Reforecast EAC; tighten test-cycle change control.",
                  status=RiskStatus.MITIGATING)

        # ---------------------------------------------------------------- milestones
        make_milestone(db, p1.id, name="Data Pipeline Ready", description="Training data pipeline validated end-to-end.",
                        due_date=date(2026, 5, 1), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p1.id, name="Production Launch", description="Model live in production CRM.",
                        due_date=date(2026, 11, 25), status=MilestoneStatus.PENDING)

        make_milestone(db, p2.id, name="ERP Vendor Signed", description="Contract executed with selected ERP vendor.",
                        due_date=date(2026, 4, 15), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p2.id, name="Go-Live", description="New ERP system live for all business units.",
                        due_date=date(2026, 11, 15), status=MilestoneStatus.AT_RISK)

        make_milestone(db, p3.id, name="Migration Architecture Approved", description="Hybrid cloud architecture signed off.",
                        due_date=date(2026, 4, 30), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p3.id, name="Full Cutover", description="All workloads migrated off legacy data center.",
                        due_date=date(2027, 1, 15), status=MilestoneStatus.PENDING)

        make_milestone(db, p4.id, name="Roadmap Finalized", description="Automation roadmap approved by steering committee.",
                        due_date=date(2026, 10, 15), status=MilestoneStatus.PENDING)

        make_milestone(db, p5.id, name="System Handover", description="Operations team fully onboarded onto the new system.",
                        due_date=date(2026, 6, 1), status=MilestoneStatus.COMPLETED)

        make_milestone(db, p6.id, name="Architecture Approved", description="Target global ERP architecture and platform selection signed off.",
                        due_date=date(2026, 4, 10), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p6.id, name="Finance & Supply Chain Config Complete", description="Both core modules configured and unit-tested.",
                        due_date=date(2026, 11, 15), status=MilestoneStatus.AT_RISK)
        make_milestone(db, p6.id, name="Global Go-Live", description="All 14 regional ERP instances cut over to the consolidated platform.",
                        due_date=date(2027, 4, 5), status=MilestoneStatus.PENDING)

        make_milestone(db, p7.id, name="Landing Zone Live", description="Zero Trust landing zone and network architecture in production.",
                        due_date=date(2026, 6, 15), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p7.id, name="Data Lake GA", description="Core data lake generally available to pipeline teams.",
                        due_date=date(2026, 8, 30), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p7.id, name="GxP Validation Sign-off", description="Qualification testing complete and validation package signed.",
                        due_date=date(2026, 12, 1), status=MilestoneStatus.AT_RISK)
        make_milestone(db, p7.id, name="Production Cutover", description="Legacy pipelines decommissioned; platform is system of record.",
                        due_date=date(2027, 1, 20), status=MilestoneStatus.PENDING)

        # ---------------------------------------------------------------- budgets + transactions
        budget_plans = [
            (p1, [("Cloud compute (training)", 85000, "Infrastructure", date(2026, 4, 1)),
                  ("ML engineering contractor", 120000, "Labor", date(2026, 6, 1)),
                  ("CRM integration licensing", 45000, "Software", date(2026, 7, 15)),
                  ("Data labeling vendor", 80000, "Vendor", date(2026, 5, 10))]),
            (p2, [("ERP software licenses", 260000, "Software", date(2026, 4, 20)),
                  ("Systems integrator fees", 300000, "Vendor", date(2026, 6, 1)),
                  ("Change management consultants", 90000, "Labor", date(2026, 7, 20)),
                  ("Security compliance audit", 50000, "Vendor", date(2026, 8, 1))]),
            (p3, [("Cloud migration tooling", 40000, "Software", date(2026, 3, 15)),
                  ("Solutions architect contract", 90000, "Labor", date(2026, 4, 15)),
                  ("Pilot environment hosting", 50000, "Infrastructure", date(2026, 6, 1))]),
            (p4, [("RPA platform license", 15000, "Software", date(2026, 8, 10)),
                  ("Process discovery workshops", 5000, "Labor", date(2026, 8, 20))]),
            (p5, [("IoT hardware & sensors", 180000, "Infrastructure", date(2025, 7, 1)),
                  ("Field engineering labor", 200000, "Labor", date(2025, 12, 1)),
                  ("Dashboard software licensing", 60000, "Software", date(2026, 2, 1))]),
            (p6, [("SAP/ERP platform licensing", 650000, "Software", date(2026, 3, 1)),
                  ("Systems integrator program team", 850000, "Labor", date(2026, 6, 1)),
                  ("Data migration tooling", 120000, "Software", date(2026, 7, 1)),
                  ("Change management & training vendor", 130000, "Labor", date(2026, 8, 1)),
                  ("Regulatory & compliance advisory", 100000, "Vendor", date(2026, 8, 15))]),
            (p7, [("Cloud infrastructure (landing zone + data lake)", 550000, "Infrastructure", date(2026, 4, 15)),
                  ("Systems integrator & data engineering", 900000, "Labor", date(2026, 7, 1)),
                  ("GxP validation & QA vendor", 350000, "Vendor", date(2026, 8, 1)),
                  ("Security & IAM tooling", 180000, "Software", date(2026, 6, 1)),
                  ("Data governance platform license", 120000, "Software", date(2026, 8, 15))]),
        ]
        for proj, transactions in budget_plans:
            db.add(Budget(project_id=proj.id, initial_budget=proj.budget, currency="USD"))
            for description, amount, category, tx_date in transactions:
                db.add(BudgetTransaction(project_id=proj.id, description=description,
                                          amount=Decimal(str(amount)), category=category, date=tx_date))

        # ---------------------------------------------------------------- contract ledger (all 7 projects)
        # See app/services/contract_ledger.py for the margin_leakage_pct / scope_creep_flag
        # formulas. p2 and p6 are seeded with real cost-vs-earned-value overrun (scope-creep
        # shaped); p1/p4/p5/p7 run at or under their earned-value baseline (no leakage) — a
        # genuine spread, not every project flagged red.
        make_contract_ledger(db, p1.id, total_contract_value=650000, billed_to_date=310000, wip=40000)
        make_contract_ledger(db, p2.id, total_contract_value=1150000, billed_to_date=420000, wip=95000)
        make_contract_ledger(db, p3.id, total_contract_value=430000, billed_to_date=165000, wip=20000)
        make_contract_ledger(db, p4.id, total_contract_value=760000, billed_to_date=10000, wip=5000)
        make_contract_ledger(db, p5.id, total_contract_value=560000, billed_to_date=560000, wip=0)
        make_contract_ledger(db, p6.id, total_contract_value=5100000, billed_to_date=1600000, wip=180000)
        make_contract_ledger(db, p7.id, total_contract_value=4450000, billed_to_date=2300000, wip=140000)

        # ---------------------------------------------------------------- stage gates (all 7 projects)
        make_stage_gate(db, p1.id, StageGateNumber.G1, "Discovery & Requirements", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2026, 3, 20)))
        make_stage_gate(db, p1.id, StageGateNumber.G2, "Data & Model Design", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2026, 5, 30)))
        make_stage_gate(db, p1.id, StageGateNumber.G3, "Build & Integration", StageGateStatus.IN_REVIEW,
                         notes="Sentiment pipeline and CRM integration in progress; targeting review in October.")
        make_stage_gate(db, p1.id, StageGateNumber.G4, "UAT & Launch Readiness", StageGateStatus.PENDING)
        make_stage_gate(db, p1.id, StageGateNumber.G5, "Production Launch", StageGateStatus.PENDING)

        make_stage_gate(db, p2.id, StageGateNumber.G1, "Vendor & Scope Approval", StageGateStatus.APPROVED,
                         approver="Jordan Ellis", signed_off_at=_dt(date(2026, 2, 1)))
        make_stage_gate(db, p2.id, StageGateNumber.G2, "Architecture & Data Mapping", StageGateStatus.APPROVED,
                         approver="Jordan Ellis", signed_off_at=_dt(date(2026, 4, 15)))
        make_stage_gate(db, p2.id, StageGateNumber.G3, "Build & Migration Readiness", StageGateStatus.REJECTED,
                         approver="Northbridge Financial Steering Committee",
                         notes="Rejected: data migration and security compliance not ready. Remediation plan requested before re-review.")
        make_stage_gate(db, p2.id, StageGateNumber.G4, "Integration & Cutover Readiness", StageGateStatus.PENDING)
        make_stage_gate(db, p2.id, StageGateNumber.G5, "Go-Live", StageGateStatus.PENDING)

        make_stage_gate(db, p3.id, StageGateNumber.G1, "Readiness & Business Case", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2026, 3, 20)))
        make_stage_gate(db, p3.id, StageGateNumber.G2, "Migration Architecture", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2026, 4, 30)))
        make_stage_gate(db, p3.id, StageGateNumber.G3, "Pilot Migration", StageGateStatus.IN_REVIEW,
                         notes="Program on hold pending internal IT budget reprioritization.")
        make_stage_gate(db, p3.id, StageGateNumber.G4, "Full Migration Readiness", StageGateStatus.PENDING)
        make_stage_gate(db, p3.id, StageGateNumber.G5, "Full Cutover", StageGateStatus.PENDING)

        make_stage_gate(db, p4.id, StageGateNumber.G1, "Discovery & Scoping", StageGateStatus.IN_REVIEW,
                         notes="Process discovery workshops underway; roadmap draft due before gate review.")
        make_stage_gate(db, p4.id, StageGateNumber.G2, "Tooling & Pilot Selection", StageGateStatus.PENDING)
        make_stage_gate(db, p4.id, StageGateNumber.G3, "Pilot Build", StageGateStatus.PENDING)
        make_stage_gate(db, p4.id, StageGateNumber.G4, "Governance & Scale Readiness", StageGateStatus.PENDING)
        make_stage_gate(db, p4.id, StageGateNumber.G5, "Enterprise Rollout", StageGateStatus.PENDING)

        make_stage_gate(db, p5.id, StageGateNumber.G1, "Requirements & Business Case", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2025, 6, 20)))
        make_stage_gate(db, p5.id, StageGateNumber.G2, "Sensor & Platform Design", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2025, 9, 1)))
        make_stage_gate(db, p5.id, StageGateNumber.G3, "Pilot Deployment", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2026, 1, 15)))
        make_stage_gate(db, p5.id, StageGateNumber.G4, "Field Rollout Readiness", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2026, 4, 1)))
        make_stage_gate(db, p5.id, StageGateNumber.G5, "Go-Live & Handover", StageGateStatus.APPROVED,
                         approver="Morgan Reyes", signed_off_at=_dt(date(2026, 6, 1)))

        make_stage_gate(db, p6.id, StageGateNumber.G1, "Charter & Governance", StageGateStatus.APPROVED,
                         approver="Solari Continental Holdings Steering Committee", signed_off_at=_dt(date(2026, 1, 20)))
        make_stage_gate(db, p6.id, StageGateNumber.G2, "Architecture & Platform Selection", StageGateStatus.APPROVED,
                         approver="Solari Continental Holdings Steering Committee", signed_off_at=_dt(date(2026, 4, 10)))
        make_stage_gate(db, p6.id, StageGateNumber.G3, "Build & Configuration Readiness", StageGateStatus.IN_REVIEW,
                         notes="Finance and supply chain configuration ~60% complete; data cleansing behind plan.")
        make_stage_gate(db, p6.id, StageGateNumber.G4, "Cutover Readiness", StageGateStatus.PENDING)
        make_stage_gate(db, p6.id, StageGateNumber.G5, "Go-Live & Hypercare Exit", StageGateStatus.PENDING)

        make_stage_gate(db, p7.id, StageGateNumber.G1, "Platform Strategy & Vendor Selection", StageGateStatus.APPROVED,
                         approver="Braxton Pharmaceutical Group Steering Committee", signed_off_at=_dt(date(2026, 4, 20)))
        make_stage_gate(db, p7.id, StageGateNumber.G2, "Landing Zone & Identity", StageGateStatus.APPROVED,
                         approver="Braxton Pharmaceutical Group Steering Committee", signed_off_at=_dt(date(2026, 6, 20)))
        make_stage_gate(db, p7.id, StageGateNumber.G3, "Data Platform Build", StageGateStatus.IN_REVIEW,
                         notes="Clinical and commercial pipeline migration in progress; governance tooling nearing completion.")
        make_stage_gate(db, p7.id, StageGateNumber.G4, "Validation & Security Readiness", StageGateStatus.PENDING)
        make_stage_gate(db, p7.id, StageGateNumber.G5, "Production Cutover", StageGateStatus.PENDING)

        # ---------------------------------------------------------------- RACI (all 7 projects)
        make_raci(db, p1.id, "Model Training & Integration", responsible=resources["Sarah Chen"],
                  accountable=resources["Carlos Mendez"], consulted=resources["Priya Patel"], informed=resources["Emily Davis"])
        make_raci(db, p1.id, "Production Deployment", responsible=resources["Michael Brown"],
                  accountable=resources["Carlos Mendez"], consulted=resources["Sarah Chen"], informed=resources["Emily Davis"])

        make_raci(db, p2.id, "ERP Data Migration", responsible=resources["Priya Patel"],
                  accountable=resources["David Kim"], consulted=resources["Thomas Mueller"], informed=resources["Robert Garcia"])
        make_raci(db, p2.id, "Security Compliance Review", responsible=resources["Thomas Mueller"],
                  accountable=resources["David Kim"], consulted=resources["Priya Patel"], informed=resources["Robert Garcia"])

        make_raci(db, p3.id, "Migration Architecture", responsible=resources["Carlos Mendez"],
                  accountable=resources["James Rodriguez"], consulted=resources["Thomas Mueller"], informed=resources["David Kim"])
        make_raci(db, p3.id, "Pilot Workload Cutover", responsible=resources["James Rodriguez"],
                  accountable=resources["Carlos Mendez"], consulted=resources["David Kim"], informed=resources["Thomas Mueller"])

        make_raci(db, p4.id, "Process Discovery", responsible=resources["Lisa Wang"],
                  accountable=resources["Anna Kowalski"], consulted=resources["Michael Brown"])
        make_raci(db, p4.id, "RPA Tool Evaluation", responsible=resources["Anna Kowalski"],
                  accountable=resources["Lisa Wang"])

        make_raci(db, p5.id, "IoT Sensor Integration", responsible=resources["Grace Lee"], accountable=resources["Lisa Wang"])
        make_raci(db, p5.id, "Operator Training & Handover", responsible=resources["Lisa Wang"], accountable=resources["Grace Lee"])

        make_raci(db, p6.id, "Finance Module Configuration", responsible=resources["Oliver Bennett"],
                  accountable=resources["Elena Voss"], consulted=resources["Fatima Al-Sayed"], informed=resources["Ingrid Larsson"])
        make_raci(db, p6.id, "Supply Chain Module Configuration", responsible=resources["Nadia Hussein"],
                  accountable=resources["Elena Voss"], consulted=resources["Kenji Watanabe"], informed=resources["Ingrid Larsson"])
        make_raci(db, p6.id, "Data Migration & Cleansing", responsible=resources["Fatima Al-Sayed"],
                  accountable=resources["Marcus Alvarez"], consulted=resources["Samuel Okafor"], informed=resources["Deepa Krishnan"])
        make_raci(db, p6.id, "Regulatory & Compliance Validation", responsible=resources["Deepa Krishnan"],
                  accountable=resources["Elena Voss"], consulted=resources["Oliver Bennett"], informed=resources["Marcus Alvarez"])
        make_raci(db, p6.id, "Cutover & Hypercare", responsible=resources["Marcus Alvarez"],
                  accountable=resources["Elena Voss"], consulted=resources["Beatrice Novak"], informed=resources["Kenji Watanabe"])

        make_raci(db, p7.id, "Landing Zone & Identity Architecture", responsible=resources["Ravi Shankar"],
                  accountable=resources["Elena Voss"], consulted=resources["Nadia Hussein"], informed=resources["Marcus Alvarez"])
        make_raci(db, p7.id, "GxP Validation Framework", responsible=resources["Deepa Krishnan"],
                  accountable=resources["Elena Voss"], consulted=resources["Beatrice Novak"], informed=resources["Marcus Alvarez"])
        make_raci(db, p7.id, "Data Lake & Governance", responsible=resources["Fatima Al-Sayed"],
                  accountable=resources["Marcus Alvarez"], consulted=resources["Grace Lee"], informed=resources["Ravi Shankar"])
        make_raci(db, p7.id, "Clinical & Commercial Pipeline Migration", responsible=resources["Grace Lee"],
                  accountable=resources["Marcus Alvarez"], consulted=resources["Priya Patel"], informed=resources["Fatima Al-Sayed"])
        make_raci(db, p7.id, "Security & Cutover", responsible=resources["Ravi Shankar"],
                  accountable=resources["Elena Voss"], consulted=resources["Beatrice Novak"], informed=resources["Kenji Watanabe"])

        # ---------------------------------------------------------------- resource allocations
        make_allocation(db, resources["Sarah Chen"].id, p1.id, 100, date(2026, 3, 1), date(2026, 12, 1))
        make_allocation(db, resources["Carlos Mendez"].id, p1.id, 100, date(2026, 3, 1), date(2026, 8, 1))
        make_allocation(db, resources["Emily Davis"].id, p1.id, 60, date(2026, 6, 1), date(2026, 12, 1))
        make_allocation(db, resources["Michael Brown"].id, p4.id, 50, date(2026, 8, 1), date(2027, 1, 1))

        make_allocation(db, resources["Priya Patel"].id, p1.id, 90, date(2026, 3, 1), date(2026, 6, 1))
        make_allocation(db, resources["Priya Patel"].id, p2.id, 40, date(2026, 5, 1), date(2026, 11, 15))

        make_allocation(db, resources["David Kim"].id, p2.id, 100, date(2026, 6, 1), date(2026, 11, 15))
        make_allocation(db, resources["David Kim"].id, p3.id, 50, date(2026, 6, 1), date(2027, 1, 1))

        make_allocation(db, resources["Thomas Mueller"].id, p2.id, 100, date(2026, 5, 1), date(2026, 11, 15))
        make_allocation(db, resources["Thomas Mueller"].id, p3.id, 30, date(2026, 6, 1), date(2026, 10, 1))

        make_allocation(db, resources["James Rodriguez"].id, p3.id, 70, date(2026, 2, 1), date(2027, 2, 1))
        make_allocation(db, resources["Robert Garcia"].id, p2.id, 80, date(2026, 5, 1), date(2026, 11, 15))
        make_allocation(db, resources["Lisa Wang"].id, p5.id, 30, date(2025, 6, 1), date(2026, 6, 1))
        make_allocation(db, resources["Anna Kowalski"].id, p4.id, 20, date(2026, 8, 1), date(2027, 1, 1))
        make_allocation(db, resources["Grace Lee"].id, p5.id, 45, date(2025, 6, 1), date(2026, 6, 1))

        # p6 — Global ERP Consolidation Program
        make_allocation(db, resources["Elena Voss"].id, p6.id, 20, date(2026, 1, 5), date(2027, 4, 30))
        make_allocation(db, resources["Marcus Alvarez"].id, p6.id, 60, date(2026, 1, 5), date(2027, 4, 30))
        make_allocation(db, resources["Oliver Bennett"].id, p6.id, 100, date(2026, 4, 11), date(2026, 12, 15))
        make_allocation(db, resources["Nadia Hussein"].id, p6.id, 100, date(2026, 3, 16), date(2026, 12, 15))
        make_allocation(db, resources["Fatima Al-Sayed"].id, p6.id, 90, date(2026, 4, 11), date(2026, 10, 1))
        make_allocation(db, resources["Samuel Okafor"].id, p6.id, 80, date(2026, 7, 15), date(2027, 2, 10))
        make_allocation(db, resources["Deepa Krishnan"].id, p6.id, 40, date(2026, 9, 1), date(2026, 11, 15))
        make_allocation(db, resources["Kenji Watanabe"].id, p6.id, 70, date(2026, 9, 1), date(2027, 3, 20))
        make_allocation(db, resources["Ingrid Larsson"].id, p6.id, 50, date(2026, 4, 11), date(2027, 3, 20))
        make_allocation(db, resources["Beatrice Novak"].id, p6.id, 60, date(2026, 12, 16), date(2027, 3, 5))

        # p7 — Sovereign Cloud Data Platform
        make_allocation(db, resources["Ravi Shankar"].id, p7.id, 80, date(2026, 4, 1), date(2027, 1, 31))
        make_allocation(db, resources["Deepa Krishnan"].id, p7.id, 40, date(2026, 4, 21), date(2026, 12, 20))
        make_allocation(db, resources["Fatima Al-Sayed"].id, p7.id, 30, date(2026, 5, 26), date(2027, 1, 31))
        make_allocation(db, resources["Grace Lee"].id, p7.id, 60, date(2026, 8, 16), date(2027, 1, 31))
        make_allocation(db, resources["Priya Patel"].id, p7.id, 50, date(2026, 8, 16), date(2027, 1, 31))
        make_allocation(db, resources["Beatrice Novak"].id, p7.id, 50, date(2026, 11, 1), date(2027, 1, 31))
        make_allocation(db, resources["Marcus Alvarez"].id, p7.id, 40, date(2026, 4, 1), date(2027, 1, 31))
        make_allocation(db, resources["Elena Voss"].id, p7.id, 15, date(2026, 4, 1), date(2027, 1, 31))
        make_allocation(db, resources["Kenji Watanabe"].id, p7.id, 20, date(2026, 9, 1), date(2027, 1, 20))
        make_allocation(db, resources["Nadia Hussein"].id, p7.id, 30, date(2026, 4, 21), date(2026, 6, 20))

        db.commit()

        return {
            "organization_id": str(org.id),
            "projects": len(db.scalars(select(Project)).all()),
            "tasks": len(db.scalars(select(Task)).all()),
            "task_dependencies": len(db.scalars(select(TaskDependency)).all()),
            "risks": len(db.scalars(select(Risk)).all()),
            "resources": len(db.scalars(select(Resource)).all()),
            "milestones": len(db.scalars(select(Milestone)).all()),
            "raci_entries": len(db.scalars(select(RaciEntry)).all()),
            "stage_gates": len(db.scalars(select(StageGate)).all()),
            "contract_ledger_rows": len(db.scalars(select(ContractLedger)).all()),
        }
    finally:
        db.close()


if __name__ == "__main__":
    result = seed()
    print("Seed complete:", result)
