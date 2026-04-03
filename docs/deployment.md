# Deployment

## Docker Compose (recommended)

### Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| frontend | Next.js | 3001 (default) | Web UI |
| backend | FastAPI/Uvicorn | 8000 (default) | REST API |
| worker | Python | — | Background scheduler |
| postgres | PostgreSQL | 5432 | Database |
| redis | Redis | 6379 | Cache |

### Quick Start

```bash
docker compose up -d --build
```

### First Run

1. Build and start all services:
   ```bash
   docker compose up -d --build
   ```

2. Run database migrations:
   ```bash
   docker compose exec backend alembic upgrade head
   ```

3. Create admin user (via API or seed script)

4. Access the app at `http://localhost:3000`

## Environment Variables

Create `.env` in the project root:

```env
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/wlm_tasks

# Redis
REDIS_URL=redis://redis:6379

# Security
SECRET_KEY=your-secret-key
JWT_SECRET=your-jwt-secret

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback

# Slack Bot (optional, for legacy bot features)
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
```

### Backend Config (`app/core/config.py`)

| Variable | Default | Description |
|----------|---------|-------------|
| `database_url` | `postgresql+asyncpg://...` | DB connection |
| `redis_url` | `redis://redis:6379` | Redis connection |
| `jwt_secret` | `supersecretkey` | JWT signing key |
| `jwt_expire_minutes` | 1440 (24h) | Token lifetime |
| `attachments_dir` | `/app/data/attachments` | File storage path |
| `max_upload_size` | 10MB | Fallback (overridden by DB settings) |
| `preview_token_secret` | `preview-secret-change-me` | Signed URL secret |
| `preview_token_expire_minutes` | 30 | Signed URL lifetime |
| `worker_check_interval` | 300 | Worker loop interval (seconds) |
| `slack_digest_hour` | 8 | Fallback digest hour |

## Storage Mount

**Important**: Mount a persistent volume for attachments:

```yaml
# docker-compose.yml
backend:
  volumes:
    - ./data/attachments:/app/data/attachments

worker:
  volumes:
    - ./data/attachments:/app/data/attachments
```

Both `backend` and `worker` must share the same attachments volume.

## Database Migrations

```bash
# Run all pending migrations
docker compose exec backend alembic upgrade head

# Check current version
docker compose exec backend alembic current

# Create new migration
docker compose exec backend alembic revision --autogenerate -m "description"
```

Current migrations: `001` through `014`.

Ports are configured in `.env`:
- `FRONTEND_PORT=3001` (mapped to container port 3000)
- `BACKEND_PORT=8000`

`FRONTEND_URL` is passed to backend/worker for Slack notification links.

## Production Considerations

- Change all secret keys (`jwt_secret`, `preview_token_secret`, `secret_key`)
- Set `CORS` origins to your domain (currently `allow_origins=["*"]`)
- Use a proper reverse proxy (nginx/Caddy) in front of services
- Mount attachments on a dedicated disk with adequate space
- Set up database backups
- Consider Redis persistence if using it for more than cache
- Set `FRONTEND_URL` to your public frontend URL for correct Slack notification links
- CORS: currently `allow_origins=["*"]`, `allow_credentials=False` (uses Bearer tokens, not cookies)
