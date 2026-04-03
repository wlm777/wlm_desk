# WLM Desk

Internal task management system.

## Tech Stack

- **Frontend:** Next.js (TypeScript)
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL 15
- **Cache/Queue:** Redis 7

## Quick Start

### Prerequisites

- Docker & Docker Compose

### Run

```bash
docker compose up --build
```

### Access

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:3000   |
| Backend  | http://localhost:8000   |
| API Docs | http://localhost:8000/docs |

### Health Check

```bash
curl http://localhost:8000/health
```

Returns:
```json
{
  "status": "ok",
  "postgres": true,
  "redis": true
}
```

## Project Structure

```
wlm-tasks/
├── frontend/          # Next.js app
│   ├── src/
│   │   ├── app/       # Pages (App Router)
│   │   ├── components/
│   │   └── lib/
│   └── Dockerfile
├── backend/           # FastAPI app
│   ├── app/
│   │   ├── api/       # Route handlers
│   │   ├── core/      # Configuration
│   │   └── db/        # Database session
│   └── Dockerfile
├── infra/             # Infrastructure configs
├── .env               # Environment variables
└── docker-compose.yml
```

## Environment Variables

Copy `.env` and adjust as needed. Key variables:

| Variable       | Default                                              |
|----------------|------------------------------------------------------|
| DATABASE_URL   | postgresql://postgres:postgres@postgres:5432/wlm_tasks |
| REDIS_URL      | redis://redis:6379                                    |
| SECRET_KEY     | supersecretkey                                        |
