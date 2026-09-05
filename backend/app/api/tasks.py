from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.task import Task, TaskDependency
from app.repositories.projects import get_project
from app.repositories.resources import list_resources
from app.repositories.tasks import get_dependency, get_task, list_tasks_for_project
from app.schemas.task import (
    CandidateOut,
    SuggestAssigneesRequest,
    TaskCreate,
    TaskDependencyCreate,
    TaskDependencyOut,
    TaskOut,
    TaskUpdate,
)
from app.services.audit import log_audit_event
from app.services.resource_state import compute_all_resource_states
from app.services.resource_optimization import rank_candidates

router = APIRouter(prefix="/api/v1", tags=["tasks"])


def _get_task_or_404(db: Session, organization_id: UUID, task_id: UUID) -> Task:
    task = get_task(db, organization_id, task_id)
    if task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="task not found")
    return task


@router.get("/projects/{project_id}/tasks", response_model=list[TaskOut])
def list_project_tasks(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[Task]:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    return list_tasks_for_project(db, principal.organization_id, project_id)


@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: UUID,
    payload: TaskCreate,
    request: Request,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> Task:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    task = Task(project_id=project_id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    if task.assignee_id is not None:
        log_audit_event(
            db,
            organization_id=principal.organization_id,
            actor_user_id=principal.user_id,
            action="task.assigned",
            entity_type="task",
            entity_id=task.id,
            metadata={"assignee_id": str(task.assignee_id)},
            request=request,
            actor_email=principal.email,
            session_id=principal.session_id,
        )
    return task


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task_detail(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> Task:
    return _get_task_or_404(db, principal.organization_id, task_id)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    request: Request,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> Task:
    task = _get_task_or_404(db, principal.organization_id, task_id)
    changed_fields = payload.model_dump(exclude_unset=True)
    for field, value in changed_fields.items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    if "assignee_id" in changed_fields:
        log_audit_event(
            db,
            organization_id=principal.organization_id,
            actor_user_id=principal.user_id,
            action="task.assigned",
            entity_type="task",
            entity_id=task.id,
            metadata={"assignee_id": str(task.assignee_id) if task.assignee_id else None},
            request=request,
            actor_email=principal.email,
            session_id=principal.session_id,
        )
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    task = _get_task_or_404(db, principal.organization_id, task_id)
    db.delete(task)
    db.commit()


@router.post(
    "/tasks/{task_id}/dependencies", response_model=TaskDependencyOut, status_code=status.HTTP_201_CREATED
)
def add_task_dependency(
    task_id: UUID,
    payload: TaskDependencyCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> TaskDependency:
    task = _get_task_or_404(db, principal.organization_id, task_id)
    depends_on = _get_task_or_404(db, principal.organization_id, payload.depends_on_task_id)
    if depends_on.id == task.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="a task cannot depend on itself")
    dependency = TaskDependency(task_id=task.id, depends_on_task_id=depends_on.id)
    db.add(dependency)
    db.commit()
    db.refresh(dependency)
    return dependency


@router.delete("/tasks/{task_id}/dependencies/{dependency_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_dependency_by_id(
    task_id: UUID,
    dependency_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    dependency = get_dependency(db, principal.organization_id, dependency_id)
    if dependency is None or dependency.task_id != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dependency not found")
    db.delete(dependency)
    db.commit()


@router.delete("/tasks/{task_id}/dependencies", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_dependency_by_pair(
    task_id: UUID,
    payload: TaskDependencyCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    """Matches the frontend contract: DELETE /tasks/{id}/dependencies with
    {depends_on_task_id} in the body, removing that specific dependency edge."""
    task = _get_task_or_404(db, principal.organization_id, task_id)
    dependency = next(
        (d for d in task.dependencies if d.depends_on_task_id == payload.depends_on_task_id), None
    )
    if dependency is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="dependency not found")
    db.delete(dependency)
    db.commit()


@router.post("/tasks/{task_id}/suggest-assignees", response_model=list[CandidateOut])
def suggest_assignees(
    task_id: UUID,
    payload: SuggestAssigneesRequest = SuggestAssigneesRequest(),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[CandidateOut]:
    task = _get_task_or_404(db, principal.organization_id, task_id)
    resources = list_resources(db, principal.organization_id)
    resource_states = compute_all_resource_states(db, principal.organization_id)
    workloads = {rid: workload for rid, (workload, _state) in resource_states.items()}
    ranked = rank_candidates(task.required_skills, resources, workloads)
    return [
        CandidateOut(
            resource_id=UUID(c.resource_id),
            resource_name=c.resource_name,
            skill_match_pct=c.skill_match_pct,
            availability_pct=c.availability_pct,
            cost_score=c.cost_score,
            overall=c.overall,
            explanation=c.explanation,
        )
        for c in ranked[: payload.limit]
    ]
