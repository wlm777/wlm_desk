import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models import UserRole
from app.models.client import Client
from app.models.user import User
from app.schemas.common import PaginatedResponse

router = APIRouter()


class ClientCreate(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    notes: str | None = None


class ClientRead(BaseModel):
    id: uuid.UUID
    name: str
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    notes: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


@router.get("", response_model=PaginatedResponse[ClientRead])
async def list_clients(
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Client).where(Client.is_active.is_(True)).order_by(Client.name)
    count_q = select(func.count()).select_from(Client).where(Client.is_active.is_(True))
    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(q.offset(offset).limit(limit))
    return PaginatedResponse(items=list(result.scalars().all()), total=total, limit=limit, offset=offset)


@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
async def create_client(
    data: ClientCreate,
    user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    client = Client(
        name=data.name.strip(),
        email=data.email,
        phone=data.phone,
        company=data.company,
        notes=data.notes,
    )
    db.add(client)
    await db.flush()
    await db.refresh(client)
    await db.commit()
    return client


@router.put("/{client_id}", response_model=ClientRead)
async def update_client(
    client_id: uuid.UUID,
    data: ClientUpdate,
    user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    update = data.model_dump(exclude_unset=True)
    for k, v in update.items():
        setattr(client, k, v)
    await db.flush()
    await db.refresh(client)
    await db.commit()
    return client


@router.get("/with-counts", response_model=list[dict])
async def list_clients_with_counts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models import Project
    result = await db.execute(
        select(Client.id, Client.name, Client.company, func.count(Project.id).label("project_count"))
        .outerjoin(Project, (Project.client_id == Client.id) & Project.is_archived.is_(False))
        .where(Client.is_active.is_(True))
        .group_by(Client.id, Client.name, Client.company)
        .order_by(func.count(Project.id).desc())
    )
    return [{"id": r.id, "name": r.name, "company": r.company, "project_count": r.project_count} for r in result.all()]


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: uuid.UUID,
    user: User = Depends(require_role(UserRole.admin, UserRole.manager)),
    db: AsyncSession = Depends(get_db),
):
    client = await db.get(Client, client_id)
    if not client:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    client.is_active = False
    await db.commit()
