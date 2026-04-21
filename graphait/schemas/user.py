import uuid
from pydantic import BaseModel, EmailStr
from graphait.models.user import UserRole


class RegisterRequest(BaseModel):
    org_name: str
    org_slug: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    org_id: uuid.UUID

    model_config = {"from_attributes": True}
