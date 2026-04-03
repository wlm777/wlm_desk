# Storage & Attachments

## Folder Structure

```
/app/data/attachments/
  /{project_id}/
    /{task_id}/
      /original/    ← all files (images + documents)
      /preview/     ← images only (max width from settings)
      /thumb/       ← images only (square crop from settings)
```

## File Types

### Images
- JPEG, PNG, GIF, WebP, SVG
- Stored in `original/` + variants generated in `preview/` and `thumb/`
- SVG: stored as-is, no Pillow processing

### Documents
- PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, ZIP
- Stored in `original/` only, no variant generation

## Image Variants

Generated on upload via Pillow:

| Variant | Size | Usage |
|---------|------|-------|
| Original | Untouched | Lightbox / full preview |
| Preview | Max width (default 640px) | Inline in description/comments |
| Thumbnail | Square crop (default 120px) | File list |

Settings configurable in System Settings → Image Processing.
Changes apply to **future uploads only**.

## API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /tasks/{id}/attachments` | Bearer | Upload file |
| `GET /tasks/{id}/attachments` | Bearer | List task attachments |
| `GET /attachments/{id}/preview?token=` | Signed URL | Serve preview variant |
| `GET /attachments/{id}/thumb?token=` | Signed URL | Serve thumbnail variant |
| `GET /attachments/{id}/view?token=` | Signed URL | Serve original inline |
| `GET /attachments/{id}/download?token=` | Signed URL | Download original |
| `POST /attachments/preview-urls` | Bearer | Batch signed URL generation |
| `DELETE /attachments/{id}` | Bearer | Delete file + variants |

## Signed URLs

- Generated via `create_preview_token(attachment_id)` — short-lived JWT
- Default expiry: 30 minutes (`preview_token_expire_minutes`)
- No Bearer auth needed — token in query string
- Used for rendering images in rich text and file lists

## Durable Image References

Rich text (description/comments) stores images as `attachment:{id}` in the JSON.
At render time, `extractAttachmentIds()` extracts all IDs, `POST /attachments/preview-urls` resolves them to fresh signed URLs via `imageUrlMap`.

## Deletion

- **Individual file**: removes original + preview + thumb variants
- **Task deleted**: cascade removes DB rows; `delete_task_files()` removes `/{project_id}/{task_id}/`
- **Project deleted**: cascade removes DB rows; `delete_project_files()` removes `/{project_id}/`

## Backward Compatibility

- `get_file_full_path()` checks new structured path first, falls back to legacy flat path
- `get_variant_path()` returns `None` for legacy files → endpoints serve original
- Old attachments without variants still work via original file

## Limits

Configurable in System Settings:
- Max upload size: default 10 MB (1–500 MB range)
- Allowed file types: 15 MIME types by default
- Preview max width: default 640px (100–2000px)
- Thumbnail size: default 120px (50–500px)
