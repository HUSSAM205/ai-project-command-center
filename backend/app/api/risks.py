from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.serializers import serialize_risk
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.risk import Risk
from app.repositories.projects import get_project
from app.repositories.risks import get_risk, list_risks_for_project
from app.schemas.risk import RiskCreate, RiskOut, RiskUpdate
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1", tags=["risks"])


@router.get("/projects/{project_id}/risks", response_model=list[RiskOut])
def list_project_risks(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[RiskOut]:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    risks = list_risks_for_project(db, principal.organization_id, project_id)
    return [serialize_risk(r) for r in risks]


@router.post("/projects/{project_id}/risks", response_model=RiskOut, status_code=status.HTTP_201_CREATED)
def create_risk(
    project_id: UUID,
    payload: RiskCreate,
    request: Request,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> RiskOut:
    if get_project(db, principal.organization_id, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    risk = Risk(project_id=project_id, **payload.model_dump())
    db.add(risk)
    db.commit()
    db.refresh(risk)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="risk.created",
        entity_type="risk",
        entity_id=risk.id,
        metadata={"title": risk.title, "category": risk.category.value, "score": risk.probability * risk.impact},
        request=request,
        actor_email=principal.email,
        session_id=principal.session_id,
    )
    return serialize_risk(risk)


@router.patch("/risks/{risk_id}", response_model=RiskOut)
def update_risk(
    risk_id: UUID,
    payload: RiskUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> RiskOut:
    risk = get_risk(db, principal.organization_id, risk_id)
    if risk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="risk not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(risk, field, value)
    db.commit()
    db.refresh(risk)
    return serialize_risk(risk)


@router.delete("/risks/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_risk(
    risk_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    risk = get_risk(db, principal.organization_id, risk_id)
    if risk is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="risk not found")
    db.delete(risk)
    db.commit()
