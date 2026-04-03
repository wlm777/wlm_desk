import logging
import os
import shutil
import uuid

from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_preview_token
from app.models.attachment import Attachment
from app.schemas.attachment import IMAGE_MIME_PREFIXES, INLINE_MIME_TYPES

logger = logging.getLogger(__name__)

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv",
    "application/zip",
}

THUMB_SIZE = (120, 120)
PREVIEW_MAX_WIDTH = 640


def validate_mime_type(content_type: str) -> bool:
    return content_type in ALLOWED_MIME_TYPES


def is_image_mime(mime: str | None) -> bool:
    return mime is not None and mime in IMAGE_MIME_PREFIXES


def _base_dir() -> str:
    return settings.attachments_dir


def _safe_resolve(relative_path: str) -> str:
    """Resolve a relative path inside attachments dir. Raises ValueError on traversal."""
    base = os.path.realpath(_base_dir())
    resolved = os.path.realpath(os.path.join(base, relative_path))
    if not resolved.startswith(base + os.sep) and resolved != base:
        raise ValueError("Path traversal detected")
    return resolved


def _task_dir(project_id: uuid.UUID, task_id: uuid.UUID) -> str:
    return os.path.join(_base_dir(), str(project_id), str(task_id))


def generate_safe_name(original_filename: str) -> str:
    ext = ""
    if "." in original_filename:
        ext = "." + original_filename.rsplit(".", 1)[1].lower()
    return f"{uuid.uuid4().hex}{ext}"


async def save_file(
    content: bytes,
    safe_name: str,
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    mime_type: str | None = None,
    thumb_size: int = THUMB_SIZE[0],
    preview_max_width: int = PREVIEW_MAX_WIDTH,
) -> str:
    """Save original file and generate image variants if applicable.
    Returns relative path from attachments_dir: {project_id}/{task_id}/original/{safe_name}
    """
    task_path = _task_dir(project_id, task_id)
    original_dir = os.path.join(task_path, "original")
    os.makedirs(original_dir, exist_ok=True)

    original_path = os.path.join(original_dir, safe_name)
    with open(original_path, "wb") as f:
        f.write(content)

    # Generate image variants (thumb + preview)
    if is_image_mime(mime_type) and mime_type != "image/svg+xml":
        try:
            _generate_variants(task_path, safe_name, original_path, thumb_size, preview_max_width)
        except Exception:
            logger.exception("Failed to generate image variants for %s", safe_name)

    return f"{project_id}/{task_id}/original/{safe_name}"


