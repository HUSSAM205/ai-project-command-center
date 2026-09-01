"""Seed script for the demo organization "Vertex Technologies" (is_demo=true).

Run with: python -m app.seed

Idempotent: if the demo org already exists it is deleted (FK ON DELETE CASCADE removes
every dependent row) and recreated fresh, so this script is safe to re-run.

Dataset shape follows docs/PRODUCT_REQUIREMENTS.md "Demo dataset targets" exactly:
5 named projects with a genuine spread of statuses/priorities, 30+ tasks (some BLOCKED),
10+ risks (mixed categories/severities), 10+ resources (mixed utilization states),
budgets + transactions per project, milestones per project — and the data is constructed
so the computed health score is what actually determines which project reads as troubled,
not a coincidence: Digital Transformation Program is seeded with real schedule slippage,
overspend, blocked tasks, high-severity risks and overloaded resources, so it lands with a
low computed health score, and its status is set to AT_RISK to match.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models.budget import Budget, BudgetTransaction
from app.models.enums import (
    MilestoneStatus,
    Priority,
    ProjectStatus,
    RiskCategory,
    RiskStatus,
    TaskStatus,
    UserRole,
)
from app.models.milestone import Milestone
from app.models.organization import Organization
from app.models.project import Project, ProjectMember
from app.models.resource import Resource, ResourceAllocation
from app.models.risk import Risk
from app.models.task import Task
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


def seed() -> dict:
    Base.metadata.create_all(bind=engine)  # no-op once Alembic has run; safe belt-and-suspenders
    db = SessionLocal()
    try:
        existing = db.scalar(select(Organization).where(Organization.slug == "vertex-technologies"))
        if existing is not None:
            db.delete(existing)
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
        ]
        resources = {}
        for rd in resource_defs:
            r = Resource(organization_id=org.id, **{**rd, "hourly_cost": Decimal(str(rd["hourly_cost"])),
                                                      "capacity_hours_per_week": Decimal(str(rd["capacity_hours_per_week"]))})
            db.add(r)
            db.flush()
            resources[rd["name"]] = r

        # ---------------------------------------------------------------- projects
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
        db.add_all([p1, p2, p3, p4, p5])
        db.flush()

        for proj, member_id, role_label in [
            (p1, admin.id, "Program Sponsor"), (p2, pm.id, "Program Manager"),
            (p3, admin.id, "Program Sponsor"), (p4, pm.id, "Program Manager"),
            (p5, admin.id, "Program Sponsor"),
        ]:
            db.add(ProjectMember(project_id=proj.id, user_id=member_id, role_on_project=role_label))

        # ---------------------------------------------------------------- tasks
        make_task(db, p1.id, title="Define AI model requirements", status=TaskStatus.DONE, priority=Priority.HIGH,
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
        make_task(db, p1.id, title="Train sentiment analysis pipeline", status=TaskStatus.IN_PROGRESS, priority=Priority.HIGH,
                  completion_percentage=75, start_date=date(2026, 6, 1), due_date=date(2026, 8, 15),
                  estimated_hours=220, actual_hours=180, assignee_id=resources["Sarah Chen"].id,
                  required_skills=["Python", "Machine Learning", "NLP"])
        make_task(db, p1.id, title="Integrate model with CRM API", status=TaskStatus.IN_PROGRESS, priority=Priority.MEDIUM,
                  completion_percentage=60, start_date=date(2026, 7, 1), due_date=date(2026, 9, 30),
                  estimated_hours=120, actual_hours=70, assignee_id=resources["Michael Brown"].id,
                  required_skills=["Python", "FastAPI"])
        make_task(db, p1.id, title="Set up model monitoring dashboard", status=TaskStatus.IN_PROGRESS, priority=Priority.MEDIUM,
                  completion_percentage=50, start_date=date(2026, 7, 15), due_date=date(2026, 10, 1),
                  estimated_hours=90, actual_hours=40, assignee_id=resources["Emily Davis"].id,
                  required_skills=["React", "TypeScript"])
        make_task(db, p1.id, title="Conduct UAT with customer success team", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                  completion_percentage=0, start_date=date(2026, 10, 15), due_date=date(2026, 11, 5),
                  estimated_hours=60)
        make_task(db, p1.id, title="Deploy to production", status=TaskStatus.TODO, priority=Priority.CRITICAL,
                  completion_percentage=0, start_date=date(2026, 11, 10), due_date=date(2026, 11, 25),
                  estimated_hours=40, required_skills=["AWS", "Kubernetes"])

        make_task(db, p2.id, title="Stakeholder alignment workshop", status=TaskStatus.DONE, priority=Priority.HIGH,
                  completion_percentage=100, start_date=date(2026, 1, 15), due_date=date(2026, 2, 1),
                  estimated_hours=40, actual_hours=44)
        make_task(db, p2.id, title="Legacy system audit", status=TaskStatus.DONE, priority=Priority.HIGH,
                  completion_percentage=100, start_date=date(2026, 2, 1), due_date=date(2026, 3, 1),
                  estimated_hours=120, actual_hours=140)
        make_task(db, p2.id, title="ERP vendor selection", status=TaskStatus.DONE, priority=Priority.CRITICAL,
                  completion_percentage=100, start_date=date(2026, 3, 1), due_date=date(2026, 4, 15),
                  estimated_hours=100, actual_hours=130)
        make_task(db, p2.id, title="Data migration mapping", status=TaskStatus.BLOCKED, priority=Priority.CRITICAL,
                  completion_percentage=30, start_date=date(2026, 5, 1), due_date=date(2026, 7, 1),
                  estimated_hours=180, actual_hours=90, assignee_id=resources["Priya Patel"].id,
                  required_skills=["SQL", "Python"])
        make_task(db, p2.id, title="Security compliance review", status=TaskStatus.BLOCKED, priority=Priority.HIGH,
                  completion_percentage=20, start_date=date(2026, 6, 1), due_date=date(2026, 8, 1),
                  estimated_hours=100, actual_hours=35, assignee_id=resources["Thomas Mueller"].id,
                  required_skills=["SOC2", "IAM"])
        make_task(db, p2.id, title="Employee training program design", status=TaskStatus.BLOCKED, priority=Priority.MEDIUM,
                  completion_percentage=10, start_date=date(2026, 7, 1), due_date=date(2026, 9, 15),
                  estimated_hours=80, actual_hours=15)
        make_task(db, p2.id, title="Change management rollout", status=TaskStatus.IN_PROGRESS, priority=Priority.HIGH,
                  completion_percentage=25, start_date=date(2026, 7, 15), due_date=date(2026, 10, 1),
                  estimated_hours=140, actual_hours=45, assignee_id=resources["David Kim"].id)
        make_task(db, p2.id, title="Integration testing", status=TaskStatus.TODO, priority=Priority.CRITICAL,
                  completion_percentage=0, start_date=date(2026, 9, 15), due_date=date(2026, 11, 1),
                  estimated_hours=160)

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
        make_task(db, p3.id, title="Database migration scripts", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                  completion_percentage=0, start_date=date(2026, 10, 1), due_date=date(2026, 12, 1),
                  estimated_hours=100)
        make_task(db, p3.id, title="DR/backup strategy", status=TaskStatus.TODO, priority=Priority.MEDIUM,
                  completion_percentage=0, start_date=date(2026, 11, 1), due_date=date(2027, 1, 1),
                  estimated_hours=70)

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

        for title, hrs in [
            ("Requirements gathering", 60), ("IoT sensor integration", 220),
            ("Real-time dashboard build", 180), ("Predictive maintenance model", 200),
            ("Field pilot testing", 120), ("Operator training", 50), ("Go-live & handover", 40),
        ]:
            make_task(db, p5.id, title=title, status=TaskStatus.DONE, priority=Priority.HIGH,
                      completion_percentage=100, start_date=date(2025, 6, 1), due_date=date(2026, 5, 15),
                      estimated_hours=hrs, actual_hours=hrs + 5)

        # ---------------------------------------------------------------- risks
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
        ]
        for proj, transactions in budget_plans:
            db.add(Budget(project_id=proj.id, initial_budget=proj.budget, currency="USD"))
            for description, amount, category, tx_date in transactions:
                db.add(BudgetTransaction(project_id=proj.id, description=description,
                                          amount=Decimal(str(amount)), category=category, date=tx_date))

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

        db.commit()

        return {
            "organization_id": str(org.id),
            "projects": 5,
            "tasks": len(db.scalars(select(Task)).all()),
            "risks": len(db.scalars(select(Risk)).all()),
            "resources": len(db.scalars(select(Resource)).all()),
            "milestones": len(db.scalars(select(Milestone)).all()),
        }
    finally:
        db.close()


if __name__ == "__main__":
    result = seed()
    print("Seed complete:", result)
