# WLM Desk — Implementation Roadmap

---

## 1. PHASED IMPLEMENTATION PLAN

---

### PHASE 1 — Foundation

**Goal:** Backend core of the system. Nothing works without it.

**Features:**
- All data models + migrations (Alembic)
- JWT authentication (login, me) — no public registration
- RBAC (admin / manager / user)
- CRUD: Users (admin only), Projects, ProjectMembers
- CRUD: TaskLists, Tasks, TaskAssignees, Subtasks
- Task reorder (sort_order)
- Dashboard summary endpoint
- Audit log (action recording)
- Seed data (first admin + test data)
- API versioning (`/api/v1/`)
- Pagination on major collection endpoints (users, projects, tasks, audit)
- Basic search (ILIKE on task title only — no description/comments search)
- Soft delete / archive everywhere (no hard deletes on entities)
- Database indexes for performance
- UTC datetime storage with timezone-safe handling

**Backend work:**

| Component | What we do |
|-----------|-----------|
| Alembic | init, async env.py, first migration, pg_trgm extension |
| Models | User, Project, ProjectMember, TaskList, Task, TaskAssignee, TaskSubtask, Comment (model only), Attachment (model only), AuditLog |
| Schemas | Pydantic request/response for each entity + PaginatedResponse generic |
| Auth | JWT, password hashing (bcrypt), login/me endpoints |
| RBAC | Dependency-based permission checks (including task edit: creator or assignee) |
| Services | Async CRUD functions for each entity |
| API routes | All CRUD endpoints under `/api/v1/`; pagination on users, projects, tasks, audit; search on task title |
| Dashboard | `GET /api/v1/dashboard/summary` — task stats scoped to current user |
| Audit | Lightweight service, called from API layer |
| Seed | Management script for creating admin + demo data |

**Frontend work:**
- Install Tailwind CSS + React Query
- API client (`lib/api.ts`) with JWT, global 401 handling (redirect to login on invalid token)
- Auth utilities (`lib/auth.ts`) with login, logout (clear token + redirect), token management
- Type definitions (`lib/types.ts`) — mirror of backend schemas
- No UI pages yet

**Infra work:**
- Entrypoint script (alembic migrate → uvicorn)
- Update .env (JWT settings)

**Dependencies:** None (first phase)

**Risks:**
- Async Alembic configuration may require debugging
- RBAC logic must be correct from the start — rework is expensive

---

### PHASE 2 — Core MVP (UI + Integration)

**Goal:** Working product with full UI. Team can start using it.

**Features:**
- Login page
- Dashboard (summary widgets)
- Sidebar: project selector + task lists
- Project page: lists → tasks (list view)
- Task detail panel (side panel or modal)
- Add/edit task form
- Subtasks (inline toggle)
- Comments (CRUD API + UI)
- Filters UI (status, priority, assignee, due date)
- Task drag-and-drop reorder
- Timezone display conversion on frontend

**Backend work:**

| Component | What we do |
|-----------|-----------|
| Comments API | CRUD + parent_id threading (max 1 nesting level enforced by backend) |
| Timezone | Store per user, return dates in UTC, frontend converts |

**Frontend work:**

| Page / Component | Endpoint |
|---------------------|----------|
| Login page | `POST /api/v1/auth/login` |
| Sidebar — projects | `GET /api/v1/projects` |
| Sidebar — lists | `GET /api/v1/projects/{id}/lists` |
| Task list view | `GET /api/v1/projects/{id}/tasks?list_id=&status=&...` |
| Task detail panel | `GET /api/v1/tasks/{id}` |
| Task form (add/edit) | `POST/PUT /api/v1/tasks` |
| Subtasks | `GET/POST/PUT /api/v1/tasks/{id}/subtasks` |
| Comments | `GET/POST /api/v1/tasks/{id}/comments` |
| Dashboard | `GET /api/v1/dashboard/summary` |
| Drag reorder | `PATCH /api/v1/tasks/reorder` |

**Infra work:**
- Nginx reverse proxy (optional, for production-like setup)

**Dependencies:** Phase 1 fully completed

**Risks:**
- Drag-and-drop reorder — complex UX+backend synchronization
- Figma→React integration — may require component adaptation

**NOT included in Phase 2:**
- Attachments API (postponed to Phase 3)

**Important:** TaskLists are project categories (e.g. Backlog, Development, Design, QA), NOT status columns. Task status (no_progress / in_progress / completed) is a separate field on the task itself. The UI must keep these concepts visually distinct.

---

### PHASE 3 — MVP+ (Polish & Productivity)

