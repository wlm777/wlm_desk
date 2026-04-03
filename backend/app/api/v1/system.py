import os
import shutil

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import UserRole
from app.models.user import User
from app.services import system_settings as ss_service

router = APIRouter()

APP_VERSION = "1.0.0"


class StorageInfo(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
    max_upload_size_mb: int
    allowed_file_types: list[str]
    preview_max_width: int
    thumbnail_size: int
    slack_digest_hour: int


class SystemInfo(BaseModel):
    app_version: str
    storage_path: str
    database_connected: bool
    attachments_dir_exists: bool


class SystemSettingsResponse(BaseModel):
    storage: StorageInfo
    system: SystemInfo


class SystemSettingsUpdate(BaseModel):
    max_upload_size_mb: int | None = None
    allowed_file_types: list[str] | None = None
    image_preview_max_width: int | None = None
    image_thumbnail_size: int | None = None
    slack_digest_hour: int | None = None


def _get_dir_size(path: str) -> int:
    total = 0
    if not os.path.exists(path):
        return 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            try:
                total += os.path.getsize(fp)
            except OSError:
                pass
    return total


def _get_disk_info(path: str) -> tuple[int, int, int]:
    try:
        usage = shutil.disk_usage(path if os.path.exists(path) else "/")
        return usage.total, usage.used, usage.free
    except OSError:
        return 0, 0, 0


def _require_admin(user: User) -> None:
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")


@router.get("", response_model=SystemSettingsResponse)
async def get_system_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    ss = await ss_service.get_settings(db)
    att_dir = settings.attachments_dir
    used_bytes = _get_dir_size(att_dir)
    total, _, free = _get_disk_info(att_dir)

    db_ok = True
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    allowed = [t.strip() for t in ss.allowed_file_types.split(",") if t.strip()]

    return SystemSettingsResponse(
        storage=StorageInfo(
            total_bytes=total,
            used_bytes=used_bytes,
            free_bytes=free,
            max_upload_size_mb=ss.max_upload_size_mb,
            allowed_file_types=allowed,
            preview_max_width=ss.image_preview_max_width,
            thumbnail_size=ss.image_thumbnail_size,
            slack_digest_hour=ss.slack_digest_hour,
        ),
        system=SystemInfo(
            app_version=APP_VERSION,
            storage_path=att_dir,
            database_connected=db_ok,
            attachments_dir_exists=os.path.exists(att_dir),
        ),
    )


@router.put("", response_model=SystemSettingsResponse)
async def update_system_settings(
    data: SystemSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_admin(user)

    ss = await ss_service.get_settings(db)
    update = data.model_dump(exclude_unset=True)

    # Validate
    if "max_upload_size_mb" in update:
        v = update["max_upload_size_mb"]
        if not (1 <= v <= 500):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Max upload size must be 1–500 MB")
        ss.max_upload_size_mb = v

    if "allowed_file_types" in update:
        types = update["allowed_file_types"]
        for t in types:
            if "/" not in t:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid MIME type: {t}")
        ss.allowed_file_types = ",".join(types)

    if "image_preview_max_width" in update:
        v = update["image_preview_max_width"]
        if not (100 <= v <= 2000):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Preview width must be 100–2000 px")
        ss.image_preview_max_width = v

    if "image_thumbnail_size" in update:
        v = update["image_thumbnail_size"]
        if not (50 <= v <= 500):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Thumbnail size must be 50–500 px")
        ss.image_thumbnail_size = v

    if "slack_digest_hour" in update:
        v = update["slack_digest_hour"]
        if not (0 <= v <= 23):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Digest hour must be 0–23")
        ss.slack_digest_hour = v

    await db.flush()
    await db.refresh(ss)
    await db.commit()

    # Return full response
    return await get_system_settings(user=user, db=db)
