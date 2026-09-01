from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal
from app.repositories.feedback import create_feedback
from app.schemas.admin import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/api/v1/feedback", tags=["feedback"])


def _user_uuid_or_none(user_id: str) -> UUID | None:
    try:
        return UUID(user_id)
    except (ValueError, TypeError):
        return None


@router.post("", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
def submit_feedback(
    payload: FeedbackCreate,
    # Deliberately `get_current_principal`, not `require_write_access`: any authenticated
    # caller — including an anonymous, read-only demo session — must be able to leave
    # feedback, per the Phase 5 spec.
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> FeedbackOut:
    row = create_feedback(db, principal.organization_id, _user_uuid_or_none(principal.user_id), payload.message)
    return FeedbackOut.model_validate(row)
