from fastapi import APIRouter, Depends, HTTPException, Query
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.config.loader import load_org
from graphait.models.user import User

router = APIRouter()

IGNORE = {'.git', '.venv', 'venv', '__pycache__', 'node_modules', '.DS_Store', '.worktrees'}


class FileEntry(BaseModel):
    name: str
    path: str       # relative to project_dir, forward-slash separated
    is_dir: bool
    size: Optional[int] = None


class FileContent(BaseModel):
    path: str
    content: str
    is_markdown: bool


def _project_root() -> Path:
    cfg = load_org()
    if not cfg.project_dir:
        raise HTTPException(status_code=422, detail="project_dir is not configured in org settings")
    p = Path(cfg.project_dir)
    if not p.is_dir():
        raise HTTPException(status_code=422, detail=f"project_dir does not exist: {cfg.project_dir}")
    return p


def _safe_path(root: Path, relative: str) -> Path:
    target = (root / relative).resolve()
    if not str(target).startswith(str(root.resolve())):
        raise HTTPException(status_code=400, detail="Path traversal not allowed")
    return target


def _list_dir(root: Path, rel: Path, depth: int = 0) -> list[FileEntry]:
    if depth > 3:
        return []
    entries = []
    try:
        items = sorted(rel.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    except PermissionError:
        return []
    for item in items:
        if item.name.startswith('.') or item.name in IGNORE:
            continue
        rel_path = str(item.relative_to(root)).replace('\\', '/')
        if item.is_dir():
            entries.append(FileEntry(name=item.name, path=rel_path, is_dir=True))
            entries.extend(_list_dir(root, item, depth + 1))
        else:
            entries.append(FileEntry(name=item.name, path=rel_path, is_dir=False, size=item.stat().st_size))
    return entries


@router.get("", response_model=list[FileEntry])
def list_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    root = _project_root()
    return _list_dir(root, root)


@router.get("/content", response_model=FileContent)
def get_file_content(
    path: str = Query(..., description="Relative path within project_dir"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    root = _project_root()
    target = _safe_path(root, path)
    if not target.exists() or target.is_dir():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content = target.read_text(errors='replace')
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return FileContent(
        path=path,
        content=content,
        is_markdown=path.endswith('.md'),
    )
