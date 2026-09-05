from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin,
    ai,
    analytics,
    audit,
    auth,
    automations,
    budgets,
    consulting,
    dashboard,
    demo,
    documents,
    feedback,
    meetings,
    milestones,
    notifications,
    pmo,
    projects,
    reports,
    resources,
    risks,
    tasks,
)
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.middleware import SecurityHeadersMiddleware
from app.repositories.documents import fail_stuck_processing_documents


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Anything still PENDING/PROCESSING the instant this process boots cannot legitimately still
    # be in progress -- process_document (app/services/document_pipeline.py) only ever runs
    # inside this same process, so a fresh process starting means whatever was running it before
    # is gone for good. Cutoff is "now" (not the usual few-minutes grace window) since nothing
    # this process has done yet could have created a real in-progress document. Complements,
    # rather than replaces, the lazy per-request reap in app/api/documents.py, which also catches
    # a document orphaned without the whole process restarting (e.g. a worker killed mid-task).
    db = SessionLocal()
    try:
        fail_stuck_processing_documents(
            db, datetime.now(timezone.utc), "Process interrupted by server restart. Please re-upload."
        )
    finally:
        db.close()
    yield


app = FastAPI(title="AI Project Command Center API", version="0.1.0", lifespan=lifespan)

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"http://localhost:\d+" if settings.ENVIRONMENT == "development" else None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(demo.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(milestones.router)
app.include_router(resources.router)
app.include_router(risks.router)
app.include_router(budgets.router)
app.include_router(dashboard.router)
app.include_router(ai.router)
app.include_router(analytics.router)
app.include_router(reports.router)
app.include_router(documents.router)
app.include_router(admin.router)
app.include_router(feedback.router)
app.include_router(consulting.router)
app.include_router(pmo.router)
app.include_router(meetings.router)
app.include_router(automations.router)
app.include_router(notifications.router)
app.include_router(audit.router)


@app.get("/health")
@app.get("/api/v1/health")
def health_check() -> dict:
    # Plain dict, no DB call -- must stay this cheap since it's hit by Render's own liveness
    # probe plus an external keep-alive ping (see .github/workflows/backend-keepalive.yml) every
    # few minutes. Registered under both paths: the bare one for direct Render-origin checks
    # (docs/DEPLOYMENT_HANDOVER.md), the /api/v1 one so it's also reachable through the frontend's
    # same-origin proxy (next.config.ts only rewrites that prefix) without a CORS-exempt special case.
    return {
        "status": "healthy",
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