**Goal:** Convenience and productivity. Makes the product "pleasant".

**Features:**
- Attachments (file upload/download, CRUD API + file storage; 10 MB max file size, MIME validation, backend-controlled access)
- Slack daily digest
- Google login (OAuth2)
- Freedcamp import
- Watchers/followers on tasks
- @mentions in comments
- In-app notifications (polling or WebSocket)
- Activity feed (per task, per project)
- Saved filters/views
- Quick add task (keyboard shortcut)
- Batch actions (multi-select tasks → change status/assignee)
- Blocked flag on tasks
- Due date reminders (Redis-based scheduled checks)
- Workload widget (tasks per user), Stuck widget (overdue tasks)

**Backend work:**
- Attachments CRUD API + file storage service (10 MB max, MIME whitelist, access via signed/controlled endpoint)
- Slack integration service (webhook + scheduled digest)
- OAuth2 Google flow
- Freedcamp CSV/API import script
- Notification model + delivery service
- Saved filters model
- Batch update endpoint
- Scheduled jobs (Redis + background worker)

**Frontend work:**
- File upload/download UI
- Notification dropdown
- Activity timeline component
- Filter save/load UI
- Batch select toolbar
- Quick add shortcut handler
- Workload/stuck dashboard widgets
- Google login button

**Infra work:**
- File storage volume in docker-compose
- Background worker container (ARQ or Celery)
- Slack app registration
- Google OAuth credentials

**Dependencies:** Phase 2 fully completed

**Risks:**
- File upload in Docker — needs volume mapping
- Slack API rate limits
- Google OAuth — redirect URI configuration
- Background worker reliability

---

### PHASE 4 — v1.1 / Future

**Features:**
- Task templates
- Slash commands in task descriptions
- Manager digest (weekly summary for managers)
- Linked tasks (dependencies, blocks/blocked-by)
- Slack thread reply sync
- AI rewrite task description
- AI assistant for task clarity scoring

Not detailed — depends on feedback after MVP.

---

## 2. DETAILED PHASE 1 PLAN

### 2.1 — Alembic + SQLAlchemy Base

**New files:**
```
backend/
├── alembic.ini
├── alembic/
│   ├── env.py          # async migrations
│   ├── script.py.mako
│   └── versions/
├── app/db/base.py      # DeclarativeBase
└── entrypoint.sh       # alembic upgrade head && uvicorn
```

**Changes:**
- `requirements.txt` — add `alembic`
- `Dockerfile` — `CMD ["./entrypoint.sh"]`
- `alembic.ini` — `sqlalchemy.url` is read dynamically from env.py

`base.py` uses SQLAlchemy 2.0 `DeclarativeBase` with shared mixins:
```python
class Base(DeclarativeBase):
    pass

class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())
```

All datetime columns use `DateTime(timezone=True)` → PostgreSQL `TIMESTAMP WITH TIME ZONE`.
All values stored in UTC. API returns ISO 8601 with `Z` suffix.

---

### 2.2 — Models

All models in `backend/app/models/`. One file per model.

```
backend/app/models/
├── __init__.py       # re-export all models
├── user.py
├── project.py
├── project_member.py
├── task_list.py
├── task.py
├── task_assignee.py
├── task_subtask.py
├── comment.py        # model only, API in Phase 2
├── attachment.py     # model only, API in Phase 3
└── audit_log.py
```

**Key decisions:**

| Decision | Rationale |
|----------|----------|
| UUID PK everywhere | Safe for API, no count leakage |
| Enum via Python `enum.Enum` + SQLAlchemy `Enum` | Strict typing at DB level |
| TaskList = project category | Lists are categories (Backlog, Development, Design, QA), NOT status columns. Status is a separate Task field |
| `sort_order: Integer` on Task | For drag-and-drop within a list, gap-based (step 1000) |
| `position: Integer` on TaskList | List ordering within project |
| `is_archived: bool` on Project, TaskList, Task, TaskSubtask | Soft delete, no data loss |
| `is_active: bool` on User | Soft deactivation |
| `description_plain` on Task | Plain text for Phase 1. `description_rich` (JSONB) planned for Phase 2+ when rich text editor is added. Migration will add the column; `description_plain` remains as fallback/export |
| `last_activity_at` on Task | Updated on any task-related change |
| `updated_by_id` on Task | FK → User, tracks who made last change |
| Comment.parent_id → self FK | Threaded comments, max 1 nesting level enforced by backend (reject parent_id pointing to a reply) |
| Comment, Attachment — models now, API later | One migration, no rework later |

