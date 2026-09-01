import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_principal, CurrentPrincipal
from app.core.security import create_access_token, hash_password, verify_password
from app.models.enums import UserRole
from app.models.organization import Organization
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _slugify(name: str) -> str:
    base = "-".join(name.strip().lower().split())
    base = "".join(c for c in base if c.isalnum() or c == "-") or "org"
    return base


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    slug_base = _slugify(payload.organization_name)
    slug = slug_base
    suffix = 1
    while db.scalar(select(Organization).where(Organization.slug == slug)) is not None:
        suffix += 1
        slug = f"{slug_base}-{suffix}"

    organization = Organization(name=payload.organization_name, slug=slug, is_demo=False)
    db.add(organization)
    db.flush()

    existing = db.scalar(
        select(User).where(User.organization_id == organization.id, User.email == payload.email)
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email already registered")

    user = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role.value, read_only=False
    )
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")

    token = create_access_token(
        user_id=user.id, organization_id=user.organization_id, role=user.role.value, read_only=False
    )
    log_audit_event(
        db,
        organization_id=user.organization_id,
        actor_user_id=user.id,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        metadata={"email": user.email},
    )
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(
    principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)
) -> UserOut:
    if principal.read_only:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no user for a demo session")
    user = db.scalar(
        select(User).where(User.organization_id == principal.organization_id, User.id == principal.user_id)
    )
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    return UserOut.model_validate(user)
