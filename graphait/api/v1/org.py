from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.user import User

router = APIRouter()


class OrgSettingsRead(BaseModel):
    org_id: str
    org_name: str
    org_slug: str
    openrouter_api_key: Optional[str] = None
    default_model: Optional[str] = None

    model_config = {"from_attributes": True}


class OrgSettingsPatch(BaseModel):
    openrouter_api_key: Optional[str] = None
    default_model: Optional[str] = None


@router.get("", response_model=OrgSettingsRead)
def get_org_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = current_user.organization
    s = org.settings or {}
    return OrgSettingsRead(
        org_id=str(org.id),
        org_name=org.name,
        org_slug=org.slug,
        openrouter_api_key=s.get("openrouter_api_key"),
        default_model=s.get("default_model"),
    )


@router.patch("", response_model=OrgSettingsRead)
def patch_org_settings(
    body: OrgSettingsPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = current_user.organization
    settings = dict(org.settings or {})

    if body.openrouter_api_key is not None:
        settings["openrouter_api_key"] = body.openrouter_api_key
    if body.default_model is not None:
        settings["default_model"] = body.default_model

    org.settings = settings
    db.commit()
    db.refresh(org)

    s = org.settings or {}
    return OrgSettingsRead(
        org_id=str(org.id),
        org_name=org.name,
        org_slug=org.slug,
        openrouter_api_key=s.get("openrouter_api_key"),
        default_model=s.get("default_model"),
    )