**Enums:**
```python
class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    user = "user"

class TaskStatus(str, enum.Enum):
    no_progress = "no_progress"
    in_progress = "in_progress"
    completed = "completed"

class TaskPriority(str, enum.Enum):
    none = "none"
    low = "low"
    medium = "medium"
    high = "high"
```

**Owner = automatic member policy:**
- When a project is created, the owner is automatically added as a `ProjectMember`
- `POST /api/v1/projects/{id}/members` rejects adding owner (already a member)
- `DELETE /api/v1/projects/{id}/members/{user_id}` rejects removing owner (cannot remove owner from their project)
- Owner shows in the members list like any other member

**Archived project behavior:**
- Archived project is hidden from default `GET /api/v1/projects` (visible with `?include_archived=true`)
- All lists and tasks inside an archived project become **read-only** (API returns 403 on create/update/reorder attempts)
- Lists and tasks are NOT separately archived — they retain their own `is_archived` state, but the project-level archive acts as a lock
- Unarchiving a project restores full write access

**Soft delete behavior:**
- All list queries filter `is_archived=False` / `is_active=True` by default
- Admin can pass `?include_archived=true` to see archived entities
- `ProjectMember` and `TaskAssignee` — hard delete allowed (link removal, not data loss)

**Database indexes (created in migration):**
```sql
-- Enable trigram extension for ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Task queries (most frequent)
CREATE INDEX ix_tasks_project_id ON tasks(project_id);
CREATE INDEX ix_tasks_list_id ON tasks(list_id);
CREATE INDEX ix_tasks_status ON tasks(status);
CREATE INDEX ix_tasks_priority ON tasks(priority);
CREATE INDEX ix_tasks_created_by_id ON tasks(created_by_id);
CREATE INDEX ix_tasks_due_date ON tasks(due_date);
CREATE INDEX ix_tasks_sort_order ON tasks(list_id, sort_order);
CREATE INDEX ix_tasks_title_search ON tasks USING gin(title gin_trgm_ops);

-- Membership lookups
CREATE INDEX ix_project_members_project_id ON project_members(project_id);
CREATE INDEX ix_project_members_user_id ON project_members(user_id);
CREATE UNIQUE INDEX uq_project_members ON project_members(project_id, user_id);

-- Task assignees
CREATE INDEX ix_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX ix_task_assignees_user_id ON task_assignees(user_id);
CREATE UNIQUE INDEX uq_task_assignees ON task_assignees(task_id, user_id);

-- Audit log queries
CREATE INDEX ix_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX ix_audit_log_actor ON audit_log(actor_user_id);

-- Task lists ordering
CREATE INDEX ix_task_lists_project_position ON task_lists(project_id, position);
```

**First migration:** `alembic revision --autogenerate -m "initial_schema"` — all tables at once.

---

### 2.3 — Pydantic Schemas

```
backend/app/schemas/
├── __init__.py
├── auth.py           # LoginRequest, TokenResponse
├── user.py           # UserCreate, UserRead, UserUpdate
├── project.py        # ProjectCreate, ProjectRead, ProjectUpdate
├── project_member.py
├── task_list.py      # TaskListCreate, TaskListRead, TaskListUpdate, TaskListReorder
├── task.py           # TaskCreate, TaskRead, TaskUpdate, TaskReorder
├── task_assignee.py
├── task_subtask.py
├── audit_log.py      # AuditLogRead (read-only)
├── dashboard.py      # DashboardSummary (fixed fields — see below)
└── common.py         # PaginatedResponse[T]
```

Pattern:
- `Create` — fields for creation (no id, timestamps)
- `Read` — full object (id + timestamps + relations)
- `Update` — all fields `Optional`

Shared pagination schema (used by users, projects, tasks, audit — NOT lists or subtasks):
```python
class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
```

Lists, subtasks, and project members return plain arrays — these collections are small enough per-parent that pagination adds no value. Project members endpoint is designed to be extensible with pagination later if teams grow significantly.

---

### 2.4 — Authentication

**New files:**
```
backend/app/core/
├── security.py    # hash_password, verify_password, create_jwt, decode_jwt
└── deps.py        # get_current_user, require_role(), require_project_access(), require_task_edit_access()
```

**Dependencies:** `passlib[bcrypt]`, `python-jose[cryptography]`

**Endpoints:**
```
POST /api/v1/auth/login     → email + password → JWT (access_token, token_type)
GET  /api/v1/auth/me        → current user (from JWT)
```

**JWT payload:** `{"sub": user_id, "role": role, "exp": ...}`