def _generate_variants(task_path: str, safe_name: str, original_path: str, thumb_sz: int = 120, preview_w: int = 640) -> None:
    """Generate thumbnail and preview variants for an image."""
    img = Image.open(original_path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Thumbnail (square crop)
    thumb_dir = os.path.join(task_path, "thumb")
    os.makedirs(thumb_dir, exist_ok=True)
    thumb = img.copy()
    thumb.thumbnail((thumb_sz * 2, thumb_sz * 2), Image.LANCZOS)
    # Center crop to square
    w, h = thumb.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    thumb = thumb.crop((left, top, left + side, top + side))
    thumb = thumb.resize((thumb_sz, thumb_sz), Image.LANCZOS)
    thumb.save(os.path.join(thumb_dir, safe_name), quality=80)

    # Preview (max width, preserve aspect ratio)
    preview_dir = os.path.join(task_path, "preview")
    os.makedirs(preview_dir, exist_ok=True)
    preview = img.copy()
    if preview.width > preview_w:
        ratio = preview_w / preview.width
        preview = preview.resize(
            (preview_w, int(preview.height * ratio)), Image.LANCZOS
        )
    preview.save(os.path.join(preview_dir, safe_name), quality=85)


def get_variant_path(file_path: str, variant: str) -> str | None:
    """Get path for a variant (thumb, preview) given the original file_path.
    Returns full filesystem path, or None if variant doesn't exist.
    """
    # file_path format: {project_id}/{task_id}/original/{safe_name}
    parts = file_path.split("/")
    if len(parts) < 4 or parts[-2] != "original":
        # Legacy flat path — return original
        return None
    try:
        variant_path = _safe_resolve(os.path.join(parts[0], parts[1], variant, parts[-1]))
    except ValueError:
        return None
    if os.path.exists(variant_path):
        return variant_path
    return None


def get_file_full_path(relative_path: str) -> str:
    """Get full filesystem path for a file. Handles both new and legacy paths."""
    try:
        full = _safe_resolve(relative_path)
    except ValueError:
        return os.path.join(_base_dir(), "invalid")
    if os.path.exists(full):
        return full
    # Legacy fallback: file might be in flat dir
    legacy = _safe_resolve(os.path.basename(relative_path))
    if os.path.exists(legacy):
        return legacy
    return full


def delete_file(relative_path: str) -> None:
    """Delete a file and its variants."""
    try:
        full_path = _safe_resolve(relative_path)
    except ValueError:
        logger.warning("Path traversal attempt in delete_file: %s", relative_path)
        return
    if os.path.exists(full_path):
        os.remove(full_path)

    # Also delete variants if they exist
    parts = relative_path.split("/")
    if len(parts) >= 4 and parts[-2] == "original":
        for variant in ("thumb", "preview"):
            vpath = os.path.join(_base_dir(), parts[0], parts[1], variant, parts[-1])
            if os.path.exists(vpath):
                os.remove(vpath)

    # Legacy flat file
    legacy = os.path.join(_base_dir(), os.path.basename(relative_path))
    if os.path.exists(legacy) and legacy != full_path:
        os.remove(legacy)


def delete_task_files(project_id: uuid.UUID, task_id: uuid.UUID) -> None:
    """Delete entire task attachment folder."""
    task_path = _task_dir(project_id, task_id)
    if os.path.exists(task_path):
        shutil.rmtree(task_path, ignore_errors=True)


def delete_project_files(project_id: uuid.UUID) -> None:
    """Delete entire project attachment folder."""
    project_path = os.path.join(_base_dir(), str(project_id))
    if os.path.exists(project_path):
        shutil.rmtree(project_path, ignore_errors=True)


def build_preview_url(attachment_id: uuid.UUID) -> str:
    token = create_preview_token(str(attachment_id))
    return f"/api/v1/attachments/{attachment_id}/preview?token={token}"


def build_signed_url(attachment_id: uuid.UUID, action: str) -> str:
    token = create_preview_token(str(attachment_id))
    return f"/api/v1/attachments/{attachment_id}/{action}?token={token}"


def enrich_attachment(attachment: Attachment) -> dict:
    """Convert attachment to dict with signed URLs."""
    mime = attachment.mime_type or ""
    img = is_image_mime(mime)

    data = {
        "id": attachment.id,
        "task_id": attachment.task_id,
        "file_name": attachment.file_name,
        "file_size": attachment.file_size,
        "uploaded_by": attachment.uploaded_by,
        "mime_type": mime or None,
        "is_image": img,
        "preview_url": build_signed_url(attachment.id, "preview") if img else None,
        "thumb_url": build_signed_url(attachment.id, "thumb") if img else None,
        "view_url": build_signed_url(attachment.id, "view") if mime in INLINE_MIME_TYPES else None,
        "download_url": build_signed_url(attachment.id, "download"),
        "created_at": attachment.created_at,
        "updated_at": attachment.updated_at,
    }
    return data


async def create_attachment(
    db: AsyncSession,
    task_id: uuid.UUID,
    file_path: str,
    file_name: str,
    file_size: int,
    uploaded_by: uuid.UUID,
    mime_type: str | None = None,
) -> Attachment:
    attachment = Attachment(
        task_id=task_id,
        file_path=file_path,
        file_name=file_name,
        file_size=file_size,
        mime_type=mime_type,
        uploaded_by=uploaded_by,
    )
    db.add(attachment)
    await db.flush()
    return attachment


async def get_attachments(db: AsyncSession, task_id: uuid.UUID) -> list[Attachment]:
    result = await db.execute(
        select(Attachment).where(Attachment.task_id == task_id).order_by(Attachment.created_at)
    )
    return list(result.scalars().all())


async def get_attachment_by_id(db: AsyncSession, attachment_id: uuid.UUID) -> Attachment | None:
    return await db.get(Attachment, attachment_id)


async def delete_attachment(db: AsyncSession, attachment: Attachment) -> None:
    delete_file(attachment.file_path)
    await db.delete(attachment)
    await db.flush()
