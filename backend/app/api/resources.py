from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.serializers import serialize_resource
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.enums import UtilizationState
from app.models.resource import Resource, ResourceAllocation
from app.repositories.projects import get_project
from app.repositories.resources import get_resource, list_allocations_for_project, list_resources
from app.schemas.resource import (
    ResourceAllocationCreate,
    ResourceAllocationOut,
    ResourceCreate,
    ResourceOut,
    ResourceUpdate,
)
from app.services.common import compute_resource_workload, compute_utilization_state
from app.services.resource_state import compute_all_resource_states

router = APIRouter(prefix="/api/v1", tags=["resources"])


@router.get("/resources", response_model=list[ResourceOut])
def list_all_resources(
    principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)
) -> list[ResourceOut]:
    resources = list_resources(db, principal.organization_id)
    states = compute_all_resource_states(db, principal.organization_id)
    return [
        serialize_resource(r, *states.get(r.id, (0.0, UtilizationState.UNDERUTILIZED))) for r in resources
    ]


@router.post("/resources", response_model=ResourceOut, status_code=status.HTTP_201_CREATED)
def create_resource(
    payload: ResourceCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> ResourceOut:
    resource = Resource(organization_id=principal.organization_id, **payload.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return serialize_resource(resource, 0.0, UtilizationState.UNDERUTILIZED)


@router.patch("/resources/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: UUID,
    payload: ResourceUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> ResourceOut:
    resource = get_resource(db, principal.organization_id, resource_id)
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="resource not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(resource, field, value)
    db.commit()
    db.refresh(resource)
    states = compute_all_resource_states(db, principal.organization_id)
    workload, state = states.get(resource.id, (0.0, UtilizationState.UNDERUTILIZED))
    return serialize_resource(resource, workload, state)


@router.delete("/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource(
    resource_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    resource = get_resource(db, principal.organization_id, resource_id)
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="resource not found")
    db.delete(resource)
    db.commit()


@router.get("/projects/{project_id}/allocations", response_model=list[ResourceAllocationOut])
def list_project_allocations(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[ResourceAllocation]:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    return list_allocations_for_project(db, principal.organization_id, project_id)


@router.post(
    "/projects/{project_id}/allocations",
    response_model=ResourceAllocationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_project_allocation(
    project_id: UUID,
    payload: ResourceAllocationCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> ResourceAllocation:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    resource = get_resource(db, principal.organization_id, payload.resource_id)
    if resource is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="resource not found")
    allocation = ResourceAllocation(project_id=project_id, **payload.model_dump())
    db.add(allocation)
    db.commit()
    db.refresh(allocation)
    return allocation
