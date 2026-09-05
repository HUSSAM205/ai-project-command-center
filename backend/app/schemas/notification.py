from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import NotificationCategory


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    category: NotificationCategory
    title: str
    message: str
    entity_type: str | None
    entity_id: UUID | None
    is_read: bool
    created_at: datetime


class NotificationListOut(BaseModel):
    """GET /notifications' real response: the org's recent notification feed (read + unread, most
    recent first) plus a real unread_count for the bell's badge -- returning only-unread would make
    the "mark all read"/category tabs UI unable to show anything once everything is read."""

    notifications: list[NotificationOut]
    unread_count: int