**Config additions:**
```python
jwt_secret: str = "supersecretkey"
jwt_algorithm: str = "HS256"
jwt_expire_minutes: int = 1440  # 24 hours
```

No refresh tokens — internal system, 24h TTL is enough. Can be added later if needed.

---

### 2.5 — RBAC Implementation

Implementation via FastAPI dependencies:

```python
# Base auth check
async def get_current_user(token, db) -> User

# Role check
def require_role(*roles: UserRole):
    async def checker(user = Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(403)
        return user
    return checker

# Project membership check
async def require_project_access(project_id, user, db) -> User:
    if user.role == UserRole.admin:
        return user
    member = await get_project_member(db, project_id, user.id)
    if not member:
        raise HTTPException(403)
    return user

# Task edit permission check
async def require_task_edit_access(task_id, user, db):
    if user.role == UserRole.admin:
        return
    task = await get_task(db, task_id)
    project_member = await get_project_member(db, task.project_id, user.id)
    if not project_member:
        raise HTTPException(403)
    if user.role == UserRole.manager:
        return  # manager can edit any task in their projects
    # Regular user: must be creator OR assignee
    is_creator = task.created_by_id == user.id
    is_assignee = await is_task_assignee(db, task_id, user.id)
    if not is_creator and not is_assignee:
        raise HTTPException(403, "Can only edit tasks assigned to you or created by you")
```

**Permission matrix:**

| Action | Admin | Manager (member) | User (member) |
|--------|-------|-------------------|---------------|
| Create user | yes | no | no |
| Create project | yes | yes | no |
| View project (member) | yes | yes | yes |
| Manage lists in project | yes | yes | no |
| Create tasks in project | yes | yes | yes |
| Edit any task in project | yes | yes | no |
| Edit task (creator or assignee) | yes | yes | yes |
| Archive project | yes | owner only | no |
| View audit log | yes | no | no |
| View dashboard | yes | yes | yes (own stats) |

---

### 2.6 — Services

```
backend/app/services/
├── __init__.py
├── user.py          # create_user, get_users, get_user_by_id, get_user_by_email, update_user, deactivate_user
├── project.py       # create_project, get_projects_for_user, get_project, update_project, archive_project
├── project_member.py # add_member, remove_member, get_members
├── task_list.py     # create_list, get_lists, update_list, archive_list, reorder_lists
├── task.py          # create_task, get_tasks (filtered+paginated+search), get_task, update_task, archive_task, reorder_tasks
├── task_assignee.py # assign_user, unassign_user, get_assignees, is_task_assignee
├── task_subtask.py  # create_subtask, update_subtask, archive_subtask, toggle_subtask
├── dashboard.py     # get_summary(user) → DashboardSummary
└── audit.py         # log_action(db, entity_type, entity_id, action, actor_id, payload)
```

Each function is `async def`, takes `db: AsyncSession` as first argument. No classes — simple functions.

---

### 2.7 — API Routes

```
backend/app/api/v1/
├── __init__.py
├── auth.py
├── users.py
├── projects.py
├── task_lists.py
├── tasks.py
├── subtasks.py
├── dashboard.py
└── audit.py
```

**Full endpoint list (Phase 1):**

```
# Auth
POST   /api/v1/auth/login
GET    /api/v1/auth/me

# Users (admin only)
GET    /api/v1/users                          ?limit=&offset=&search=
POST   /api/v1/users
GET    /api/v1/users/{id}
PUT    /api/v1/users/{id}
PATCH  /api/v1/users/{id}/deactivate          # soft delete

# Projects
GET    /api/v1/projects                        ?limit=&offset=&include_archived=
POST   /api/v1/projects
GET    /api/v1/projects/{id}
PUT    /api/v1/projects/{id}
PATCH  /api/v1/projects/{id}/archive           # soft delete

# Project Members
GET    /api/v1/projects/{id}/members
POST   /api/v1/projects/{id}/members
DELETE /api/v1/projects/{id}/members/{user_id} # hard delete (link removal)

# Task Lists
GET    /api/v1/projects/{id}/lists
POST   /api/v1/projects/{id}/lists
PUT    /api/v1/lists/{id}
PATCH  /api/v1/lists/{id}/archive              # soft delete
PATCH  /api/v1/projects/{id}/lists/reorder

# Tasks
GET    /api/v1/projects/{id}/tasks             ?list_id=&status=&priority=&assignee_id=&search=&limit=&offset=
POST   /api/v1/projects/{id}/tasks
GET    /api/v1/tasks/{id}
PUT    /api/v1/tasks/{id}
PATCH  /api/v1/tasks/{id}/archive              # soft delete
PATCH  /api/v1/tasks/reorder

# Task Assignees
POST   /api/v1/tasks/{id}/assignees
DELETE /api/v1/tasks/{id}/assignees/{user_id}  # hard delete (link removal)

# Subtasks
GET    /api/v1/tasks/{id}/subtasks
POST   /api/v1/tasks/{id}/subtasks
PUT    /api/v1/subtasks/{id}
PATCH  /api/v1/subtasks/{id}/archive           # soft delete
PATCH  /api/v1/subtasks/{id}/toggle

# Dashboard
GET    /api/v1/dashboard/summary

# Audit (admin only)
GET    /api/v1/audit                           ?entity_type=&entity_id=&actor_id=&limit=&offset=
```

