"""Background scheduler for periodic tasks. Run: python -m app.worker.scheduler"""

import asyncio
import logging
from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.config import settings
from app.db.session import async_session
from app.models.user import User
from app.services.slack.digest import send_daily_digest
from app.services.due_reminder import scan_and_notify

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("worker")


async def run_digest_check() -> None:
    """Check all users and send Slack digest if their local time matches digest hour and not sent today."""
    async with async_session() as db:
        # Read digest hour from system settings
        from app.services import system_settings as ss_service
        ss = await ss_service.get_settings(db)
        digest_hour = ss.slack_digest_hour

        result = await db.execute(
            select(User).where(
                User.is_active.is_(True),
                User.slack_enabled.is_(True),
                User.slack_webhook_url.isnot(None),
            )
        )
        users = result.scalars().all()

        for user in users:
            # Skip if user has no daily preferences enabled
            if not user.notify_daily_new_tasks and not user.notify_daily_in_progress:
                continue

            try:
                tz = ZoneInfo(user.timezone)
            except Exception:
                tz = ZoneInfo("UTC")

            local_now = datetime.now(tz)

            if local_now.hour != digest_hour:
                continue

            # Dedup: check last_digest_at in user's local timezone
            if user.last_digest_at:
                last_local = user.last_digest_at.astimezone(tz).date()
                today_local = local_now.date()
                if last_local >= today_local:
                    continue

            logger.info("Sending daily digest to %s (tz=%s)", user.email, user.timezone)
            try:
                await send_daily_digest(db, user)
                await db.commit()
            except Exception:
                logger.exception("Failed to send digest to %s", user.email)
                await db.rollback()


async def run_due_reminders() -> None:
    """Scan for overdue/due-today tasks and create notifications."""
    async with async_session() as db:
        try:
            count = await scan_and_notify(db)
            await db.commit()
            if count > 0:
                logger.info("Due date reminders: scanned %d task(s) with due dates", count)
        except Exception:
            logger.exception("Due date reminder scan failed")
            await db.rollback()


async def main() -> None:
    interval = settings.worker_check_interval
    logger.info("Worker started (check interval: %ds)", interval)
    while True:
        try:
            await run_digest_check()
        except Exception:
            logger.exception("Digest check failed")

        try:
            await run_due_reminders()
        except Exception:
            logger.exception("Due reminder check failed")

        await asyncio.sleep(interval)


if __name__ == "__main__":
    asyncio.run(main())
