from fastapi import APIRouter, Depends, HTTPException, status
from graphait.api.deps import get_current_user
from graphait.config.loader import load_skill, save_skill, delete_skill, list_skills
from graphait.models.user import User
from graphait.schemas.skill import SkillCreate, SkillUpdate, SkillRead

router = APIRouter()


def _get_or_404(skill_id: str) -> SkillRead:
    content = load_skill(skill_id)
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return SkillRead(id=skill_id, name=skill_id.replace("-", " ").title(), content=content)


@router.get("", response_model=list[SkillRead])
def list_skills_endpoint(_: User = Depends(get_current_user)):
    return [SkillRead(**s) for s in list_skills()]


@router.post("", response_model=SkillRead, status_code=status.HTTP_201_CREATED)
def create_skill(body: SkillCreate, _: User = Depends(get_current_user)):
    if load_skill(body.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Skill '{body.id}' already exists")
    save_skill(body.id, body.content)
    return SkillRead(id=body.id, name=body.name, content=body.content)


@router.get("/{skill_id}", response_model=SkillRead)
def get_skill(skill_id: str, _: User = Depends(get_current_user)):
    return _get_or_404(skill_id)


@router.patch("/{skill_id}", response_model=SkillRead)
def update_skill(skill_id: str, body: SkillUpdate, _: User = Depends(get_current_user)):
    existing = _get_or_404(skill_id)
    new_content = body.content if body.content is not None else existing.content
    new_name = body.name if body.name is not None else existing.name
    save_skill(skill_id, new_content)
    return SkillRead(id=skill_id, name=new_name, content=new_content)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_skill_endpoint(skill_id: str, _: User = Depends(get_current_user)):
    _get_or_404(skill_id)
    delete_skill(skill_id)
