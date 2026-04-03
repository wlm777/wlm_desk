import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.saved_filter import SavedFilterCreate, SavedFilterRead, SavedFilterUpdate
from app.services import saved_filter as filter_service

router = APIRouter()


@router.get("", response_model=list[SavedFilterRead])
async def list_saved_filters(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await filter_service.get_filters(db, user.id)


@router.post("", response_model=SavedFilterRead, status_code=status.HTTP_201_CREATED)
async def create_saved_filter(
    data: SavedFilterCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sf = await filter_service.create_filter(db, user.id, data)
    await db.commit()
    return sf


@router.put("/{filter_id}", response_model=SavedFilterRead)
async def update_saved_filter(
    filter_id: uuid.UUID,
    data: SavedFilterUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sf = await filter_service.get_filter_by_id(db, filter_id)
    if not sf or sf.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    sf = await filter_service.update_filter(db, sf, data)
    await db.refresh(sf)
    await db.commit()
    return sf


@router.delete("/{filter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_filter(
    filter_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sf = await filter_service.get_filter_by_id(db, filter_id)
    if not sf or sf.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await filter_service.delete_filter(db, sf)
    await db.commit()
