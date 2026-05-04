import os
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.modules.auth.service import decode_access_token
from graphait.models.user import User, UserRole
from graphait.models.organization import Organization

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if os.getenv("SKIP_AUTH") == "1":
        user = db.query(User).first()
        if not user:
            user = _create_dev_user(db)
        return user
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user_id = payload.get("sub")
    try:
        uid = uuid.UUID(user_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def _create_dev_user(db: Session) -> User:
    from graphait.config.loader import AgentConfig, save_agent, init_config_dir
    org = Organization(name="Dev Org", slug="dev")
    db.add(org)
    db.flush()
    agent_id = "dev"
    user = User(org_id=org.id, email="dev@local", password_hash="", role=UserRole.admin, agent_id=agent_id)
    db.add(user)
    db.commit()
    db.refresh(user)
    init_config_dir()
    save_agent(AgentConfig(
        id=agent_id, name="Dev User", role_title="Admin", type="human",
        model="", api_key=None, working_dir="./workspaces/dev",
        reports_to=None, schedule_interval=0, schedule_enabled=False,
        tools=[], skills=[], system_prompt="",
    ))
    return user
