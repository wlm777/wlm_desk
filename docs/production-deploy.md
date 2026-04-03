# Production Deployment Guide

## URL Architecture

```
Browser → https://desk.weblabmedia.eu → Reverse Proxy (Nginx/Caddy)
                                              │
                                              ├── / → Frontend (port 3000)
                                              └── /api → Backend (port 8000)
```

- **Frontend**: `https://desk.weblabmedia.eu`
- **Backend API**: `https://desk.weblabmedia.eu/api/v1/...`
- Internal: frontend container on `:3000`, backend on `:8000`
- Reverse proxy handles HTTPS termination and routing

## Prerequisites

- Docker + Docker Compose
- Dedicated disk for attachments (e.g. `/mnt/wlm-attachments`)
- Reverse proxy (Nginx/Caddy) with SSL certificate
- Domain: `desk.weblabmedia.eu`

## Quick Start

### 1. Prepare host

```bash
# Create attachments directory on dedicated disk
mkdir -p /mnt/wlm-attachments
chown 1000:1000 /mnt/wlm-attachments

# Clone the project
git clone <repo> /opt/wlm-desk
cd /opt/wlm-desk
```

### 2. Configure environment

```bash
cp .env.production.example .env
```

Edit `.env` — fill in:

```env
# Generate secrets:
# python3 -c "import secrets; print(secrets.token_urlsafe(32))"
SECRET_KEY=<generated>
JWT_SECRET=<generated>
PREVIEW_TOKEN_SECRET=<generated>

# Database
POSTGRES_PASSWORD=<strong_password>
DATABASE_URL=postgresql://wlm_prod:<password>@postgres:5432/wlm_tasks

# Public URLs
FRONTEND_URL=https://desk.weblabmedia.eu
BACKEND_PUBLIC_URL=https://desk.weblabmedia.eu
ALLOWED_ORIGINS=https://desk.weblabmedia.eu

# Storage
HOST_ATTACHMENTS_DIR=/mnt/wlm-attachments

# Google OAuth (if needed)
GOOGLE_CLIENT_ID=<your_id>
GOOGLE_CLIENT_SECRET=<your_secret>
```

### 3. Build and start

```bash
docker compose up -d --build
```

### 4. Run database migrations

```bash
docker compose exec backend alembic upgrade head
```

### 5. Create admin user

```bash
docker compose exec backend python3 -c "
import asyncio
from app.db.session import async_session
from app.services.user import create_user
from app.schemas.user import UserCreate
async def main():
    async with async_session() as db:
        user = await create_user(db, UserCreate(
            full_name='Admin',
            email='admin@weblabmedia.eu',
            password='<STRONG_PASSWORD>',
            role='admin',
        ))
        await db.commit()
        print(f'Admin created: {user.email}')
asyncio.run(main())
"
```

### 6. Configure reverse proxy

#### Nginx example

```nginx
server {
    listen 443 ssl;
    server_name desk.weblabmedia.eu;

    ssl_certificate /etc/ssl/certs/desk.weblabmedia.eu.pem;
    ssl_certificate_key /etc/ssl/private/desk.weblabmedia.eu.key;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}

server {
    listen 80;
    server_name desk.weblabmedia.eu;
    return 301 https://$host$request_uri;
}
```

#### Caddy alternative

```
desk.weblabmedia.eu {
    handle /api/* {
        reverse_proxy localhost:8000
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

## Storage

### Volume mapping

```yaml
# docker-compose.yml (already configured)
volumes:
  - ${HOST_ATTACHMENTS_DIR}:/app/data/attachments
```

- **Host path**: `/mnt/wlm-attachments` (dedicated disk)
- **Container path**: `/app/data/attachments`
- Both `backend` and `worker` services mount the same volume
- No files are stored inside the container filesystem

### Folder structure (auto-created)

```
/mnt/wlm-attachments/
  /{project_id}/
    /{task_id}/
      /original/   ← all uploaded files
      /preview/    ← image previews (max 640px)
      /thumb/      ← image thumbnails (120px square)
```

### Permissions

```bash
# The container runs as UID 1000 by default
chown -R 1000:1000 /mnt/wlm-attachments
chmod 750 /mnt/wlm-attachments
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | Yes | — | Application secret |
| `JWT_SECRET` | Yes | — | JWT signing key |
| `PREVIEW_TOKEN_SECRET` | Yes | — | Signed URL secret |
| `DATABASE_URL` | Yes | — | PostgreSQL connection |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection |
| `FRONTEND_URL` | Yes | `https://desk.weblabmedia.eu` | Public frontend URL |
| `BACKEND_PUBLIC_URL` | Yes | `https://desk.weblabmedia.eu` | Public API URL |
| `ALLOWED_ORIGINS` | Yes | `https://desk.weblabmedia.eu` | CORS whitelist (comma-separated) |
| `ATTACHMENTS_DIR` | No | `/app/data/attachments` | Container-side path |
| `HOST_ATTACHMENTS_DIR` | Yes | `./data/attachments` | Host-side mount path |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth |
| `SLACK_SIGNING_SECRET` | No | — | Slack webhook verification |

## Clean Database Before Import

To remove all project data while keeping users and settings:

```bash
# Preview what will be deleted (dry run):
docker compose exec backend python -m app.commands.clean_data

# Execute cleanup:
docker compose exec backend python -m app.commands.clean_data --confirm
```

Deletes: projects, tasks, subtasks, comments, attachments, lists, members, audit logs, notifications, saved filters.
Keeps: users, system_settings, alembic_version.
Also cleans attachment files from the mounted storage disk.

## Verify Storage

```bash
# Check attachments go to external disk:
ls -la /mnt/wlm-attachments/

# Verify inside container:
docker compose exec backend ls -la /app/data/attachments/

# Both should show the same content
```

## Post-Deploy Checklist

- [ ] All 3 secrets generated and set
- [ ] Database password changed from default
- [ ] Migrations run (`alembic upgrade head`)
- [ ] Admin user created
- [ ] Reverse proxy configured with SSL
- [ ] Attachments directory on dedicated disk (`/mnt/wlm-attachments`)
- [ ] Verify: `curl https://desk.weblabmedia.eu` returns frontend
- [ ] Verify: `curl https://desk.weblabmedia.eu/api/v1/auth/login` returns CORS headers
- [ ] Verify: file upload stores to `/mnt/wlm-attachments`
- [ ] Verify: Slack notification links use `https://desk.weblabmedia.eu`
