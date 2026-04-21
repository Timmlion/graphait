import uuid
from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str
    slug: str


class OrganizationRead(BaseModel):
    id: uuid.UUID
    name: str
    slug: str

    model_config = {"from_attributes": True}
