import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.colors import color_from_id
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    user = User(
        full_name=data.full_name.strip(),
        email=data.email.strip(),
        password_hash=hash_password(data.password),
        role=data.role,
        timezone=data.timezone,
    )
    db.add(user)
    await db.flush()
    # Assign stable color based on ID after flush (ID is generated)
    user.color = color_from_id(str(user.id))
    return user


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


async def get_users(
    db: AsyncSession,
    *,
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    include_inactive: bool = False,
) -> tuple[list[User], int]:
    limit = min(limit, 100)
    q = select(User)
    count_q = select(func.count()).select_from(User)

    if not include_inactive:
        q = q.where(User.is_active.is_(True))
        count_q = count_q.where(User.is_active.is_(True))

    search = (search or "").strip()
    if search:
        pattern = f"%{search}%"
        q = q.where(User.full_name.ilike(pattern) | User.email.ilike(pattern))
        count_q = count_q.where(User.full_name.ilike(pattern) | User.email.ilike(pattern))

    total = (await db.execute(count_q)).scalar() or 0
    result = await db.execute(q.order_by(User.created_at).offset(offset).limit(limit))
    return list(result.scalars().all()), total


async def update_user(db: AsyncSession, user: User, data: UserUpdate) -> User:
    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data:
        user.password_hash = hash_password(update_data.pop("password"))
    for field, value in update_data.items():
        setattr(user, field, value)
    await db.flush()
    await db.refresh(user)
    return user


async def deactivate_user(db: AsyncSession, user: User) -> User:
    user.is_active = False
    await db.flush()
    await db.refresh(user)
    return user