**Total: 32 endpoints in Phase 1**

---

### 2.8 — Frontend Foundation (Phase 1 only)

Infrastructure only, no UI pages:

| File | Purpose |
|------|---------|
| `lib/api.ts` | Fetch wrapper with JWT, base URL, global 401 handling (auto-redirect to login on invalid/expired token) |
| `lib/auth.ts` | Token storage (localStorage), `login()`, `logout()` (clears token + redirects to /login), `getToken()`, `setToken()`, `isAuthenticated()` |
| `lib/types.ts` | TypeScript interfaces mirroring backend schemas |

**DashboardSummary schema (fixed contract for frontend):**
```typescript
interface DashboardSummary {
  my_tasks_count: number;
  in_progress_count: number;
  due_today_count: number;
  overdue_count: number;
  projects_count: number;
}
```

**Install:**
- `tailwindcss` + `@tailwindcss/postcss`
- `@tanstack/react-query`

---

## 3. FRONTEND INTEGRATION STRATEGY

Note: No Figma-exported components in code yet. Frontend is a minimal starter. When Figma export is available, integration strategy:

| UI Component | API Endpoint | Data Flow |
|-------------|-------------|-----------|
| Login form | `POST /api/v1/auth/login` | email+password → JWT → localStorage → redirect to dashboard. Logout clears token + redirects to /login. Global 401 interceptor in api.ts handles expired tokens |
| Sidebar: project list | `GET /api/v1/projects` | React Query → cache → render list |
| Sidebar: task lists | `GET /api/v1/projects/{id}/lists` | Triggered when project selected |
| Task list view | `GET /api/v1/projects/{id}/tasks?list_id=X` | Filtered query, sorted by sort_order |
| Task detail panel | `GET /api/v1/tasks/{id}` | Opens on task click, loads full task + subtasks + assignees |
| Task form | `POST/PUT /api/v1/tasks` | Form state → API call → invalidate query cache |
| Subtask toggles | `PATCH /api/v1/subtasks/{id}/toggle` | Optimistic update via React Query |
| Drag reorder | `PATCH /api/v1/tasks/reorder` | Update local sort_order → debounced API call |
| Dashboard | `GET /api/v1/dashboard/summary` | Aggregated stats |

**Data flow pattern:**
```
Component → useQuery/useMutation (React Query) → api.ts (fetch + JWT) → Backend → DB
```

---

## 4. TASK REORDER (sort_order)

**Scope:** Reorder applies to tasks **within a single list**. Cross-list moves are handled by task update (`PUT /api/v1/tasks/{id}` with `list_id` + `sort_order`).

**Backend:**

- Each task has `sort_order: Integer`
- On task creation: `sort_order = max(sort_order in list) + 1000`
- Gap-based strategy: step 1000 between tasks
- Reorder endpoint accepts array of tasks within the same list: `[{task_id, sort_order}]`

```
PATCH /api/v1/tasks/reorder
Body: { list_id: UUID, items: [{ id: UUID, sort_order: int }, ...] }
```

Backend validates all task IDs belong to the specified `list_id`.

**Response:** Returns the updated list of tasks with normalized `sort_order` values, so frontend can sync state without a separate fetch:
```json
{
  "items": [
    { "id": "...", "sort_order": 1000 },
    { "id": "...", "sort_order": 2000 },
    { "id": "...", "sort_order": 3000 }
  ]
}
```

**Algorithm on drag-and-drop (within list):**
1. User drags task between two others in the same list
2. Frontend calculates new `sort_order = (prev.sort_order + next.sort_order) / 2`
3. If gap < 1 — frontend sends full reorder of the entire list (recalc with step 1000)
4. Backend: single transaction, batch UPDATE

**Cross-list move (different list):**
```
PUT /api/v1/tasks/{id}
Body: { list_id: new_list_id, sort_order: calculated_value }
```
This is a regular task update, not a reorder operation.

