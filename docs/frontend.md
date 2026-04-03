# Frontend

## Routing

Next.js App Router with `(dashboard)` route group (requires auth).

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | Summary cards, workload, stuck tasks |
| `/projects` | All Projects | Project cards with counts |
| `/projects/[id]` | Project | Task lists, filters, search, DnD |
| `/tasks/[view]` | Aggregate Tasks | Cross-project views (my, overdue, etc.) |
| `/account` | My Account | Profile, Slack, notifications |
| `/users` | User Management | Admin user table/cards |
| `/system` | System Settings | Admin storage/image/digest config |
| `/login` | Login | Email/password + Google OAuth |

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| `Sidebar` | sidebar.tsx | Project selector, lists, views, nav, user menu |
| `Header` | header.tsx | Global search, new task button |
| `TaskDetailPanel` | task-detail-panel.tsx | Right panel: overview, subtasks, comments, files, activity |
| `GlobalSearch` | global-search.tsx | Header search with dropdown results |
| `RichEditor` | rich-editor.tsx | TipTap WYSIWYG with image paste, link popover |
| `AddTaskModal` | add-task-modal.tsx | New task creation form |
| `PriorityPicker` | priority-picker.tsx | Portal-based priority dropdown |
| `TimezonePicker` | timezone-picker.tsx | Searchable timezone dropdown |
| `AvatarStack` | avatar-stack.tsx | Overlapping user avatars |
| `ImageLightbox` | image-lightbox.tsx | Full-screen image preview |
| `BatchToolbar` | batch-toolbar.tsx | Bulk task actions |

## State Management

- **React Query v5** (TanStack) for all server state
- Query keys: `["tasks", projectId]`, `["comments", taskId]`, etc.
- Optimistic updates via `setQueryData` for subtask status, task reorder
- `invalidateQueries` for cache refresh after mutations

## Key Frontend Patterns

- **Debounced search**: local state → 350ms debounce → URL sync via `window.history.replaceState`
- **Collapsible lists**: localStorage key `wlm:list:{id}:collapsed`
- **Collapsible subtasks**: localStorage key `wlm:task:{id}:subtasks:expanded`
- **Per-list pagination**: newest 30 tasks loaded first, "Load earlier tasks" fetches older
- **Mobile responsive**: sidebar → drawer, task panel → fullscreen, tables → cards

## Keyboard Navigation

| Key | Context | Action |
|-----|---------|--------|
| `↑` / `↓` | Task list | Navigate tasks and subtasks |
| `Enter` | On task | Toggle subtask accordion |
| `Enter` | On subtask | Inline edit |
| `Enter` | On "+ Add subtask" | Open quick-add input |
| `→` | On task | Open detail panel |
| `←` | Panel open | Navigate tabs / close panel on first tab |
| `Space` | On subtask | Toggle complete |
| `Esc` | Panel open | Close lightbox → exit editor (with unsaved change confirm) → close panel |
| `Shift+Enter` | Comment editor | Submit comment |

## Status Picker

Task status uses a Freedcamp-style dropdown (not native `<select>`):
- Colored icons: ○ No Progress (gray), ◐ In Progress (orange), ● Completed (green)
- Displays status label + last updated date
- Click opens a styled popup with options

## Task Row Border Colors

- No Progress: `#E6E7EB` (gray)
- In Progress: `#e5a84b` (orange)
- Completed: `#22c55e` (green)

## In-app Notifications

The notification bell (NotificationBell component) is currently **disabled** in the header.
Slack notifications remain fully operational as the primary notification channel.

## TipTap Editor

- Version 3.x with StarterKit
- `link: false` in StarterKit config to avoid duplicate with separate Link extension
- Image paste from clipboard with `attachment:{id}` durable references
- `imageUrlMap` resolves references from description + all comments in one batch
