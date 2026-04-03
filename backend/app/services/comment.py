import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment
from app.schemas.comment import CommentCreate


async def get_comments(db: AsyncSession, task_id: uuid.UUID) -> list[Comment]:
    result = await db.execute(
        select(Comment)
        .where(Comment.task_id == task_id)
        .order_by(Comment.created_at)
    )
    return list(result.scalars().all())


async def create_comment(
    db: AsyncSession, task_id: uuid.UUID, author_id: uuid.UUID, data: CommentCreate
) -> Comment:
    comment = Comment(
        task_id=task_id,
        author_id=author_id,
        content=data.content,
        content_rich=data.content_rich,
        parent_id=data.parent_id,
    )
    db.add(comment)
    await db.flush()
    await db.refresh(comment)
    return comment


async def get_comment_by_id(db: AsyncSession, comment_id: uuid.UUID) -> Comment | None:
    return await db.get(Comment, comment_id)
