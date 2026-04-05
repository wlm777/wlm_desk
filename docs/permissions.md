# Permissions

## Roles

| Role | Level | Description |
|------|-------|-------------|
| `admin` | Highest | Full system access |
| `manager` | Middle | Project-level management (if member) |
| `user` | Base | Task-level access in assigned projects |

## Permission Matrix

| Action | Admin | Manager | User |
|--------|-------|---------|------|
| **System** | | | |
| Access /system settings | Yes | No | No |
| Manage users (CRUD) | Yes | No | No |
| View audit logs | Yes | No | No |
| **Projects** | | | |
| Create project | Yes | Yes | No |
| Edit project (name, desc, members) | Yes | If member | No |
| Delete project | Yes | If owner | No |
| Archive project | Yes | If owner | No |
| **Clients** | | | |
| View clients | Yes | Yes | Yes |
| Create client | Yes | Yes | No |
| Edit client | Yes | Yes | No |
| Delete (deactivate) client | Yes | Yes | No |
| **Lists** | | | |
| Create/edit/delete lists | Yes | If member | No |
| **Tasks** | | | |
| Create tasks | Yes | Yes | Yes (if member) |
| Edit any task | Yes | If member | Own/assigned only |
| View tasks | Yes | If member | If member |
| **Comments** | | | |
| Create comments | Yes | If member | If member |
| Edit comment | Yes | Own only | Own only |
| Delete comment | Yes | Own only | Own only |
| **Attachments** | | | |
| Upload files | Yes | If member | If member (edit access) |
| Delete files | Yes | If member | If member (edit access) |

## UI Visibility

Controlled by `lib/permissions.ts`:

- `canManageUsers(role)` — admin only
- `canCreateProject(role)` — admin + manager
- `canEditProject(role, isMember)` — admin always, manager if member, user never
- `canManageLists(role, isMember)` — admin always, manager if member
- Clients: `canManage` = admin or manager (inline check in clients page)

## Task Visibility (Important)

| Role | Sees tasks |
|------|-----------|
| Admin | All tasks in all projects |
| Manager | All tasks in member projects |
| User | Only tasks where **assigned** or **created by** them |

Enforced in `get_tasks()` and `get_tasks_global()` via `viewer_id` / `viewer_role` params.
Per-list task counts also respect this filtering.

## Project Membership

- Non-admin users can only access projects where they are members
- Admin sees all projects regardless of membership
- Task edit access for `user` role: must be creator or assignee

## User Deletion

- Admin can delete any user (except themselves)
- Options: reassign tasks/comments to another user, or keep as orphaned
- Cascade deletes remove watchers, assignments, notifications
