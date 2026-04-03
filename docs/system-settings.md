# System Settings

## Access

- Route: `/system`
- Admin only
- Backend: `GET /api/v1/system`, `PUT /api/v1/system`

## Persistence

Single-row `system_settings` table. Auto-created with defaults if missing.

## Editable Settings

| Setting | Default | Range | Runtime Effect |
|---------|---------|-------|---------------|
| Max Upload Size (MB) | 10 | 1–500 | Upload validation |
| Allowed File Types | 15 MIME types | Valid MIME | Upload validation |
| Preview Max Width (px) | 640 | 100–2000 | Image variant generation (future uploads) |
| Thumbnail Size (px) | 120 | 50–500 | Image variant generation (future uploads) |
| Digest Hour | 8 | 0–23 | Worker digest schedule |

## Read-Only Display

| Value | Source |
|-------|--------|
| Total disk space | `shutil.disk_usage()` |
| Used space | `os.walk()` on attachments dir |
| Free space | `shutil.disk_usage()` |
| Storage path | `settings.attachments_dir` |
| App version | Hardcoded constant |
| Database connected | `SELECT 1` health check |
| Attachments dir exists | `os.path.exists()` |

## How Settings Affect Runtime

### Upload Validation (immediate)
When a file is uploaded, the endpoint reads `system_settings` and uses:
- `max_upload_size_mb * 1024 * 1024` as max file size
- `allowed_file_types` (comma-separated) as accepted MIME set

### Image Processing (future uploads only)
- `image_preview_max_width` and `image_thumbnail_size` are passed to `save_file()` → `_generate_variants()`
- Existing images retain their previously generated variants

### Digest Hour (next cycle)
- Worker reads `slack_digest_hour` from DB on each check cycle
- Takes effect within 5 minutes (worker interval)

## UI

The /system page has sections:
1. **Storage** — usage bar + max upload size input
2. **Image Processing** — preview width + thumbnail size inputs
3. **Allowed File Types** — read-only badge list
4. **Daily Digest** — digest hour input
5. **System Info** — read-only health indicators

Save button appears when changes are detected. Single save for all editable fields.
