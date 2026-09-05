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
    ResourceMatrixRowOut,
    ResourceOut,
    ResourceUpdate,
)
from app.services.common import compute_resource_workload, compute_utilization_state
from app.services.resource_state import compute_all_resource_states, compute_resource_project_matrix

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


@router.get("/resources/matrix", response_model=list[ResourceMatrixRowOut])
def get_resource_project_matrix(
    principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)
) -> list[ResourceMatrixRowOut]:
    """Cross-project resource x allocation grid with single-point-of-failure flagging — see
    app/services/resource_state.py's compute_resource_project_matrix for the real, computed
    definition of both overallocation and SPOF. Declared before /resources/{resource_id}-shaped
    routes would be (there are none in this router today, but this ordering note protects future
    additions) since FastAPI matches path routes in declaration order and "matrix" would
    otherwise be captured as a :resource_id path parameter."""
    rows = compute_resource_project_matrix(db, principal.organization_id)
    return [
        ResourceMatrixRowOut(
            resource_id=row.resource_id,
            resource_name=row.resource_name,
            role=row.role,
            utilization_state=row.utilization_state,
            workload_hours=row.workload_hours,
            capacity_hours=row.capacity_hours,
            allocations=[
                {
                    "project_id": c.project_id,
                    "project_name": c.project_name,
                    "allocation_percent": c.allocation_percent,
                    "is_single_point_of_failure": c.is_single_point_of_failure,
                }
                for c in row.allocations
            ],
        )
        for row in rows
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
