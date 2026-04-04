from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings

from app.api.health import router as health_router
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.projects import router as projects_router
from app.api.v1.members import router as members_router
from app.api.v1.task_lists import router as task_lists_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.assignees import router as assignees_router
from app.api.v1.subtasks import router as subtasks_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.comments import router as comments_router
from app.api.v1.attachments import router as attachments_router
from app.api.v1.watchers import router as watchers_router
from app.api.v1.activity import router as activity_router
from app.api.v1.slack import router as slack_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.saved_filters import router as saved_filters_router
from app.api.v1.audit import router as audit_router
from app.api.v1.search import router as search_router
from app.api.v1.system import router as system_router
from app.api.v1.starred import router as starred_router
from app.api.v1.clients import router as clients_router

app = FastAPI(title="WLM Desk API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["projects"])
app.include_router(members_router, prefix="/api/v1/projects", tags=["members"])
app.include_router(task_lists_router, prefix="/api/v1", tags=["task-lists"])
app.include_router(tasks_router, prefix="/api/v1", tags=["tasks"])
app.include_router(assignees_router, prefix="/api/v1", tags=["assignees"])
app.include_router(subtasks_router, prefix="/api/v1", tags=["subtasks"])
app.include_router(comments_router, prefix="/api/v1", tags=["comments"])
app.include_router(attachments_router, prefix="/api/v1", tags=["attachments"])
app.include_router(watchers_router, prefix="/api/v1", tags=["watchers"])
app.include_router(activity_router, prefix="/api/v1", tags=["activity"])
app.include_router(slack_router, prefix="/api/v1/slack", tags=["slack"])
app.include_router(notifications_router, prefix="/api/v1/notifications", tags=["notifications"])
app.include_router(saved_filters_router, prefix="/api/v1/saved-filters", tags=["saved-filters"])
app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(audit_router, prefix="/api/v1/audit", tags=["audit"])
app.include_router(search_router, prefix="/api/v1/search", tags=["search"])
app.include_router(system_router, prefix="/api/v1/system", tags=["system"])
app.include_router(starred_router, prefix="/api/v1", tags=["starred"])
app.include_router(clients_router, prefix="/api/v1/clients", tags=["clients"])
