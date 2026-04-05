import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import check_task_access, get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models import UserRole
from app.schemas.comment import CommentCreate, CommentRead, CommentUpdate
from app.services import audit as audit_service
from app.services import comment as comment_service
from app.services import mention as mention_service
from app.services import notification as notif_service
from app.services import task as task_service
from app.services import task_assignee as assignee_service
from app.services import task_watcher as watcher_service

router = APIRouter()


@router.get("/tasks/{task_id}/comments", response_model=list[CommentRead])
async def list_comments(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await check_task_access(task, user, db)
    return await comment_service.get_comments(db, task_id)


@router.post("/tasks/{task_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    task_id: uuid.UUID,
    data: CommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    # Enforce max 1 nesting level: parent_id must point to a root comment
    if data.parent_id:
        parent = await comment_service.get_comment_by_id(db, data.parent_id)
        if not parent:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Parent comment not found")
        if parent.parent_id is not None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Replies to replies are not allowed (max 1 nesting level)",
            )

    comment = await comment_service.create_comment(db, task_id, user.id, data)
    await task_service.touch_task_activity(db, task, user.id)
    await audit_service.log_action(
        db, "comment", comment.id, "created", user.id,
        {"task_id": str(task_id), "comment_id": str(comment.id)},
    )

    # --- Notification logic (priority: mention > watcher > assignee/creator) ---
    base_payload = {
        "task_id": str(task_id),
        "project_id": str(task.project_id),
        "comment_id": str(comment.id),
        "task_title": task.title,
        "author": user.full_name,
    }
    dedup = f"{task_id}:comment:{comment.id}"

    # Track who has been notified to enforce single-notification-per-user
    notified: set[uuid.UUID] = {user.id}  # exclude comment author

    # 1. Mentioned users (highest priority)
    mentioned_ids = await mention_service.resolve_mentions(db, data.content)
    for uid in mentioned_ids:
        if uid in notified:
            continue
        await notif_service.create_notification(
            db, uid, "mention", base_payload, dedup_key=dedup,
        )
        notified.add(uid)

    # 2. Watchers (skip if already mentioned)
    watcher_ids = await watcher_service.get_watcher_user_ids(db, task_id)
    for uid in watcher_ids:
        if uid in notified:
            continue
        await notif_service.create_notification(
            db, uid, "watcher_comment", base_payload, dedup_key=dedup,
        )
        notified.add(uid)

    # 3. Assignees + creator (lowest priority, skip if already notified)
    assignees = await assignee_service.get_assignees(db, task_id)
    for a in assignees:
        if a.user_id in notified:
            continue
        await notif_service.create_notification(
            db, a.user_id, "comment_added", base_payload, dedup_key=dedup,
        )
        notified.add(a.user_id)

    if task.created_by_id not in notified:
        await notif_service.create_notification(
            db, task.created_by_id, "comment_added", base_payload, dedup_key=dedup,
        )

    await db.commit()

    # Slack: notify all recipients
    from app.models import Project
    from app.services import slack_notify
    project = await db.get(Project, task.project_id)
    all_target_ids = list(notified - {user.id})
    await slack_notify.notify_users(
        db, all_target_ids, "comment", task.title,
        project.name if project else "", user.full_name,
        actor_id=user.id, project_id=task.project_id, task_id=task_id,
        task_priority=task.priority.value,
    )

    return comment


@router.put("/comments/{comment_id}", response_model=CommentRead)
async def update_comment(
    comment_id: uuid.UUID,
    data: CommentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await comment_service.get_comment_by_id(db, comment_id)
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if comment.author_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Can only edit your own comments")
    comment.content = data.content
    comment.content_rich = data.content_rich
    await db.flush()
    await db.refresh(comment)
    await db.commit()
    return comment


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    comment = await comment_service.get_comment_by_id(db, comment_id)
    if not comment:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    if comment.author_id != user.id and user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Can only delete your own comments")
    await db.delete(comment)
    await db.commit()
