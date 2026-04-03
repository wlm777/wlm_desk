# Backend

## API Structure

All endpoints under `/api/v1/`. Registered in `app/main.py`.

| Prefix | Tag | Description |
|--------|-----|-------------|
| `/auth` | auth | Login, register, profile, Google OAuth, test Slack |
| `/users` | users | Admin user management (CRUD) |
| `/projects` | projects | Project CRUD, archive, delete |
| `/projects/{id}/members` | members | Project membership |
| `/projects/{id}/lists` | task-lists | Task list CRUD, reorder |
| `/projects/{id}/tasks` | tasks | Task CRUD, filters, pagination |
| `/tasks/global` | tasks | Cross-project task queries |
| `/tasks/{id}/assignees` | assignees | Task assignment |
| `/tasks/{id}/subtasks` | subtasks | Subtask CRUD, toggle, reorder |
| `/tasks/{id}/comments` | comments | Comment CRUD |
| `/tasks/{id}/attachments` | attachments | File upload, list |
| `/tasks/{id}/watchers` | watchers | Watch/unwatch tasks |
| `/tasks/{id}/activity` | activity | Activity feed |
| `/attachments/{id}/*` | attachments | Preview, view, download (signed URLs) |
| `/notifications` | notifications | User notifications (currently disabled in UI) |
| `/saved-filters` | saved-filters | Custom saved views |
| `/dashboard/*` | dashboard | Summary, workload, stuck tasks |
| `/search` | search | Global search (projects, tasks, lists) |
| `/system` | system | System settings (admin only) |
| `/audit` | audit | Audit log (admin only) |

## Models

| Model | Table | Key Fields |
|-------|-------|-----------|
| User | users | full_name, email, role, timezone, color, slack_enabled, slack_webhook_url, notify_* (9 flags) |
| Project | projects | name, description, owner_id, is_archived |
| ProjectMember | project_members | project_id, user_id |
| TaskList | task_lists | project_id, name, position, color |
| Task | tasks | project_id, list_id, title, status, priority, due_date, sort_order |
| TaskAssignee | task_assignees | task_id, user_id |
| TaskSubtask | task_subtasks | task_id, title, status, sort_order |
| Comment | comments | task_id, author_id, content, content_rich |
| Attachment | attachments | task_id, file_path, file_name, mime_type |
| TaskWatcher | task_watchers | task_id, user_id |
| Notification | notifications | user_id, type, payload_json, is_read |
| AuditLog | audit_log | entity_type, entity_id, action, actor_user_id, payload_json |
| SavedFilter | saved_filters | user_id, name, filters_json |
| SystemSettings | system_settings | max_upload_size_mb, allowed_file_types, image_*, slack_digest_hour |

## Services

Located in `app/services/`. Each service handles business logic for its domain:

- `task.py` — task queries (project-scoped + global), create, update, reorder
- `attachment.py` — file storage, image variant generation, signed URLs
- `slack_notify.py` — centralized Slack webhook sending
- `slack/digest.py` — daily digest content building + sending
- `activity.py` — activity feed with human-readable descriptions
- `audit.py` — audit logging with diff computation
- `system_settings.py` — single-row config table access
- `notification.py`, `mention.py` — in-app notifications and @mention resolution

## Key Patterns

- **MissingGreenlet prevention**: always `await db.refresh(obj)` after `db.commit()` before returning ORM objects
- **Cascade deletes**: all FK relationships use `ondelete="CASCADE"`
- **Compute diff**: `audit.compute_diff()` compares old/new values for audit logs
- **Signed URLs**: `create_preview_token()` generates short-lived JWTs for attachment access
- **Role-based task filtering**: `get_tasks()` and `get_tasks_global()` accept `viewer_id`/`viewer_role` — user role sees only assigned/created tasks
- **User deletion with reassignment**: `DELETE /users/{id}` with optional `reassign_to` transfers tasks, assignments, comments
- **Password generation**: backend validates; frontend generates 14-char passwords with eye/copy/refresh controls
