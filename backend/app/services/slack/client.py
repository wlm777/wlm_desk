import logging
from urllib.parse import quote

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SLACK_API = "https://slack.com/api"


async def send_message(channel_or_user_id: str, text: str, blocks: list | None = None) -> bool:
    """Send a Slack message. Returns True on success."""
    if not settings.slack_bot_token:
        logger.warning("Slack bot token not configured, skipping message")
        return False

    payload: dict = {"channel": channel_or_user_id, "text": text}
    if blocks:
        payload["blocks"] = blocks

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SLACK_API}/chat.postMessage",
            json=payload,
            headers={"Authorization": f"Bearer {settings.slack_bot_token}"},
            timeout=10,
        )

    data = resp.json()
    if not data.get("ok"):
        logger.error("Slack API error: %s", data.get("error", "unknown"))
        return False
    return True


async def open_dm_channel(slack_user_id: str) -> str | None:
    """Open a DM channel with a user. Returns channel ID."""
    if not settings.slack_bot_token:
        return None

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SLACK_API}/conversations.open",
            json={"users": slack_user_id},
            headers={"Authorization": f"Bearer {settings.slack_bot_token}"},
            timeout=10,
        )

    data = resp.json()
    if not data.get("ok"):
        logger.error("Slack conversations.open error: %s", data.get("error"))
        return None
    return data["channel"]["id"]
