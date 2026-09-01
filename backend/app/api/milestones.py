from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.milestone import Milestone
from app.repositories.milestones import get_milestone, list_milestones_for_project
from app.repositories.projects import get_project
from app.schemas.milestone import MilestoneCreate, MilestoneOut, MilestoneUpdate

router = APIRouter(prefix="/api/v1", tags=["milestones"])


@router.get("/projects/{project_id}/milestones", response_model=list[MilestoneOut])
def list_project_milestones(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[Milestone]:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    return list_milestones_for_project(db, principal.organization_id, project_id)


@router.post(
    "/projects/{project_id}/milestones", response_model=MilestoneOut, status_code=status.HTTP_201_CREATED
)
def create_milestone(
    project_id: UUID,
    payload: MilestoneCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> Milestone:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    milestone = Milestone(project_id=project_id, **payload.model_dump())
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.patch("/milestones/{milestone_id}", response_model=MilestoneOut)
def update_milestone(
    milestone_id: UUID,
    payload: MilestoneUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> Milestone:
    milestone = get_milestone(db, principal.organization_id, milestone_id)
    if milestone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="milestone not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(milestone, field, value)
    db.commit()
    db.refresh(milestone)
    return milestone


@router.delete("/milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(
    milestone_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    milestone = get_milestone(db, principal.organization_id, milestone_id)
    if milestone is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="milestone not found")
    db.delete(milestone)
    db.commit()
