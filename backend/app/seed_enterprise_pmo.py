"""Seed script for 8 cross-industry flagship programs, additive to the existing "Vertex
Technologies" demo organization created by app/seed.py.

Run with: python -m app.seed_enterprise_pmo (app/seed.py must have already been run at least
once -- this script enriches that org, it does not create one).

Idempotent: each of the 8 programs below is looked up by (organization_id, name); if it already
exists it is deleted (FK ON DELETE CASCADE removes its tasks/dependencies/allocations/risks/
milestones/budget) and recreated fresh, so re-running this script never duplicates data or throws
a unique-constraint violation. Resources are looked up-or-created by (organization_id, name) so
re-running never creates duplicate resource rows either, and a resource shared with the original
7 seeded projects keeps its existing allocations there untouched.

Every company/program name below is entirely fictional (see CLAUDE.md's "Critical constraint").
Financial figures, schedules, and task completion are chosen deliberately so the deterministic
health-score/RAG engines (app/services/health_score.py, app/services/rag_status.py) land on a
genuine spread of all four canonical RAG values from real inputs -- never hardcoded RAG labels,
since neither health_score nor RAG is a persisted column anywhere in this schema.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select

from app.core.database import Base, SessionLocal, engine
from app.models.budget import Budget, BudgetTransaction
from app.models.enums import MilestoneStatus, Priority, ProjectStatus, RiskCategory, RiskStatus, TaskStatus
from app.models.organization import Organization
from app.models.project import Project, ProjectMember
from app.models.resource import Resource
from app.seed import make_allocation, make_dependency, make_milestone, make_risk, make_task

TODAY = date(2026, 9, 1)

NEW_RESOURCE_DEFS = [
    dict(name="Colonel Rebecca Hart", role="Avionics Systems Engineer", department="Engineering",
         skills=["Avionics", "DO-178C", "Systems Integration"], hourly_cost=165, capacity_hours_per_week=40),
    dict(name="Daniel Osei", role="Flight Software Engineer", department="Engineering",
         skills=["Embedded C", "Real-Time Systems", "DO-178C"], hourly_cost=130, capacity_hours_per_week=40),
    dict(name="Yuki Tanaka", role="GPU Cluster Architect", department="Engineering",
         skills=["HPC", "InfiniBand", "Kubernetes", "CUDA"], hourly_cost=155, capacity_hours_per_week=40),
    dict(name="Hannah Fischer", role="HPC Systems Engineer", department="Engineering",
         skills=["Linux", "Slurm", "Networking"], hourly_cost=112, capacity_hours_per_week=40),
    dict(name="Dr. Adaeze Nwosu", role="Cold-Chain Systems Engineer", department="Engineering",
         skills=["IoT Telemetry", "Embedded Sensors", "GxP"], hourly_cost=118, capacity_hours_per_week=40),
    dict(name="Viktor Petrov", role="Port Operations Analyst", department="Operations",
         skills=["Logistics", "Terminal Operations", "Process Design"], hourly_cost=92, capacity_hours_per_week=40),
    dict(name="Amara Osei-Bonsu", role="Logistics Systems Architect", department="Engineering",
         skills=["System Design", "APIs", "Routing Optimization"], hourly_cost=132, capacity_hours_per_week=40),
    dict(name="Lars Eriksson", role="Grid Systems Engineer", department="Engineering",
         skills=["SCADA", "Smart Grid", "Power Systems"], hourly_cost=125, capacity_hours_per_week=40),
    dict(name="Meera Iyer", role="Smart Meter Field Engineer", department="Engineering",
         skills=["Field Deployment", "IoT Telemetry", "AMI"], hourly_cost=88, capacity_hours_per_week=40),
    dict(name="Tomas Novak", role="RAN Network Engineer", department="Engineering",
         skills=["Open-RAN", "5G Core", "RF Planning"], hourly_cost=128, capacity_hours_per_week=40),
]


def _get_or_create_resource(db, org_id, cache, name):
    if name in cache:
        return cache[name]
    existing = db.scalar(select(Resource).where(Resource.organization_id == org_id, Resource.name == name))
    if existing is not None:
        cache[name] = existing
        return existing
    rd = next(r for r in NEW_RESOURCE_DEFS if r["name"] == name)
    resource = Resource(
        organization_id=org_id,
        **{**rd, "hourly_cost": Decimal(str(rd["hourly_cost"])), "capacity_hours_per_week": Decimal(str(rd["capacity_hours_per_week"]))},
    )
    db.add(resource)
    db.flush()
    cache[name] = resource
    return resource


def _delete_existing(db, org_id, name):
    existing_id = db.scalar(select(Project.id).where(Project.organization_id == org_id, Project.name == name))
    if existing_id is not None:
        db.execute(delete(Project).where(Project.id == existing_id))
        db.commit()


def seed() -> dict:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        org = db.scalar(select(Organization).where(Organization.slug == "vertex-technologies"))
        if org is None:
            raise RuntimeError(
                "demo organization 'vertex-technologies' not found -- run `python -m app.seed` first; "
                "this script enriches that org, it does not create one"
            )
        admin_id = org.users[0].id if org.users else None

        rcache: dict[str, Resource] = {}

        def R(name):
            return _get_or_create_resource(db, org.id, rcache, name)

        program_names = [
            "Global Core Banking Migration & Basel III Compliance",
            "Sovereign AI Avionics & Autonomous Telemetry System",
            "National Datacenter GPU Cluster Infrastructure",
            "Biomedical Vaccine Cold-Chain Telemetry Platform",
            "Smart Port Logistics & Automated Terminal Routing",
            "National Grid Zero-Carbon Smart Meter Integration",
            "5G Open-RAN Infrastructure Transformation",
            "Global Enterprise ERP Consolidation & Audit System",
        ]
        for name in program_names:
            _delete_existing(db, org.id, name)

        created = []

        # ---------------------------------------------------------- 1. FinTech (ON_TRACK)
        p1 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="Global Core Banking Migration & Basel III Compliance",
            description="Migration of core ledger and payments processing to a new banking platform, "
                        "with Basel III capital-adequacy reporting built in from day one.",
            client="Meridian National Bank", status=ProjectStatus.ACTIVE, priority=Priority.CRITICAL,
            start_date=date(2026, 1, 10), end_date=date(2027, 6, 30),
            budget=Decimal("45000000"), actual_cost=Decimal("19000000"), progress=48,
        )
        db.add(p1)
        db.flush()
        created.append(p1)
        db.add(ProjectMember(project_id=p1.id, user_id=admin_id, role_on_project="Program Sponsor"))
        t = {}
        t[1] = make_task(db, p1.id, title="Regulatory & Basel III requirements baseline", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 1, 10),
                          due_date=date(2026, 2, 20), estimated_hours=400, actual_hours=420,
                          assignee_id=R("Elena Voss").id, required_skills=["Program Governance"])
        t[2] = make_task(db, p1.id, title="Core ledger platform selection", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 2, 21),
                          due_date=date(2026, 4, 1), estimated_hours=320, actual_hours=330,
                          assignee_id=R("Nadia Hussein").id, required_skills=["Enterprise Architecture"])
        t[3] = make_task(db, p1.id, title="Payments engine re-platforming", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.CRITICAL, completion_percentage=55, start_date=date(2026, 4, 2),
                          due_date=date(2026, 10, 15), estimated_hours=900, actual_hours=520,
                          assignee_id=R("Marcus Alvarez").id, required_skills=["Program Management"])
        t[4] = make_task(db, p1.id, title="Basel III capital reporting module", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.HIGH, completion_percentage=50, start_date=date(2026, 4, 2),
                          due_date=date(2026, 11, 1), estimated_hours=600, actual_hours=310,
                          assignee_id=R("Deepa Krishnan").id, required_skills=["Quality Systems"])
        t[5] = make_task(db, p1.id, title="Legacy ledger data migration", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.CRITICAL, completion_percentage=40, start_date=date(2026, 6, 1),
                          due_date=date(2027, 1, 15), estimated_hours=700, actual_hours=280,
                          assignee_id=R("Fatima Al-Sayed").id, required_skills=["Data Governance"])
        t[6] = make_task(db, p1.id, title="Regulator parallel-run & sign-off", status=TaskStatus.TODO,
                          priority=Priority.CRITICAL, completion_percentage=0, start_date=date(2027, 1, 16),
                          due_date=date(2027, 4, 30), estimated_hours=400)
        t[7] = make_task(db, p1.id, title="Branch & channel cutover", status=TaskStatus.TODO,
                          priority=Priority.HIGH, completion_percentage=0, start_date=date(2027, 5, 1),
                          due_date=date(2027, 6, 20), estimated_hours=260)
        t[8] = make_task(db, p1.id, title="Post-migration hypercare", status=TaskStatus.TODO,
                          priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 6, 21),
                          due_date=date(2027, 6, 30), estimated_hours=120)
        make_dependency(db, t[3], depends_on=t[2])
        make_dependency(db, t[4], depends_on=t[2])
        make_dependency(db, t[5], depends_on=t[2])
        make_dependency(db, t[6], depends_on=t[3])
        make_dependency(db, t[6], depends_on=t[4])
        make_dependency(db, t[6], depends_on=t[5])
        make_dependency(db, t[7], depends_on=t[6])
        make_dependency(db, t[8], depends_on=t[7])
        make_allocation(db, R("Elena Voss").id, p1.id, 20)
        make_allocation(db, R("Nadia Hussein").id, p1.id, 40)
        make_allocation(db, R("Marcus Alvarez").id, p1.id, 60)
        make_allocation(db, R("Deepa Krishnan").id, p1.id, 40)
        make_allocation(db, R("Fatima Al-Sayed").id, p1.id, 30)
        make_risk(db, p1.id, title="Regulator feedback could require re-scoping capital module",
                  description="Preliminary regulator review flagged questions on the capital-adequacy calc engine.",
                  category=RiskCategory.EXTERNAL, probability=2, impact=4, owner="Elena Voss",
                  mitigation="Early informal regulator walkthroughs scheduled monthly.", status=RiskStatus.MITIGATING)
        make_risk(db, p1.id, title="Legacy ledger data quality unknowns",
                  description="Full data-quality profiling of the 30-year-old ledger is still in progress.",
                  category=RiskCategory.TECHNICAL, probability=3, impact=3, owner="Fatima Al-Sayed",
                  mitigation="Extended profiling sprint added before migration mapping freeze.", status=RiskStatus.OPEN)
        make_milestone(db, p1.id, name="Core Platform Selected", description="Vendor contract executed.",
                       due_date=date(2026, 4, 1), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p1.id, name="Regulator Sign-off", description="Basel III parallel-run accepted by regulator.",
                       due_date=date(2027, 4, 30), status=MilestoneStatus.PENDING)
        db.add(Budget(project_id=p1.id, initial_budget=p1.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("Core banking platform license", 6500000, "Software", date(2026, 4, 5)),
            ("Systems integrator program team", 8200000, "Labor", date(2026, 6, 1)),
            ("Regulatory advisory", 2100000, "Vendor", date(2026, 7, 1)),
            ("Data migration tooling", 1200000, "Software", date(2026, 8, 1)),
            ("Payments engine infrastructure", 1000000, "Infrastructure", date(2026, 8, 15)),
        ]:
            db.add(BudgetTransaction(project_id=p1.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        # ---------------------------------------------------------- 2. Defense (CRITICAL)
        p2 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="Sovereign AI Avionics & Autonomous Telemetry System",
            description="AI-assisted avionics decision support and autonomous telemetry package for a "
                        "next-generation sovereign airframe program.",
            client="Aegis Defense Systems", status=ProjectStatus.AT_RISK, priority=Priority.CRITICAL,
            start_date=date(2025, 9, 1), end_date=date(2027, 12, 31),
            budget=Decimal("120000000"), actual_cost=Decimal("68000000"), progress=32,
        )
        db.add(p2)
        db.flush()
        created.append(p2)
        db.add(ProjectMember(project_id=p2.id, user_id=admin_id, role_on_project="Program Sponsor"))
        t = {}
        t[1] = make_task(db, p2.id, title="Systems requirements & DO-178C planning", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2025, 9, 1),
                          due_date=date(2025, 12, 15), estimated_hours=900, actual_hours=980,
                          assignee_id=R("Colonel Rebecca Hart").id, required_skills=["DO-178C"])
        t[2] = make_task(db, p2.id, title="Avionics hardware integration architecture", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2025, 12, 16),
                          due_date=date(2026, 4, 1), estimated_hours=1100, actual_hours=1280,
                          assignee_id=R("Colonel Rebecca Hart").id, required_skills=["Avionics"])
        t[3] = make_task(db, p2.id, title="Flight control software development", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.CRITICAL, completion_percentage=45, start_date=date(2026, 4, 2),
                          due_date=date(2027, 3, 1), estimated_hours=2400, actual_hours=1350,
                          assignee_id=R("Daniel Osei").id, required_skills=["Embedded C", "Real-Time Systems"])
        t[4] = make_task(db, p2.id, title="Autonomous telemetry link development", status=TaskStatus.BLOCKED,
                          priority=Priority.CRITICAL, completion_percentage=25, start_date=date(2026, 5, 1),
                          due_date=date(2027, 1, 15), estimated_hours=1600, actual_hours=520,
                          assignee_id=R("Ravi Shankar").id, required_skills=["Zero Trust"])
        t[5] = make_task(db, p2.id, title="Ground control station integration", status=TaskStatus.BLOCKED,
                          priority=Priority.HIGH, completion_percentage=15, start_date=date(2026, 6, 1),
                          due_date=date(2027, 4, 1), estimated_hours=1200, actual_hours=210)
        t[6] = make_task(db, p2.id, title="Flight test campaign — phase 1", status=TaskStatus.TODO,
                          priority=Priority.CRITICAL, completion_percentage=0, start_date=date(2027, 3, 2),
                          due_date=date(2027, 8, 1), estimated_hours=1000)
        t[7] = make_task(db, p2.id, title="Security accreditation & certification", status=TaskStatus.TODO,
                          priority=Priority.CRITICAL, completion_percentage=0, start_date=date(2027, 8, 2),
                          due_date=date(2027, 11, 1), estimated_hours=700)
        t[8] = make_task(db, p2.id, title="Sovereign customer acceptance & handover", status=TaskStatus.TODO,
                          priority=Priority.HIGH, completion_percentage=0, start_date=date(2027, 11, 2),
                          due_date=date(2027, 12, 31), estimated_hours=350)
        make_dependency(db, t[3], depends_on=t[2])
        make_dependency(db, t[4], depends_on=t[2])
        make_dependency(db, t[5], depends_on=t[4])
        make_dependency(db, t[6], depends_on=t[3])
        make_dependency(db, t[6], depends_on=t[5])
        make_dependency(db, t[7], depends_on=t[6])
        make_dependency(db, t[8], depends_on=t[7])
        make_allocation(db, R("Colonel Rebecca Hart").id, p2.id, 60)
        make_allocation(db, R("Daniel Osei").id, p2.id, 100)
        make_allocation(db, R("Ravi Shankar").id, p2.id, 50)
        make_risk(db, p2.id, title="Telemetry encryption module failed security accreditation dry-run",
                  description="Independent security review flagged the telemetry link's key-exchange scheme.",
                  category=RiskCategory.SECURITY, probability=4, impact=5, owner="Ravi Shankar",
                  mitigation="Redesigning key exchange with certified crypto library; re-review scheduled.",
                  status=RiskStatus.OPEN)
        make_risk(db, p2.id, title="Flight control software behind plan by one full quarter",
                  description="Embedded software velocity has consistently missed sprint targets since Q2.",
                  category=RiskCategory.SCHEDULE, probability=4, impact=5, owner="Daniel Osei",
                  mitigation="Adding a second embedded team; descoping non-critical telemetry channels for phase 1.",
                  status=RiskStatus.OPEN)
        make_risk(db, p2.id, title="Cost growth from extended integration testing",
                  description="Hardware-in-the-loop test cycles are running longer and more often than budgeted.",
                  category=RiskCategory.BUDGET, probability=4, impact=4, owner="Elena Voss",
                  mitigation="Program contingency drawdown approved by steering committee; monthly EAC reforecast.",
                  status=RiskStatus.OPEN)
        make_milestone(db, p2.id, name="Hardware Architecture Frozen", description="Avionics integration architecture baselined.",
                       due_date=date(2026, 4, 1), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p2.id, name="Flight Test Campaign Start", description="First flight test article ready.",
                       due_date=date(2027, 3, 2), status=MilestoneStatus.AT_RISK)
        db.add(Budget(project_id=p2.id, initial_budget=p2.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("Avionics hardware & test rigs", 22000000, "Infrastructure", date(2026, 1, 15)),
            ("Embedded software engineering team", 28000000, "Labor", date(2026, 4, 1)),
            ("Independent security accreditation", 6000000, "Vendor", date(2026, 6, 1)),
            ("Flight test range & telemetry ground stations", 9000000, "Infrastructure", date(2026, 8, 1)),
            ("Program management office", 3000000, "Labor", date(2026, 3, 1)),
        ]:
            db.add(BudgetTransaction(project_id=p2.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        # ---------------------------------------------------------- 3. Sovereign Cloud (ON_TRACK)
        p3 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="National Datacenter GPU Cluster Infrastructure",
            description="Sovereign, air-gapped GPU compute cluster for national AI research and model training workloads.",
            client="National Institute for Advanced Computing", status=ProjectStatus.ACTIVE, priority=Priority.HIGH,
            start_date=date(2026, 2, 1), end_date=date(2027, 8, 1),
            budget=Decimal("85000000"), actual_cost=Decimal("44000000"), progress=55,
        )
        db.add(p3)
        db.flush()
        created.append(p3)
        db.add(ProjectMember(project_id=p3.id, user_id=admin_id, role_on_project="Program Sponsor"))
        t = {}
        t[1] = make_task(db, p3.id, title="Site selection & power/cooling design", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 2, 1),
                          due_date=date(2026, 4, 1), estimated_hours=500, actual_hours=510,
                          assignee_id=R("Hannah Fischer").id, required_skills=["Networking"])
        t[2] = make_task(db, p3.id, title="GPU cluster architecture & fabric design", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 4, 2),
                          due_date=date(2026, 6, 1), estimated_hours=700, actual_hours=690,
                          assignee_id=R("Yuki Tanaka").id, required_skills=["HPC", "InfiniBand"])
        t[3] = make_task(db, p3.id, title="Hardware procurement & delivery", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 4, 15),
                          due_date=date(2026, 8, 1), estimated_hours=300, actual_hours=280)
        t[4] = make_task(db, p3.id, title="Rack build-out & cabling", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.HIGH, completion_percentage=70, start_date=date(2026, 8, 2),
                          due_date=date(2026, 11, 1), estimated_hours=900, actual_hours=620,
                          assignee_id=R("Hannah Fischer").id)
        t[5] = make_task(db, p3.id, title="Cluster orchestration & scheduler setup", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.HIGH, completion_percentage=55, start_date=date(2026, 9, 1),
                          due_date=date(2027, 1, 15), estimated_hours=800, actual_hours=420,
                          assignee_id=R("Yuki Tanaka").id, required_skills=["Kubernetes", "CUDA"])
        t[6] = make_task(db, p3.id, title="Security hardening & Zero Trust segmentation", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.HIGH, completion_percentage=40, start_date=date(2026, 9, 15),
                          due_date=date(2027, 2, 1), estimated_hours=500, actual_hours=190,
                          assignee_id=R("Ravi Shankar").id, required_skills=["Zero Trust"])
        t[7] = make_task(db, p3.id, title="Researcher onboarding & pilot workloads", status=TaskStatus.TODO,
                          priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 2, 2),
                          due_date=date(2027, 5, 1), estimated_hours=350)
        t[8] = make_task(db, p3.id, title="Full operational handover", status=TaskStatus.TODO,
                          priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 5, 2),
                          due_date=date(2027, 8, 1), estimated_hours=200)
        make_dependency(db, t[3], depends_on=t[2])
        make_dependency(db, t[4], depends_on=t[3])
        make_dependency(db, t[5], depends_on=t[4])
        make_dependency(db, t[6], depends_on=t[4])
        make_dependency(db, t[7], depends_on=t[5])
        make_dependency(db, t[7], depends_on=t[6])
        make_dependency(db, t[8], depends_on=t[7])
        make_allocation(db, R("Hannah Fischer").id, p3.id, 90)
        make_allocation(db, R("Yuki Tanaka").id, p3.id, 80)
        make_allocation(db, R("Ravi Shankar").id, p3.id, 30)
        make_risk(db, p3.id, title="GPU supply allocation could slip a quarter",
                  description="Global GPU demand means the vendor's delivery window has narrow slack.",
                  category=RiskCategory.EXTERNAL, probability=2, impact=3, owner="Yuki Tanaka",
                  mitigation="Secured contractual delivery penalties; second-source fallback identified.",
                  status=RiskStatus.MITIGATING)
        make_milestone(db, p3.id, name="Hardware On-Site", description="All compute racks delivered to site.",
                       due_date=date(2026, 8, 1), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p3.id, name="Cluster GA", description="Cluster available to research teams.",
                       due_date=date(2027, 5, 1), status=MilestoneStatus.PENDING)
        db.add(Budget(project_id=p3.id, initial_budget=p3.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("GPU compute hardware", 32000000, "Infrastructure", date(2026, 5, 1)),
            ("Datacenter power & cooling build-out", 6000000, "Infrastructure", date(2026, 3, 1)),
            ("Networking fabric (InfiniBand)", 4500000, "Infrastructure", date(2026, 6, 1)),
            ("Systems engineering team", 1200000, "Labor", date(2026, 8, 1)),
            ("Security & compliance tooling", 300000, "Software", date(2026, 9, 1)),
        ]:
            db.add(BudgetTransaction(project_id=p3.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        # ---------------------------------------------------------- 4. Healthcare (AT_RISK via ON_HOLD)
        p4 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="Biomedical Vaccine Cold-Chain Telemetry Platform",
            description="Real-time temperature and integrity telemetry for vaccine cold-chain logistics, "
                        "from manufacturing through last-mile delivery.",
            client="Braxton Pharmaceutical Group", status=ProjectStatus.ON_HOLD, priority=Priority.HIGH,
            start_date=date(2026, 3, 1), end_date=date(2027, 3, 1),
            budget=Decimal("32000000"), actual_cost=Decimal("14000000"), progress=35,
        )
        db.add(p4)
        db.flush()
        created.append(p4)
        db.add(ProjectMember(project_id=p4.id, user_id=admin_id, role_on_project="Program Sponsor"))
        t = {}
        t[1] = make_task(db, p4.id, title="Cold-chain requirements & regulatory scoping", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 3, 1),
                          due_date=date(2026, 4, 15), estimated_hours=350, actual_hours=360,
                          assignee_id=R("Deepa Krishnan").id, required_skills=["GxP", "FDA Validation"])
        t[2] = make_task(db, p4.id, title="Sensor hardware selection & validation", status=TaskStatus.DONE,
                          priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 4, 16),
                          due_date=date(2026, 6, 15), estimated_hours=400, actual_hours=430,
                          assignee_id=R("Dr. Adaeze Nwosu").id, required_skills=["Embedded Sensors"])
        t[3] = make_task(db, p4.id, title="Telemetry gateway firmware development", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.HIGH, completion_percentage=45, start_date=date(2026, 6, 16),
                          due_date=date(2026, 10, 1), estimated_hours=600, actual_hours=280,
                          assignee_id=R("Dr. Adaeze Nwosu").id, required_skills=["IoT Telemetry"])
        t[4] = make_task(db, p4.id, title="Cloud ingestion & alerting platform", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.MEDIUM, completion_percentage=40, start_date=date(2026, 7, 1),
                          due_date=date(2026, 11, 1), estimated_hours=500, actual_hours=210,
                          assignee_id=R("Grace Lee").id, required_skills=["Python"])
        t[5] = make_task(db, p4.id, title="GxP validation protocol execution", status=TaskStatus.BLOCKED,
                          priority=Priority.CRITICAL, completion_percentage=10, start_date=date(2026, 8, 1),
                          due_date=date(2027, 1, 1), estimated_hours=450, actual_hours=60,
                          assignee_id=R("Deepa Krishnan").id, required_skills=["GxP"])
        t[6] = make_task(db, p4.id, title="Pilot cold-chain lane deployment", status=TaskStatus.TODO,
                          priority=Priority.HIGH, completion_percentage=0, start_date=date(2027, 1, 2),
                          due_date=date(2027, 2, 1), estimated_hours=250)
        t[7] = make_task(db, p4.id, title="Full network rollout", status=TaskStatus.TODO,
                          priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 2, 2),
                          due_date=date(2027, 3, 1), estimated_hours=300)
        make_dependency(db, t[3], depends_on=t[2])
        make_dependency(db, t[4], depends_on=t[2])
        make_dependency(db, t[5], depends_on=t[3])
        make_dependency(db, t[5], depends_on=t[4])
        make_dependency(db, t[6], depends_on=t[5])
        make_dependency(db, t[7], depends_on=t[6])
        make_allocation(db, R("Deepa Krishnan").id, p4.id, 40)
        make_allocation(db, R("Dr. Adaeze Nwosu").id, p4.id, 100)
        make_allocation(db, R("Grace Lee").id, p4.id, 30)
        make_risk(db, p4.id, title="Program on hold pending updated FDA guidance",
                  description="An FDA draft guidance update on cold-chain telemetry data integrity is under review; "
                              "steering committee paused validation work rather than risk rework.",
                  category=RiskCategory.EXTERNAL, probability=3, impact=4, owner="Deepa Krishnan",
                  mitigation="Monitoring FDA docket weekly; validation protocol drafted to accommodate the likely change.",
                  status=RiskStatus.OPEN)
        make_risk(db, p4.id, title="Firmware team single point of failure",
                  description="Dr. Adaeze Nwosu is the only engineer certified on the gateway firmware stack.",
                  category=RiskCategory.RESOURCE, probability=3, impact=3, owner="Morgan Reyes",
                  mitigation="Cross-training a second firmware engineer starting next quarter.", status=RiskStatus.OPEN)
        make_milestone(db, p4.id, name="Sensor Hardware Validated", description="Cold-chain sensor hardware passed validation.",
                       due_date=date(2026, 6, 15), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p4.id, name="GxP Validation Complete", description="Full validation protocol signed off.",
                       due_date=date(2027, 1, 1), status=MilestoneStatus.AT_RISK)
        db.add(Budget(project_id=p4.id, initial_budget=p4.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("Cold-chain sensor hardware", 8500000, "Infrastructure", date(2026, 5, 1)),
            ("Firmware & platform engineering", 4200000, "Labor", date(2026, 7, 1)),
            ("GxP validation & regulatory advisory", 1000000, "Vendor", date(2026, 8, 1)),
            ("Cloud telemetry infrastructure", 300000, "Infrastructure", date(2026, 8, 15)),
        ]:
            db.add(BudgetTransaction(project_id=p4.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        # ---------------------------------------------------------- 5. Global Supply Chain (CRITICAL)
        p5 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="Smart Port Logistics & Automated Terminal Routing",
            description="Automated container routing, yard optimization, and customs data integration "
                        "across three container terminals.",
            client="Solari Continental Holdings", status=ProjectStatus.AT_RISK, priority=Priority.CRITICAL,
            start_date=date(2025, 11, 1), end_date=date(2027, 5, 1),
            budget=Decimal("64000000"), actual_cost=Decimal("41000000"), progress=40,
        )
        db.add(p5)
        db.flush()
        created.append(p5)
        db.add(ProjectMember(project_id=p5.id, user_id=admin_id, role_on_project="Program Sponsor"))
        t = {}
        t[1] = make_task(db, p5.id, title="Terminal operations current-state assessment", status=TaskStatus.DONE,
                          priority=Priority.HIGH, completion_percentage=100, start_date=date(2025, 11, 1),
                          due_date=date(2026, 1, 15), estimated_hours=400, actual_hours=440,
                          assignee_id=R("Viktor Petrov").id, required_skills=["Terminal Operations"])
        t[2] = make_task(db, p5.id, title="Routing & yard optimization system design", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 1, 16),
                          due_date=date(2026, 4, 1), estimated_hours=600, actual_hours=680,
                          assignee_id=R("Amara Osei-Bonsu").id, required_skills=["Routing Optimization"])
        t[3] = make_task(db, p5.id, title="Automated crane & AGV control integration", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.CRITICAL, completion_percentage=35, start_date=date(2026, 4, 2),
                          due_date=date(2026, 12, 1), estimated_hours=1400, actual_hours=650,
                          assignee_id=R("Amara Osei-Bonsu").id, required_skills=["System Design"])
        t[4] = make_task(db, p5.id, title="Customs & port authority data integration", status=TaskStatus.BLOCKED,
                          priority=Priority.CRITICAL, completion_percentage=20, start_date=date(2026, 5, 1),
                          due_date=date(2026, 11, 1), estimated_hours=700, actual_hours=220,
                          assignee_id=R("Kenji Watanabe").id, required_skills=["APIs", "Middleware"])
        t[5] = make_task(db, p5.id, title="Terminal 1 pilot rollout", status=TaskStatus.BLOCKED,
                          priority=Priority.HIGH, completion_percentage=10, start_date=date(2026, 10, 1),
                          due_date=date(2027, 1, 15), estimated_hours=500, actual_hours=90,
                          assignee_id=R("Viktor Petrov").id)
        t[6] = make_task(db, p5.id, title="Terminal 2 & 3 rollout", status=TaskStatus.TODO,
                          priority=Priority.HIGH, completion_percentage=0, start_date=date(2027, 1, 16),
                          due_date=date(2027, 4, 1), estimated_hours=600)
        t[7] = make_task(db, p5.id, title="Full network cutover & legacy decommission", status=TaskStatus.TODO,
                          priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 4, 2),
                          due_date=date(2027, 5, 1), estimated_hours=200)
        make_dependency(db, t[3], depends_on=t[2])
        make_dependency(db, t[4], depends_on=t[1])
        make_dependency(db, t[5], depends_on=t[3])
        make_dependency(db, t[5], depends_on=t[4])
        make_dependency(db, t[6], depends_on=t[5])
        make_dependency(db, t[7], depends_on=t[6])
        make_allocation(db, R("Viktor Petrov").id, p5.id, 80)
        make_allocation(db, R("Amara Osei-Bonsu").id, p5.id, 100)
        make_allocation(db, R("Kenji Watanabe").id, p5.id, 60)
        make_risk(db, p5.id, title="Customs authority API delivery repeatedly delayed",
                  description="The port authority's customs integration API has slipped three release windows.",
                  category=RiskCategory.DEPENDENCY, probability=5, impact=4, owner="Kenji Watanabe",
                  mitigation="Escalated to port authority executive sponsor; building a manual-entry fallback path.",
                  status=RiskStatus.OPEN)
        make_risk(db, p5.id, title="AGV control integration cost overrun",
                  description="Automated guided vehicle integration is running well over the original engineering estimate.",
                  category=RiskCategory.BUDGET, probability=4, impact=4, owner="Amara Osei-Bonsu",
                  mitigation="Reforecast EAC; evaluating a phased AGV rollout to spread remaining spend.",
                  status=RiskStatus.OPEN)
        make_risk(db, p5.id, title="Dockworker union change-management concerns",
                  description="Union representatives have raised concerns about automation's workforce impact.",
                  category=RiskCategory.OPERATIONAL, probability=3, impact=4, owner="Viktor Petrov",
                  mitigation="Joint labor-management working group established; phased retraining program proposed.",
                  status=RiskStatus.MITIGATING)
        make_milestone(db, p5.id, name="System Design Approved", description="Routing and yard optimization design signed off.",
                       due_date=date(2026, 4, 1), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p5.id, name="Terminal 1 Live", description="First terminal fully automated and operational.",
                       due_date=date(2027, 1, 15), status=MilestoneStatus.AT_RISK)
        db.add(Budget(project_id=p5.id, initial_budget=p5.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("Automated crane & AGV hardware", 24000000, "Infrastructure", date(2026, 5, 1)),
            ("Systems integration & controls engineering", 12000000, "Labor", date(2026, 6, 1)),
            ("Customs/port authority integration vendor", 3500000, "Vendor", date(2026, 7, 1)),
            ("Yard management software licensing", 1200000, "Software", date(2026, 4, 15)),
            ("Change management & labor relations", 300000, "Labor", date(2026, 8, 1)),
        ]:
            db.add(BudgetTransaction(project_id=p5.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        # ---------------------------------------------------------- 6. Energy & Utilities (AT_RISK via low health)
        p6 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="National Grid Zero-Carbon Smart Meter Integration",
            description="Nationwide rollout of smart meters and grid telemetry supporting the zero-carbon "
                        "demand-response program.",
            client="Solstice Grid Authority", status=ProjectStatus.ACTIVE, priority=Priority.HIGH,
            start_date=date(2026, 1, 1), end_date=date(2027, 1, 1),
            budget=Decimal("50000000"), actual_cost=Decimal("33000000"), progress=40,
        )
        db.add(p6)
        db.flush()
        created.append(p6)
        db.add(ProjectMember(project_id=p6.id, user_id=admin_id, role_on_project="Program Sponsor"))
        t = {}
        t[1] = make_task(db, p6.id, title="Grid telemetry architecture & SCADA integration design", status=TaskStatus.DONE,
                          priority=Priority.CRITICAL, completion_percentage=100, start_date=date(2026, 1, 1),
                          due_date=date(2026, 3, 1), estimated_hours=500, actual_hours=540,
                          assignee_id=R("Lars Eriksson").id, required_skills=["SCADA", "Smart Grid"])
        t[2] = make_task(db, p6.id, title="Smart meter hardware selection & certification", status=TaskStatus.DONE,
                          priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 3, 2),
                          due_date=date(2026, 5, 1), estimated_hours=350, actual_hours=380,
                          assignee_id=R("Meera Iyer").id, required_skills=["AMI"])
        t[3] = make_task(db, p6.id, title="Regional field deployment — wave 1", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.HIGH, completion_percentage=45, start_date=date(2026, 5, 2),
                          due_date=date(2026, 10, 1), estimated_hours=1200, actual_hours=560,
                          assignee_id=R("Meera Iyer").id, required_skills=["Field Deployment"])
        t[4] = make_task(db, p6.id, title="Demand-response platform integration", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.MEDIUM, completion_percentage=35, start_date=date(2026, 6, 1),
                          due_date=date(2026, 11, 1), estimated_hours=700, actual_hours=250,
                          assignee_id=R("Lars Eriksson").id, required_skills=["Power Systems"])
        t[5] = make_task(db, p6.id, title="Grid cybersecurity hardening", status=TaskStatus.BLOCKED,
                          priority=Priority.HIGH, completion_percentage=20, start_date=date(2026, 7, 1),
                          due_date=date(2026, 12, 1), estimated_hours=450, actual_hours=95,
                          assignee_id=R("Ravi Shankar").id, required_skills=["Zero Trust"])
        t[6] = make_task(db, p6.id, title="Regional field deployment — wave 2", status=TaskStatus.BLOCKED,
                          priority=Priority.MEDIUM, completion_percentage=5, start_date=date(2026, 10, 2),
                          due_date=date(2027, 1, 1), estimated_hours=1200, actual_hours=45)
        t[7] = make_task(db, p6.id, title="National rollout completion & handover", status=TaskStatus.TODO,
                          priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2026, 12, 2),
                          due_date=date(2027, 1, 1), estimated_hours=200)
        make_dependency(db, t[3], depends_on=t[2])
        make_dependency(db, t[4], depends_on=t[1])
        make_dependency(db, t[5], depends_on=t[1])
        make_dependency(db, t[6], depends_on=t[3])
        make_dependency(db, t[6], depends_on=t[5])
        make_dependency(db, t[7], depends_on=t[6])
        make_dependency(db, t[7], depends_on=t[4])
        make_allocation(db, R("Lars Eriksson").id, p6.id, 100)
        make_allocation(db, R("Meera Iyer").id, p6.id, 100)
        make_allocation(db, R("Ravi Shankar").id, p6.id, 30)
        make_risk(db, p6.id, title="Field deployment wave 1 running behind schedule",
                  description="Meter installer crews are completing roughly 70% of the weekly install target.",
                  category=RiskCategory.SCHEDULE, probability=4, impact=3, owner="Meera Iyer",
                  mitigation="Adding two additional regional installer crews for wave 2.", status=RiskStatus.OPEN)
        make_risk(db, p6.id, title="Cybersecurity hardening blocked on vendor firmware patch",
                  description="A required firmware security patch from the meter vendor is overdue.",
                  category=RiskCategory.DEPENDENCY, probability=3, impact=3, owner="Ravi Shankar",
                  mitigation="Escalated to vendor account team with a committed patch date.", status=RiskStatus.OPEN)
        make_milestone(db, p6.id, name="Wave 1 Deployment Complete", description="First regional wave fully installed.",
                       due_date=date(2026, 10, 1), status=MilestoneStatus.AT_RISK)
        make_milestone(db, p6.id, name="National Rollout Complete", description="All regions on smart meter infrastructure.",
                       due_date=date(2027, 1, 1), status=MilestoneStatus.PENDING)
        db.add(Budget(project_id=p6.id, initial_budget=p6.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("Smart meter hardware", 21000000, "Infrastructure", date(2026, 4, 1)),
            ("Field installation labor", 8500000, "Labor", date(2026, 6, 1)),
            ("Grid telemetry & SCADA integration", 2500000, "Software", date(2026, 3, 1)),
            ("Cybersecurity hardening", 1000000, "Vendor", date(2026, 8, 1)),
        ]:
            db.add(BudgetTransaction(project_id=p6.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        # ---------------------------------------------------------- 7. Telecom (ON_TRACK)
        p7 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="5G Open-RAN Infrastructure Transformation",
            description="Transition from proprietary RAN hardware to a multi-vendor Open-RAN architecture "
                        "across the metro network.",
            client="Northbridge Telecom Group", status=ProjectStatus.PLANNING, priority=Priority.MEDIUM,
            start_date=date(2026, 7, 1), end_date=date(2027, 7, 1),
            budget=Decimal("28000000"), actual_cost=Decimal("3000000"), progress=12,
        )
        db.add(p7)
        db.flush()
        created.append(p7)
        db.add(ProjectMember(project_id=p7.id, user_id=admin_id, role_on_project="Program Sponsor"))
        t = {}
        t[1] = make_task(db, p7.id, title="Open-RAN vendor evaluation shortlist", status=TaskStatus.DONE,
                          priority=Priority.HIGH, completion_percentage=100, start_date=date(2026, 7, 1),
                          due_date=date(2026, 8, 1), estimated_hours=200, actual_hours=210,
                          assignee_id=R("Tomas Novak").id, required_skills=["Open-RAN"])
        t[2] = make_task(db, p7.id, title="RF planning for pilot metro cluster", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.HIGH, completion_percentage=30, start_date=date(2026, 8, 2),
                          due_date=date(2026, 10, 15), estimated_hours=350, actual_hours=90,
                          assignee_id=R("Tomas Novak").id, required_skills=["RF Planning"])
        t[3] = make_task(db, p7.id, title="5G core network readiness assessment", status=TaskStatus.IN_PROGRESS,
                          priority=Priority.MEDIUM, completion_percentage=25, start_date=date(2026, 8, 2),
                          due_date=date(2026, 10, 1), estimated_hours=250, actual_hours=55,
                          assignee_id=R("Carlos Mendez").id, required_skills=["System Design"])
        t[4] = make_task(db, p7.id, title="Multi-vendor interoperability lab testing", status=TaskStatus.TODO,
                          priority=Priority.HIGH, completion_percentage=0, start_date=date(2026, 10, 16),
                          due_date=date(2027, 1, 15), estimated_hours=600)
        t[5] = make_task(db, p7.id, title="Pilot cluster deployment", status=TaskStatus.TODO,
                          priority=Priority.HIGH, completion_percentage=0, start_date=date(2027, 1, 16),
                          due_date=date(2027, 3, 15), estimated_hours=500)
        t[6] = make_task(db, p7.id, title="Metro-wide rollout wave 1", status=TaskStatus.TODO,
                          priority=Priority.MEDIUM, completion_percentage=0, start_date=date(2027, 3, 16),
                          due_date=date(2027, 6, 1), estimated_hours=700)
        t[7] = make_task(db, p7.id, title="Legacy RAN decommission", status=TaskStatus.TODO,
                          priority=Priority.LOW, completion_percentage=0, start_date=date(2027, 6, 2),
                          due_date=date(2027, 7, 1), estimated_hours=200)
        make_dependency(db, t[4], depends_on=t[2])
        make_dependency(db, t[4], depends_on=t[3])
        make_dependency(db, t[5], depends_on=t[4])
        make_dependency(db, t[6], depends_on=t[5])
        make_dependency(db, t[7], depends_on=t[6])
        make_allocation(db, R("Tomas Novak").id, p7.id, 80)
        make_allocation(db, R("Carlos Mendez").id, p7.id, 20)
        make_risk(db, p7.id, title="Multi-vendor interoperability is unproven at this scale",
                  description="No reference deployment exists yet at this metro's scale with the shortlisted vendor mix.",
                  category=RiskCategory.TECHNICAL, probability=2, impact=3, owner="Tomas Novak",
                  mitigation="Extended interoperability lab window built into the plan before pilot commitment.",
                  status=RiskStatus.OPEN)
        make_milestone(db, p7.id, name="Vendor Shortlist Finalized", description="Open-RAN hardware/software vendors selected.",
                       due_date=date(2026, 8, 1), status=MilestoneStatus.COMPLETED)
        make_milestone(db, p7.id, name="Pilot Cluster Live", description="First Open-RAN pilot cluster operational.",
                       due_date=date(2027, 3, 15), status=MilestoneStatus.PENDING)
        db.add(Budget(project_id=p7.id, initial_budget=p7.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("Open-RAN radio units & baseband", 14000000, "Infrastructure", date(2026, 10, 1)),
            ("Interoperability lab & testing", 2500000, "Vendor", date(2026, 9, 1)),
            ("RF & network planning engineering", 1800000, "Labor", date(2026, 8, 1)),
            ("5G core software licensing", 1200000, "Software", date(2026, 9, 15)),
        ]:
            db.add(BudgetTransaction(project_id=p7.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        # ---------------------------------------------------------- 8. Governance (COMPLETED)
        p8 = Project(
            organization_id=org.id, manager_id=admin_id,
            name="Global Enterprise ERP Consolidation & Audit System",
            description="Consolidation of five regional finance systems onto one ERP with a unified, "
                        "immutable audit trail for group-wide financial governance.",
            client="Solari Continental Holdings", status=ProjectStatus.COMPLETED, priority=Priority.HIGH,
            start_date=date(2025, 1, 6), end_date=date(2026, 6, 1),
            budget=Decimal("18000000"), actual_cost=Decimal("17500000"), progress=100,
        )
        db.add(p8)
        db.flush()
        created.append(p8)
        db.add(ProjectMember(project_id=p8.id, user_id=admin_id, role_on_project="Program Sponsor"))
        for title, hrs in [
            ("Regional finance systems audit", 300), ("Target ERP & audit architecture design", 400),
            ("Chart of accounts standardization", 350), ("Data migration — all 5 regions", 900),
            ("Immutable audit trail module build", 500), ("Regional finance team training", 250),
            ("Phased regional go-live", 600), ("Post-launch stabilization & sign-off", 200),
        ]:
            make_task(db, p8.id, title=title, status=TaskStatus.DONE, priority=Priority.HIGH,
                      completion_percentage=100, start_date=date(2025, 1, 6), due_date=date(2026, 5, 15),
                      estimated_hours=hrs, actual_hours=hrs + 20)
        make_allocation(db, R("Oliver Bennett").id, p8.id, 20, start_date=date(2025, 1, 6), end_date=date(2026, 6, 1))
        make_allocation(db, R("Samuel Okafor").id, p8.id, 15, start_date=date(2025, 1, 6), end_date=date(2026, 6, 1))
        make_risk(db, p8.id, title="Initial regional data mapping conflicts",
                  description="Two regions used incompatible cost-center hierarchies; resolved before migration.",
                  category=RiskCategory.TECHNICAL, probability=2, impact=2, owner="Oliver Bennett",
                  mitigation="Unified cost-center taxonomy agreed and applied before cutover.", status=RiskStatus.CLOSED)
        make_milestone(db, p8.id, name="All Regions Live", description="All five regions cut over to the consolidated ERP.",
                       due_date=date(2026, 5, 15), status=MilestoneStatus.COMPLETED)
        db.add(Budget(project_id=p8.id, initial_budget=p8.budget, currency="USD"))
        for desc, amt, cat, d in [
            ("ERP platform licensing", 5000000, "Software", date(2025, 3, 1)),
            ("Systems integrator program team", 9500000, "Labor", date(2025, 6, 1)),
            ("Regional training & change management", 1800000, "Labor", date(2026, 2, 1)),
            ("Audit trail module development", 1200000, "Software", date(2025, 9, 1)),
        ]:
            db.add(BudgetTransaction(project_id=p8.id, description=desc, amount=Decimal(str(amt)), category=cat, date=d))

        db.commit()
        return {"organization_id": str(org.id), "projects_created": [p.name for p in created]}
    finally:
        db.close()


if __name__ == "__main__":
    result = seed()
    print(f"Enterprise PMO seed complete: organization {result['organization_id']}")
    for name in result["projects_created"]:
        print(f"  - {name}")