**Default sorting:**
- **Project task list view** (all tasks in project): by `task_list.position` ASC, then by `task.sort_order` ASC
- **List-scoped task view** (tasks in one list): by `task.sort_order` ASC

**Why gap-based:** Minimum API calls. 99% of operations — one PATCH with one task. Full reorder only when gaps are exhausted (very rare).

---

## 5. AUDIT LOG

**Minimal implementation:**

Model `AuditLog` is in the schema. Service:

```python
# services/audit.py
async def log_action(
    db: AsyncSession,
    entity_type: str,      # "task", "project", "user", ...
    entity_id: UUID,
    action: str,           # "created", "updated", "archived", "status_changed", ...
    actor_id: UUID,
    payload: dict | None   # meaningful diff only — see below
):
    entry = AuditLog(...)
    db.add(entry)
    # No separate commit — commits together with the main operation
```

**Payload stores meaningful diffs only, NOT full snapshots:**
```python
# Good — only changed fields with old → new values
{"changes": {"status": ["no_progress", "in_progress"], "priority": ["low", "high"]}}

# Good — creation with key fields
{"title": "New task", "list": "Development", "priority": "high"}

# Bad — full entity snapshot (wasteful, hard to read)
{"task": {"id": "...", "title": "...", "description": "...", ...all fields...}}
```

**Called from API layer (not from service):**
```python
@router.put("/tasks/{id}")
async def update_task(...):
    old = await task_service.get_task(db, id)
    updated = await task_service.update_task(db, id, data)
    changes = compute_diff(old, data)  # only fields that actually changed
    if changes:
        await audit.log_action(db, "task", id, "updated", user.id, {"changes": changes})
    await db.commit()
    return updated
```

**Why in API layer:** We know actor_id (from auth), we know context. Service layer stays clean.
**Why diffs only:** Audit table stays small. Diffs are human-readable. Full snapshots bloat JSONB columns and are hard to interpret.

**API for reading (admin only):**
```
GET /api/v1/audit?entity_type=task&entity_id=xxx&limit=50&offset=0
```

---

## 6. SEED DATA

**Script:** `backend/app/seed.py` (run via `python -m app.seed`)

**Structure:**

```
Admin User:
  email: admin@wlm.local
  password: admin123
  role: admin
  full_name: Admin
  timezone: UTC

Demo Users:
  - manager@wlm.local  / manager / "Project Manager" / Europe/Kyiv
  - user1@wlm.local    / user123 / "Developer One"   / Europe/Kyiv
  - user2@wlm.local    / user123 / "Developer Two"   / UTC

Demo Project:
  name: "WLM Desk Development"
  owner: admin
  members: [manager, user1, user2]

  Lists (categories, NOT status columns):
    - Backlog (position: 0)
    - Development (position: 1)
    - Design (position: 2)
    - QA (position: 3)

  Tasks (in Backlog):
    - "Set up CI/CD pipeline" / high / status: no_progress / assigned: user1
    - "Write API documentation" / low / status: no_progress / assigned: manager

  Tasks (in Development):
    - "Implement auth" / high / status: in_progress / assigned: user1
      subtasks:
        - "JWT generation" (completed)
        - "Login endpoint" (completed)
        - "RBAC middleware" (not completed)
    - "Design database schema" / medium / status: completed / assigned: user1, user2

  Tasks (in Design):
    - "Create wireframes for dashboard" / medium / status: in_progress / assigned: user2

  Tasks (in QA):
    - "Docker setup verification" / medium / status: completed / assigned: user1
```

Script is idempotent: checks if `admin@wlm.local` exists → skip. Safe to run repeatedly.

---

## 7. KEY TECHNICAL DECISIONS & TRADEOFFS

