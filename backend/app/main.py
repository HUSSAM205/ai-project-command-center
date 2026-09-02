from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin,
    ai,
    analytics,
    auth,
    budgets,
    consulting,
    dashboard,
    demo,
    documents,
    feedback,
    milestones,
    pmo,
    projects,
    reports,
    resources,
    risks,
    tasks,
)
from app.core.config import settings
from app.core.middleware import SecurityHeadersMiddleware

app = FastAPI(title="AI Project Command Center API", version="0.1.0")

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


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "environment": settings.ENVIRONMENT}
