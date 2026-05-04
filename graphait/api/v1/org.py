from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.config.loader import load_org, save_org, OrgConfig
from graphait.models.user import User

router = APIRouter()


class OrgSettingsRead(BaseModel):
    org_id: str
    org_name: str
    org_slug: str
    system_prompt: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    default_model: Optional[str] = None
    search_api_key: Optional[str] = None
    project_dir: Optional[str] = None


class OrgSettingsPatch(BaseModel):
    system_prompt: Optional[str] = None
    openrouter_api_key: Optional[str] = None
    default_model: Optional[str] = None
    search_api_key: Optional[str] = None
    project_dir: Optional[str] = None


def _read_response(user: User, cfg: OrgConfig) -> OrgSettingsRead:
    return OrgSettingsRead(
        org_id=str(user.org_id),
        org_name=user.organization.name,
        org_slug=user.organization.slug,
        system_prompt=cfg.system_prompt,
        openrouter_api_key=cfg.openrouter_api_key,
        default_model=cfg.default_model,
        search_api_key=cfg.search_api_key,
        project_dir=cfg.project_dir,
    )


@router.get("", response_model=OrgSettingsRead)
def get_org_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _read_response(current_user, load_org())


@router.patch("", response_model=OrgSettingsRead)
def patch_org_settings(
    body: OrgSettingsPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cfg = load_org()
    if body.system_prompt is not None:
        cfg.system_prompt = body.system_prompt
    if body.openrouter_api_key is not None:
        cfg.openrouter_api_key = body.openrouter_api_key
    if body.default_model is not None:
        cfg.default_model = body.default_model
    if body.search_api_key is not None:
        cfg.search_api_key = body.search_api_key
    if body.project_dir is not None:
        cfg.project_dir = body.project_dir
    save_org(cfg)
    return _read_response(current_user, cfg)
