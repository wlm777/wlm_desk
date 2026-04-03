from fastapi import APIRouter
from sqlalchemy import text
from redis.asyncio import from_url as redis_from_url

from app.core.config import settings
from app.db.session import engine

router = APIRouter()


@router.get("/health")
async def health_check():
    status = {"status": "ok", "postgres": False, "redis": False}

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        status["postgres"] = True
    except Exception:
        status["status"] = "degraded"

    try:
        redis = redis_from_url(settings.redis_url)
        await redis.ping()
        await redis.aclose()
        status["redis"] = True
    except Exception:
        status["status"] = "degraded"

    return status
