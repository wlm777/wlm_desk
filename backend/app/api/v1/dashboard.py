from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.dashboard import DashboardSummary, HighPriorityTask, ProjectProgress, StuckTask, WorkloadItem
from app.services import dashboard as dashboard_service

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
async def get_dashboard_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_summary(db, user)


@router.get("/workload", response_model=list[WorkloadItem])
async def get_workload(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_workload(db, user)


@router.get("/stuck", response_model=list[StuckTask])
async def get_stuck_tasks(
    days: int = Query(5, ge=1, le=30),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_stuck_tasks(db, user, days=days, limit=limit)


@router.get("/high-priority", response_model=list[HighPriorityTask])
async def get_high_priority_tasks(
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_high_priority_tasks(db, user, limit=limit)


@router.get("/project-progress", response_model=list[ProjectProgress])
async def get_project_progress(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.get_project_progress(db, user)
