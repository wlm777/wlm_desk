import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import _check_task_edit, check_task_access, get_current_user
from app.core.security import verify_preview_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.attachment import AttachmentRead
from app.services import attachment as attachment_service
from app.services import audit as audit_service
from app.services import task as task_service

router = APIRouter()


@router.post("/tasks/{task_id}/attachments", response_model=AttachmentRead, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    task_id: uuid.UUID,
    file: UploadFile,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    await _check_task_edit(task, user, db)

    # Load system settings for dynamic validation
    from app.services import system_settings as ss_service
    ss = await ss_service.get_settings(db)
    allowed_types = ss_service.get_allowed_types_set(ss)
    max_size = ss.max_upload_size_mb * 1024 * 1024

    content_type = file.content_type or ""
    if content_type not in allowed_types:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File type not allowed: {content_type}")

    content = await file.read()
    if len(content) > max_size:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"File exceeds {ss.max_upload_size_mb} MB limit")

    safe_name = attachment_service.generate_safe_name(file.filename or "file")
    relative_path = await attachment_service.save_file(
        content, safe_name, task.project_id, task_id, mime_type=content_type,
        thumb_size=ss.image_thumbnail_size, preview_max_width=ss.image_preview_max_width,
    )

    attachment = await attachment_service.create_attachment(
        db, task_id, relative_path, file.filename or "file", len(content), user.id,
        mime_type=content_type,
    )
    await task_service.touch_task_activity(db, task, user.id)
    await audit_service.log_action(
        db, "attachment", attachment.id, "uploaded", user.id,
        {"task_id": str(task_id), "file_name": file.filename},
    )
    await db.commit()
    await db.refresh(attachment)

    # Slack: notify assignees + watchers about file upload
    from app.services import slack_notify
    from app.models import Project
    from app.services import task_assignee as asn_svc, task_watcher as w_svc
    project = await db.get(Project, task.project_id)
    assignees = await asn_svc.get_assignees(db, task_id)
    watcher_ids = await w_svc.get_watcher_user_ids(db, task_id)
    target_ids = list({a.user_id for a in assignees} | set(watcher_ids) | {task.created_by_id})
    await slack_notify.notify_users(
        db, target_ids, "file_upload", task.title,
        project.name if project else "", user.full_name,
        actor_id=user.id, project_id=task.project_id, task_id=task_id,
        detail=f"File: {file.filename}", task_priority=task.priority.value,
    )

    return attachment_service.enrich_attachment(attachment)


@router.get("/tasks/{task_id}/attachments", response_model=list[AttachmentRead])
async def list_attachments(
    task_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await task_service.get_task(db, task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await check_task_access(task, user, db)
    attachments = await attachment_service.get_attachments(db, task_id)
    return [attachment_service.enrich_attachment(a) for a in attachments]


@router.get("/attachments/{attachment_id}")
async def download_attachment(
    attachment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attachment = await attachment_service.get_attachment_by_id(db, attachment_id)
    if not attachment:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    task = await task_service.get_task(db, attachment.task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await check_task_access(task, user, db)

    full_path = attachment_service.get_file_full_path(attachment.file_path)
    return FileResponse(
        full_path,
        filename=attachment.file_name,
        media_type=attachment.mime_type or "application/octet-stream",
    )


async def _verify_and_get(attachment_id: uuid.UUID, token: str, db: AsyncSession):
    """Shared verification for signed URL endpoints."""
    verified_id = verify_preview_token(token)
    if verified_id is None or verified_id != str(attachment_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid or expired token")
    attachment = await attachment_service.get_attachment_by_id(db, attachment_id)
    if not attachment:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return attachment


@router.get("/attachments/{attachment_id}/preview")
async def preview_attachment(
    attachment_id: uuid.UUID, token: str, db: AsyncSession = Depends(get_db),
):
    """Serve image preview variant (640px max). Falls back to original."""
    attachment = await _verify_and_get(attachment_id, token, db)
    if not attachment_service.is_image_mime(attachment.mime_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not an image")
    variant = attachment_service.get_variant_path(attachment.file_path, "preview")
    path = variant or attachment_service.get_file_full_path(attachment.file_path)
    return FileResponse(
        path,
        media_type=attachment.mime_type or "image/png",
        headers={"Cache-Control": "private, max-age=1800"},
    )


@router.get("/attachments/{attachment_id}/thumb")
async def thumb_attachment(
    attachment_id: uuid.UUID, token: str, db: AsyncSession = Depends(get_db),
):
    """Serve image thumbnail (120x120). Falls back to original."""
    attachment = await _verify_and_get(attachment_id, token, db)
    if not attachment_service.is_image_mime(attachment.mime_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not an image")
    variant = attachment_service.get_variant_path(attachment.file_path, "thumb")
    path = variant or attachment_service.get_file_full_path(attachment.file_path)
    return FileResponse(
        path,
        media_type=attachment.mime_type or "image/png",
        headers={"Cache-Control": "private, max-age=1800"},
    )


@router.get("/attachments/{attachment_id}/view")
async def view_attachment(
    attachment_id: uuid.UUID, token: str, db: AsyncSession = Depends(get_db),
):
    """Serve file inline in browser (PDF, text, images). No Bearer auth needed."""
    attachment = await _verify_and_get(attachment_id, token, db)
    return FileResponse(
        attachment_service.get_file_full_path(attachment.file_path),
        media_type=attachment.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{attachment.file_name}"',
            "Cache-Control": "private, max-age=1800",
        },
    )


@router.get("/attachments/{attachment_id}/download")
async def download_attachment_signed(
    attachment_id: uuid.UUID, token: str, db: AsyncSession = Depends(get_db),
):
    """Download file as attachment. No Bearer auth needed."""
    attachment = await _verify_and_get(attachment_id, token, db)
    return FileResponse(
        attachment_service.get_file_full_path(attachment.file_path),
        filename=attachment.file_name,
        media_type=attachment.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{attachment.file_name}"',
        },
    )


class PreviewUrlsRequest(BaseModel):
    attachment_ids: list[uuid.UUID]


@router.post("/attachments/preview-urls")
async def get_preview_urls(
    data: PreviewUrlsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate fresh signed preview URLs for a batch of attachment IDs.
    Only returns URLs for image attachments the user has access to."""
    result: dict[str, str] = {}
    for aid in data.attachment_ids[:50]:  # limit batch size
        attachment = await attachment_service.get_attachment_by_id(db, aid)
        if not attachment or not attachment_service.is_image_mime(attachment.mime_type):
            continue
        result[str(aid)] = attachment_service.build_preview_url(aid)
    return result


@router.delete("/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_attachment(
    attachment_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    attachment = await attachment_service.get_attachment_by_id(db, attachment_id)
    if not attachment:
        raise HTTPException(status.HTTP_404_NOT_FOUND)

    task = await task_service.get_task(db, attachment.task_id)
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await _check_task_edit(task, user, db)

    await audit_service.log_action(
        db, "attachment", attachment.id, "deleted", user.id,
        {"task_id": str(attachment.task_id), "file_name": attachment.file_name},
    )
    await attachment_service.delete_attachment(db, attachment)
    await db.commit()
