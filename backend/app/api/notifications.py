from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.repositories.notifications import (
    count_unread_notifications,
    get_notification,
    list_notifications,
    mark_all_read,
)
from app.schemas.notification import NotificationListOut, NotificationOut
from app.services.automation_engine import maybe_evaluate_automations

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListOut)
def get_notifications(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> NotificationListOut:
    """Real, persisted notification feed -- see app/services/automation_engine.py for exactly how
    a notification comes to exist (only when a real automation rule's condition was genuinely met).
    This hot, frequently-polled read path also opportunistically re-evaluates this org's active
    automation rules (at most once every few minutes, see maybe_evaluate_automations) -- the same
    "reconcile lazily on a real request instead of running a scheduler" convention this app already
    uses elsewhere, since this deployment has no background job runner."""
    maybe_evaluate_automations(db, principal.organization_id)
    notifications = list_notifications(db, principal.organization_id)
    unread_count = count_unread_notifications(db, principal.organization_id)
    return NotificationListOut(
        notifications=[NotificationOut.model_validate(n) for n in notifications], unread_count=unread_count
    )


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> NotificationOut:
    notification = get_notification(db, principal.organization_id, notification_id)
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="notification not found")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return NotificationOut.model_validate(notification)


@router.post("/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    mark_all_read(db, principal.organization_id)
