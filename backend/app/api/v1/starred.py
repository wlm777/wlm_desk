import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.starred_project import StarredProject
from app.models.user import User

router = APIRouter()


class StarredProjectRead(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    model_config = {"from_attributes": True}


@router.get("/starred-projects", response_model=list[StarredProjectRead])
async def list_starred(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StarredProject).where(StarredProject.user_id == user.id)
    )
    return list(result.scalars().all())


@router.post("/starred-projects/{project_id}", status_code=status.HTTP_201_CREATED)
async def star_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(StarredProject).where(
            StarredProject.user_id == user.id,
            StarredProject.project_id == project_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status.HTTP_409_CONFLICT, "Already starred")
    star = StarredProject(user_id=user.id, project_id=project_id)
    db.add(star)
    await db.commit()
    return {"ok": True}


@router.delete("/starred-projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unstar_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StarredProject).where(
            StarredProject.user_id == user.id,
            StarredProject.project_id == project_id,
        )
    )
    star = result.scalar_one_or_none()
    if not star:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await db.delete(star)
    await db.commit()
