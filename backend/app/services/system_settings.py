"""System settings service — single-row config table."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_settings import SystemSettings


async def get_settings(db: AsyncSession) -> SystemSettings:
    """Get the single system settings row. Creates default if missing."""
    result = await db.execute(select(SystemSettings).limit(1))
    row = result.scalar_one_or_none()
    if not row:
        row = SystemSettings(
            max_upload_size_mb=10,
            allowed_file_types=(
                "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,"
                "application/pdf,application/msword,"
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
                "application/vnd.ms-excel,"
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,"
                "application/vnd.ms-powerpoint,"
                "application/vnd.openxmlformats-officedocument.presentationml.presentation,"
                "text/plain,text/csv,application/zip"
            ),
            image_preview_max_width=640,
            image_thumbnail_size=120,
            slack_digest_hour=8,
        )
        db.add(row)
        await db.flush()
        await db.refresh(row)
    return row


def get_allowed_types_set(settings: SystemSettings) -> set[str]:
    """Parse the comma-separated allowed_file_types into a set."""
    return {t.strip() for t in settings.allowed_file_types.split(",") if t.strip()}
