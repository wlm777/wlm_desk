import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import Project, ProjectMember, UserRole
from app.models.task import Task
from app.models.task_list import TaskList
from app.models.user import User

router = APIRouter()

RESULT_LIMIT = 5  # per entity type


class SearchResult(BaseModel):
    type: str  # "project" | "task" | "list"
    id: uuid.UUID
    title: str
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    list_id: uuid.UUID | None = None
    list_name: str | None = None


@router.get("", response_model=list[SearchResult])
async def global_search(
    q: str = Query("", min_length=0, max_length=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = q.strip()
    if not q:
        return []

    term = f"%{q}%"

    # Build set of project IDs this user can access
    if user.role == UserRole.admin:
        accessible_project_ids = None  # None means all
    else:
        result = await db.execute(
            select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
        )
        accessible_project_ids = {row[0] for row in result.all()}
        if not accessible_project_ids:
            return []

    results: list[SearchResult] = []

    # --- Search projects ---
    pq = select(Project).where(
        Project.name.ilike(term),
        Project.is_archived.is_(False),
    )
    if accessible_project_ids is not None:
        pq = pq.where(Project.id.in_(accessible_project_ids))
    pq = pq.order_by(Project.name).limit(RESULT_LIMIT)
    for p in (await db.execute(pq)).scalars():
        results.append(SearchResult(
            type="project", id=p.id, title=p.name,
            project_id=p.id, project_name=p.name,
        ))

    # --- Search task lists ---
    lq = (
        select(TaskList, Project.name.label("pname"))
        .join(Project, Project.id == TaskList.project_id)
        .where(TaskList.name.ilike(term), TaskList.is_archived.is_(False), Project.is_archived.is_(False))
    )
    if accessible_project_ids is not None:
        lq = lq.where(TaskList.project_id.in_(accessible_project_ids))
    lq = lq.order_by(TaskList.name).limit(RESULT_LIMIT)
    for row in (await db.execute(lq)).all():
        tl = row[0]
        pname = row[1]
        results.append(SearchResult(
            type="list", id=tl.id, title=tl.name,
            project_id=tl.project_id, project_name=pname,
            list_id=tl.id, list_name=tl.name,
        ))

    # --- Search tasks ---
    tq = (
        select(Task, Project.name.label("pname"), TaskList.name.label("lname"))
        .join(Project, Project.id == Task.project_id)
        .join(TaskList, TaskList.id == Task.list_id)
        .where(Task.title.ilike(term), Task.is_archived.is_(False), Project.is_archived.is_(False))
    )
    if accessible_project_ids is not None:
        tq = tq.where(Task.project_id.in_(accessible_project_ids))
    tq = tq.order_by(Task.title).limit(RESULT_LIMIT)
    for row in (await db.execute(tq)).all():
        task = row[0]
        pname = row[1]
        lname = row[2]
        results.append(SearchResult(
            type="task", id=task.id, title=task.title,
            project_id=task.project_id, project_name=pname,
            list_id=task.list_id, list_name=lname,
        ))

    return results
