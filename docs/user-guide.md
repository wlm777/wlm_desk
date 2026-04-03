# User Guide

## Getting Started

1. Log in with your email and password (or Google account)
2. Select a project from the sidebar
3. Start managing tasks

## Dashboard

The dashboard shows:
- **Summary cards** — My Tasks, In Progress, Due Today, Overdue, Projects
- **Team Workload** — tasks per team member (click to view their tasks)
- **Stuck Tasks** — tasks with no activity for 5+ days (click to open)

All cards are clickable and navigate to filtered views.

## Projects

### All Projects
- Sidebar → **All Projects** or click the Projects card on Dashboard
- Shows project cards with task count, member count, last updated
- Click a card to open the project
- Trash icon (admin/manager) to delete a project

### Inside a Project
- Tasks grouped by lists
- Each list is collapsible (click the chevron)
- Drag and drop to reorder tasks within a list

## Tasks

### Creating Tasks
- Click **+ New Task** in the header
- Or use **Quick Add** at the bottom of any list (just type and press Enter)

### Task Row
- Checkbox for batch selection
- Chevron to expand/collapse subtasks
- Priority badge and status label
- Click to open the detail panel

### Task Detail Panel
- Opens on the right (50% width on desktop, fullscreen on mobile)
- Tabs: Overview, Subtasks, Comments, Files, Activity
- Navigate tabs with `←` / `→` arrow keys
- Close with `←` on the first tab

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between tasks and subtasks |
| `Enter` | Toggle subtask accordion / edit subtask |
| `→` | Open task detail panel |
| `←` | Navigate tabs / close panel |
| `Space` | Toggle subtask complete |
| `Shift+Enter` | Submit comment |

## Subtasks

- Expand a task's chevron to see subtasks
- **Quick add**: click "+ Add subtask" or press Enter on it
- **Inline edit**: double-click a subtask title
- **Status**: click the status icon to cycle (To Do / In Progress / Completed)
- **Drag**: reorder subtasks via grip handle

## Filters & Search

### Project Search
- Search bar at the top of the project page
- Filters tasks by title and description
- Works together with status/priority filters

### Global Search
- Search bar in the header
- Searches across projects, tasks, and lists
- Click a result to navigate

### Built-in Views (sidebar)
- My Tasks, Overdue, High Priority, Unassigned, Completed

### Saved Filters
- Apply status/priority/list filters
- Click **Save** to create a custom view

## Comments

- Add comments in the Comments tab
- Paste images from clipboard
- **Shift+Enter** to submit
- Edit/delete your own comments (pencil/trash icons on hover)
- @mention users by email

## Files

- Upload via click or drag-and-drop
- Images show thumbnails; click to open lightbox
- Non-image files (PDF, DOCX, etc.) open in browser or download

## My Account

### Profile & Settings
- Change name, email, timezone
- Change password
- Change avatar color (pencil icon on avatar)

### Slack
- Enable Slack notifications
- Add your webhook URL (see setup instructions on the page)
- Send test notification

### Notifications
- Toggle daily digest (new tasks, in progress)
- Toggle realtime (comments, task created/updated, assigned, subtasks, file upload, watcher)

## Task Visibility by Role

| Role | What you see |
|------|-------------|
| Admin | All tasks in all projects |
| Manager | All tasks in your projects |
| User | Only tasks assigned to you or created by you |

## For Admins

### User Management
- Sidebar → user menu → **Users**
- Create users (with auto-generated password, eye/copy/refresh controls)
- Edit users (including Slack and notification settings)
- Delete users (with option to reassign tasks to another user)
- Set roles (admin, manager, user)
- Configure Slack and notification preferences per user

### System Settings
- Sidebar → user menu → **Manage System**
- Storage usage and limits
- Image processing settings
- Daily digest schedule
- System health status
