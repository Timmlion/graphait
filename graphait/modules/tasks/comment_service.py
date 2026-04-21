import uuid
from sqlalchemy.orm import Session
from graphait.models.task import Comment
from graphait.schemas.comment import CommentCreate


class CommentService:
    def create(self, db: Session, task_id: uuid.UUID, author_id: uuid.UUID, data: CommentCreate, is_system: bool = False) -> Comment:
        comment = Comment(task_id=task_id, author_id=author_id, content=data.content, is_system=is_system)
        db.add(comment)
        db.commit()
        db.refresh(comment)
        return comment

    def list(self, db: Session, task_id: uuid.UUID) -> list[Comment]:
        return db.query(Comment).filter(Comment.task_id == task_id).order_by(Comment.created_at).all()


comment_service = CommentService()
