import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_filter import SavedFilter
from app.schemas.saved_filter import SavedFilterCreate, SavedFilterUpdate


async def get_filters(db: AsyncSession, user_id: uuid.UUID) -> list[SavedFilter]:
    result = await db.execute(
        select(SavedFilter)
        .where(SavedFilter.user_id == user_id)
        .order_by(SavedFilter.created_at)
    )
    return list(result.scalars().all())


async def get_filter_by_id(db: AsyncSession, filter_id: uuid.UUID) -> SavedFilter | None:
    return await db.get(SavedFilter, filter_id)


async def create_filter(
    db: AsyncSession, user_id: uuid.UUID, data: SavedFilterCreate
) -> SavedFilter:
    sf = SavedFilter(
        user_id=user_id,
        name=data.name,
        filters_json=data.filters_json.model_dump(exclude_none=True),
    )
    db.add(sf)
    await db.flush()
    return sf


async def update_filter(
    db: AsyncSession, sf: SavedFilter, data: SavedFilterUpdate
) -> SavedFilter:
    if data.name is not None:
        sf.name = data.name
    if data.filters_json is not None:
        sf.filters_json = data.filters_json.model_dump(exclude_none=True)
    await db.flush()
    return sf


async def delete_filter(db: AsyncSession, sf: SavedFilter) -> None:
    await db.delete(sf)
    await db.flush()