| Decision | Alternative | Why |
|----------|------------|-----|
| Functions > classes for services | Repository pattern | MVP doesn't need abstraction, functions are simpler to test |
| Gap-based sort_order | Linked list, fractional indexing | Simple, works well up to ~1000 reorders without recalc |
| Audit in API layer | Middleware / event system | Explicit, controllable, no magic |
| JWT without refresh | Refresh token rotation | Internal system, 24h is enough |
| All models in first migration | One per migration | Single atomic migration is simpler for rollback |
| Comment/Attachment models now, API later | Everything in Phase 1 | Doesn't block backend, UI needed later |
| RBAC via dependencies | Decorator-based / middleware | FastAPI-idiomatic, composition > inheritance |
| No public registration | Self-service signup | Business requirement: admin creates users |
| Soft delete everywhere | Hard delete | Data preservation, audit trail, undo capability |
| UTC storage + user timezone | Server-local time | Correct for distributed/multi-timezone teams |
| `last_activity_at` on Task | Query-based calculation | Fast reads, avoids expensive aggregation |
| pg_trgm for ILIKE search | Full-text search (tsvector) | Simple to implement, sufficient for title-only search in Phase 1 |
| Pagination on major endpoints only | Paginate everything | Lists/subtasks are small per-parent; pagination adds no value there |
| Pagination via limit/offset | Cursor-based | Simpler, sufficient for internal tool scale |
| Reorder within list only | Global reorder | Simpler, matches UX (drag within a category). Cross-list = task update |
| Audit diffs only | Full snapshots | Keeps table small, human-readable, avoids JSONB bloat |
| `updated_by_id` on Task | Audit log only | Quick "last editor" display without querying audit |
| Owner = auto member | Separate owner concept | Simplifies queries; owner always in members list; no orphan owner edge cases |
| Archived project = read-only children | Cascade archive to children | Children keep their own state; project-level lock is simpler and reversible |

---

## 8. DATETIME HANDLING

- All `datetime` columns stored as `TIMESTAMP WITH TIME ZONE` in PostgreSQL
- SQLAlchemy: `mapped_column(DateTime(timezone=True))`
- All values stored in UTC
- API always returns ISO 8601 with `Z` suffix: `"2026-03-31T15:00:00Z"`
- `User.timezone` field (e.g. `"Europe/Kyiv"`) — frontend converts for display
- Backend never converts — UTC in, UTC out

---

## 9. TASK MODEL — ADDITIONAL FIELDS

```python
class Task:
    # ... standard fields ...
    last_activity_at: Mapped[datetime]        # updated on any change: edit, subtask toggle, assignee change, comment (Phase 2)
    updated_by_id: Mapped[UUID | None]        # FK → User, who made last change
```

`last_activity_at` is updated by:
- Task edit (title, description, status, priority, dates)
- Subtask add/toggle/archive
- Assignee add/remove
- Comment add (Phase 2)

---

## 10. TASK EDIT PERMISSIONS

Strict enforcement for regular users:

| User Role | Can edit |
|-----------|---------|
| Admin | Any task |
| Manager (project member) | Any task in their projects |
| User (project member) | Only tasks they created OR are assigned to |

Non-members cannot see or edit project tasks at all (enforced by `require_project_access`).

---

## 11. APPLIED CLARIFICATIONS LOG

The following clarifications were applied to this roadmap:

1. **TaskList = category, not status.** Seed data uses Backlog, Development, Design, QA — not status-like names.
2. **Task statuses strictly separate from lists.** `no_progress`, `in_progress`, `completed` are on the Task model, independent of which list the task belongs to.
3. **Regular users can create tasks** in projects where they are members.
4. **Pagination on major endpoints only.** Users, projects, tasks, audit get `limit/offset`. Lists and subtasks return plain arrays.
5. **Task search = title only in Phase 1.** No description or comment search until later phases.
6. **Default sorting defined.** Project view: `task_list.position` ASC → `task.sort_order` ASC. List-scoped view: `task.sort_order` ASC.
7. **Reorder = within a list.** `PATCH /api/v1/tasks/reorder` requires `list_id`. Cross-list moves use `PUT /api/v1/tasks/{id}` with `list_id` + `sort_order`.
8. **Comments: max 1 nesting level.** Backend rejects `parent_id` pointing to a reply (Phase 2).
9. **Attachments constraints (Phase 3).** 10 MB max file size, MIME whitelist, backend-controlled access.
10. **Frontend auth flow.** Must include logout, global 401 interceptor in api.ts, auto-redirect to /login on invalid/expired token.
11. **Audit payload = meaningful diffs only.** Store changed fields with old → new values, not full entity snapshots.
12. **Project members: no pagination for MVP** but endpoint designed for future extensibility. Members, lists, subtasks return plain arrays.
13. **`description_rich` (JSONB) planned** for Phase 2+ rich text editor. Phase 1 uses `description_plain` only. Column will be added via migration; `description_plain` remains as fallback.
14. **Reorder response returns normalized sort_order** so frontend can sync without refetch.
15. **DashboardSummary fields fixed:** `my_tasks_count`, `in_progress_count`, `due_today_count`, `overdue_count`, `projects_count`.
16. **Owner = automatic project member.** Owner is auto-added to `project_members` on project creation. Cannot be removed or re-added.
17. **Archived project = read-only.** Lists/tasks inside are NOT separately archived, but all writes are blocked. Unarchive restores access.

