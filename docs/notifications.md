# Notifications

## Overview

WLM Desk uses Slack Incoming Webhooks as the primary notification system. Each user configures their own webhook URL and preferences.

**Note**: The in-app notification bell is currently disabled. Slack is the only active notification channel.

## Architecture

```
Event (API action)
  → slack_notify.notify_users()
    → Check per-user: slack_enabled + webhook + preference flag
      → POST to user's webhook URL
```

No shared bot token. Each user has their own webhook.

## User Preferences

Stored on the `users` table:

| Field | Default | Category |
|-------|---------|----------|
| `slack_enabled` | false | Master toggle |
| `slack_webhook_url` | null | Webhook URL |
| `notify_daily_new_tasks` | true | Daily digest |
| `notify_daily_in_progress` | true | Daily digest |
| `notify_comment` | true | Realtime |
| `notify_task_created` | true | Realtime |
| `notify_task_updated` | true | Realtime |
| `notify_watcher` | true | Realtime |
| `notify_task_assigned` | true | Realtime |
| `notify_subtask` | true | Realtime |
| `notify_file_upload` | true | Realtime |

## Sending Conditions

A notification is sent ONLY if ALL are true:
1. `slack_enabled = true`
2. `slack_webhook_url` is present and valid
3. The specific preference flag for the event is `true`
4. The target user is NOT the actor (no self-notifications)

## Event → Preference Mapping

| Event | Pref Field | Slack Icon | Trigger | Target Users |
|-------|-----------|-----------|---------|-------------|
| Comment added | `notify_comment` | `:speech_balloon:` | `comments.py` | Mentioned + watchers + assignees + creator |
| Task created | `notify_task_created` | `:mega:` | `tasks.py` | Assignees only |
| Task updated | `notify_task_updated` | `:pencil2:` | `tasks.py` | Assignees + watchers + creator |
| Task assigned | `notify_task_assigned` | `:bust_in_silhouette:` | `assignees.py` | The assigned user |
| Subtask update | `notify_subtask` | `:arrow_right:` | `subtasks.py` | Assignees + watchers + creator |
| File uploaded | `notify_file_upload` | `:paperclip:` | `attachments.py` | Assignees + watchers + creator |
| Watcher event | `notify_watcher` | `:eyes:` | (reserved) | Watchers |

## Message Format

All messages include:
- Slack emoji prefix (event-specific)
- Actor name (bold)
- Action label
- Task title as **clickable link** to `{frontend_url}/projects/{project_id}?task={task_id}`
- Project name (italic)

### Task Updated — Structured Changes

Instead of generic "Changed: field1, field2", updates show:

- **Status**: `:small_orange_diamond: In Progress` or `:white_check_mark: Completed`
- **Priority**: colored circle emoji + label (Urgent/High/Medium/Low)
- **Description**: first 10 words of new text + `...`
- **Due date**: new date or "removed"
- **Title rename**: old → new

Hidden fields (not shown): `updated_at`, `updated_by_id`, `last_activity_at`, `sort_order`, `is_completed`

### Examples

```
:mega: *Peter* created task <link|Design review> in _WLM Desk_

:pencil2: *Alice* updated task <link|Fix auth> in _WLM Desk_
Status: :white_check_mark: Completed
Priority: :large_orange_circle: High

:speech_balloon: *Bob* commented on <link|API docs> in _WLM Desk_

:arrow_right: *Peter* updated subtask on <link|Auth module> in _WLM Desk_
Completed: Write unit tests

:paperclip: *Alice* uploaded a file to <link|API Docs> in _WLM Desk_
File: report.pdf
```

## Daily Digest

### Schedule
- Runs via background worker (`app/worker/scheduler.py`)
- Worker checks every 300 seconds (5 minutes)
- Sends when user's local time hour = `slack_digest_hour` (from system settings, default 8)
- Uses user's `timezone` field for local time calculation

### Content
- **New Tasks**: assigned to user, status = `no_progress`, not archived
- **In Progress**: assigned to user, status = `in_progress`, not archived
- Only includes sections the user has enabled

### Deduplication
- `last_digest_at` (UTC) stored on user after successful send
- Compared against user's local date to prevent same-day duplicates

### Example
```
:clipboard: *Daily Digest* — Good morning, Peter!
*New Tasks*
  • Fix auth flow — _WLM Desk_
  • Write tests — _WLM Desk_

*In Progress*
  • Design review — _WLM Desk_

_3 task(s) total_
```

## Error Handling

- All Slack sends wrapped in try/except — failures never break the main action
- `httpx.AsyncClient(timeout=10)` — 10 second timeout
- Failed webhooks logged with `logger.warning/exception`
- Each user processed independently — one failure doesn't block others

## Test Notification

- Endpoint: `POST /api/v1/auth/me/test-slack`
- Sends: `🔔 *Test notification* — Hi {name}, your Slack webhook is working!`
- Available in My Account → Slack tab when enabled + valid webhook

## Webhook Setup Instructions

1. Go to slack.com, log into your workspace
2. In Manage → Custom Integrations
3. Search for Incoming WebHooks, enable the app
4. Click "Add to Slack"
5. Select channel in "Post to Channel"
6. Click "Add Incoming WebHooks Integration"
7. Copy the webhook URL, paste in WLM Desk settings

## In-App Notifications (Disabled)

The `NotificationBell` component and backend notification endpoints exist but are currently **not rendered** in the header. The notification system (due reminders, comment notifications, etc.) stores data in the `notifications` table but has no active UI.

Slack webhooks are the recommended and active notification method.
