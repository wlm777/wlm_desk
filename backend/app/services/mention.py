import logging
import re
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import user as user_service

logger = logging.getLogger(__name__)

# Matches @email patterns: @user@example.com
_MENTION_RE = re.compile(r"@([\w.+-]+@[\w.-]+\.\w+)")


def extract_mention_emails(text: str) -> list[str]:
    """Extract all @email mentions from text. Returns list of emails."""
    return _MENTION_RE.findall(text)


async def resolve_mentions(
    db: AsyncSession, text: str
) -> list[uuid.UUID]:
    """Parse @email mentions from text, resolve to user IDs.

    Silently skips emails that don't match an active user.
    Never raises.
    """
    emails = extract_mention_emails(text)
    if not emails:
        return []

    resolved: list[uuid.UUID] = []
    for email in set(emails):  # deduplicate emails
        try:
            user = await user_service.get_user_by_email(db, email)
            if user and user.is_active:
                resolved.append(user.id)
            else:
                logger.debug("Mention @%s: user not found or inactive", email)
        except Exception:
            logger.debug("Mention @%s: failed to resolve", email)
    return resolved
