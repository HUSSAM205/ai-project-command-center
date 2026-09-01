from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token
from app.models.enums import UserRole
from app.models.organization import Organization
from app.schemas.auth import DemoSessionResponse, UserOut

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])

# Sentinel id for the synthetic "viewer" identity attached to demo sessions — no real user
# row backs an anonymous demo session, so this is not a foreign key into `users`.
DEMO_VIEWER_ID = UUID("00000000-0000-0000-0000-000000000000")


@router.post("/session", response_model=DemoSessionResponse, status_code=status.HTTP_201_CREATED)
def create_demo_session(db: Session = Depends(get_db)) -> DemoSessionResponse:
    """Issues a short-lived, read-only JWT scoped to the seeded demo organization.
    No credentials required — this is the entry point for anonymous /demo visitors."""
    organization = db.scalar(select(Organization).where(Organization.is_demo.is_(True)))
    if organization is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="demo organization not seeded yet",
        )

    token = create_access_token(
        user_id=None,
        organization_id=organization.id,
        role="VIEWER",
        read_only=True,
        expires_minutes=120,
    )
    return DemoSessionResponse(
        access_token=token,
        organization_id=organization.id,
        organization_name=organization.name,
        read_only=True,
        user=UserOut(
            id=DEMO_VIEWER_ID,
            organization_id=organization.id,
            email="demo@vertex-technologies.demo",
            full_name="Demo Viewer",
            role=UserRole.VIEWER,
        ),
    )
