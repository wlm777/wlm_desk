# Architecture

## Overview

WLM Desk is a full-stack task management system (similar to Linear/Freedcamp) built for internal teams.

```
Browser → Next.js Frontend → FastAPI Backend → PostgreSQL
                                    ↓
                                  Redis
                                    ↓
                              Background Worker
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS v4, TipTap, @dnd-kit |
| Backend | FastAPI, async SQLAlchemy (asyncpg), Pydantic v2 |
| Database | PostgreSQL |
| Cache | Redis |
| Worker | Python asyncio scheduler |
| Auth | JWT (HS256), Google OAuth2 |
| Storage | Local filesystem (mountable volume) |
| Containers | Docker Compose |

## Project Structure

```
wlm-desk/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # FastAPI route handlers
│   │   ├── core/            # Config, security, dependencies
│   │   ├── db/              # Database session, base models
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/        # Business logic layer
│   │   └── worker/          # Background scheduler
│   ├── alembic/             # Database migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/(dashboard)/ # Page routes (dashboard, projects, tasks, users, clients)
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   └── lib/             # Utilities, types, constants, permissions
│   └── Dockerfile
├── docker-compose.yml
└── docs/
```

## Key Architectural Decisions

- **Async everywhere**: Backend uses async SQLAlchemy + asyncpg for non-blocking DB access
- **Service layer pattern**: API routes call services, services call DB — no direct ORM in routes
- **React Query**: Frontend state management via TanStack Query v5 with optimistic updates
- **Durable image references**: Rich text stores `attachment:{id}` refs, resolved to signed URLs at render time
- **Signed preview URLs**: Attachments accessed via short-lived JWT tokens, no Bearer auth needed for images
- **Single-row config table**: System settings persisted in `system_settings` table, not env vars
- **Image optimization**: Pillow generates thumbnail (square crop) and preview (max-width) variants on upload
- **Slack webhooks**: Per-user Incoming Webhook URLs for notifications (no shared bot token)
- **Role-based task visibility**: `user` role sees only assigned/created tasks; `manager`/`admin` see all
- **Keyboard-driven UX**: Full tree navigation, accordion toggles, panel tab switching via arrow keys
- **Client management**: Projects can be linked to clients; soft-delete via `is_active` flag
- **Starred projects**: Per-user favorites shown in sidebar for quick access
- **Last activity tracking**: `last_login_at` updated on every authenticated request (throttled to 5 min intervals)
- **Working days notification filtering**: per-user `working_days` field suppresses Slack notifications on non-working days, with exceptions for high-priority comments and subtask updates
