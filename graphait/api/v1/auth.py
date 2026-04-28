import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.models.organization import Organization
from graphait.models.user import User, UserRole
from graphait.modules.auth.service import hash_password, verify_password, create_access_token
from graphait.schemas.user import RegisterRequest, LoginRequest, TokenResponse, UserRead
from graphait.api.deps import get_current_user
from graphait.config.loader import AgentConfig, save_agent, init_config_dir

router = APIRouter()


def _email_to_slug(email: str) -> str:
    prefix = email.split("@")[0]
    slug = re.sub(r"[^a-z0-9]+", "-", prefix.lower()).strip("-")
    return slug or "user"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(Organization).filter(Organization.slug == body.org_slug).first():
        raise HTTPException(status_code=400, detail="Org slug already taken")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    org = Organization(name=body.org_name, slug=body.org_slug)
    db.add(org)
    db.flush()

    agent_id = _email_to_slug(body.email)
    user = User(org_id=org.id, email=body.email,
                password_hash=hash_password(body.password),
                role=UserRole.admin, agent_id=agent_id)
    db.add(user)
    db.commit()
    db.refresh(user)

    # Create human agent config file
    init_config_dir()
    name = body.email.split("@")[0].replace(".", " ").replace("-", " ").title()
    save_agent(AgentConfig(
        id=agent_id, name=name, role_title="Team Member", type="human",
        model="", api_key=None, working_dir=f"./workspaces/{agent_id}",
        reports_to=None, schedule_interval=0, schedule_enabled=False,
        tools=[], skills=[], system_prompt="",
    ))

    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user