---

## 12. FIGMA DESIGN INTEGRATION

**Source:** `WLM-DESK-PROJECT-EXPORT.md` (Figma export, 2026-03-31)

The design is a **UI/UX reference only**. The approved roadmap and backend domain model are the source of truth.

### 12.1 — Design ↔ Backend Mismatches (resolved)

| Area | Design Value | Backend Value | Resolution |
|------|-------------|---------------|------------|
| Task status | `todo`, `in-progress`, `review`, `completed` | `no_progress`, `in_progress`, `completed` | `todo` → `no_progress`. Drop `review`. Only 3 statuses |
| Task priority | `low`, `medium`, `high`, `urgent` | `none`, `low`, `medium`, `high` | Drop `urgent`. Add `none` to UI |
| User roles | `admin`, `member`, `viewer` | `admin`, `manager`, `user` | `member` → `user`. Drop `viewer`. Add `manager` |
| Tags on tasks | `tags: string[]` | Not in domain model | **Dropped entirely** |
| Project/list color | `color` field | Not in model | **Dropped** (cosmetic, not in any phase) |
| Online status | User online/offline | Not tracked | **Dropped** |
| Nested data | subtasks/comments/activity arrays in Task | Separate entities, own endpoints | Frontend fetches separately |
| Router | React Router v7 + Vite | Next.js App Router | **Full rewrite** to App Router |
| Activity tab | ActivityItem in task details | Audit log (admin only Phase 1) | **Phase 3** — activity feed per task |

### 12.2 — Status & Priority Colors (adapted)

**Status:**
| Value | UI Label | Color |
|-------|----------|-------|
| `no_progress` | No Progress | Gray `#6b7280` |
| `in_progress` | In Progress | Blue `#3b82f6` |
| `completed` | Completed | Green `#22c55e` |

**Priority:**
| Value | UI Label | Color |
|-------|----------|-------|
| `none` | None | Light gray `#d1d5db` |
| `low` | Low | Gray `#9ca3af` |
| `medium` | Medium | Blue `#3b82f6` |
| `high` | High | Orange `#f97316` |

### 12.3 — Component Phase Mapping

**Phase 2 (Core MVP UI):**
- Sidebar: project selector, lists, nav (Dashboard/Users)
- Header: project-scoped search, "+ New Task" button, user profile
- Dashboard: overview cards (from DashboardSummary), quick actions
- Project Page: task list grouped by lists, filters, task rows
- Task Details Panel: status/priority/assignees/due date, tabs (Overview, Subtasks, Comments)
- Add Task Modal: title, description, project, list, priority, assignees, due date
- Users Page: user cards with role/task count (admin only)
- Login Page: **not in design, built from scratch** using same design system
- shadcn/ui components: reuse all (button, badge, checkbox, dialog, dropdown, input, select, tabs, etc.)

**Phase 3 (MVP+):**
- Dashboard: Team Workload widget, Stuck Tasks widget
- Sidebar: Saved Views (My Tasks, Overdue, High Priority, etc.)
- Task Details: Activity tab
- Settings Page: profile, notifications, appearance, team
- Header: notifications bell + NotificationPanel
- Recharts (charts library) — only needed for Phase 3 widgets

**Dropped from all phases:**
- Tags UI (not in domain model)
- `urgent` priority badge
- `review` status badge
- Online/offline indicators
- `ImageWithFallback` Figma component
- Project/list color indicators

### 12.4 — Next.js Route Structure (adapted from design)

```
frontend/src/app/
├── login/page.tsx                        # Phase 2 (not in design, new)
├── (dashboard)/
│   ├── layout.tsx                        # AuthGuard + AppShell (Sidebar + Header)
│   ├── page.tsx                          # Dashboard
│   ├── projects/[id]/page.tsx            # Project page with tasks
│   ├── users/page.tsx                    # Users management (admin)
│   └── settings/page.tsx                 # Settings (Phase 3)
```

### 12.5 — Frontend Dependencies (adapted)

**Keep from design:**
- `lucide-react` — icons
- `@radix-ui/*` + shadcn/ui components — UI primitives
- `tailwind-merge` + `class-variance-authority` — styling utilities
- `date-fns` — date formatting

**Replace:**
- `react-router` → Next.js App Router (built-in)
- `motion` → optional, can add later for polish
- `vite` → Next.js build (already configured)

**Add (per roadmap):**
- `@tanstack/react-query` — data fetching + cache
- `tailwindcss` v4 + `@tailwindcss/postcss`

**Defer to Phase 3:**
- `recharts` — only needed for workload/stuck widgets
