from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class RegisterRequest(BaseModel):
    organization_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    email: str
    full_name: str
    role: UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class DemoSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    organization_id: UUID
    organization_name: str
    read_only: bool = True
    # Synthetic viewer identity so this response satisfies the same {access_token, user}
    # shape as /auth/login and /auth/register (frontend/lib/types.ts::AuthResponse) even
    # though no real user account backs an anonymous demo session.
    user: UserOut
