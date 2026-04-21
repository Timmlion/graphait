import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from graphait.database import get_db
from graphait.api.deps import get_current_user
from graphait.models.user import User
from graphait.modules.graph.service import graph_service
from graphait.schemas.graph import RelationshipCreate, RelationshipRead, GraphData

router = APIRouter()


@router.get("", response_model=GraphData)
def get_graph(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return graph_service.get_graph_data(db, current_user.org_id)


@router.post("/relationships", response_model=RelationshipRead, status_code=status.HTTP_201_CREATED)
def create_relationship(body: RelationshipCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        return graph_service.create_relationship(db, current_user.org_id, body)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.delete("/relationships/{rel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_relationship(rel_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not graph_service.delete_relationship(db, rel_id, current_user.org_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")
