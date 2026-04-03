"""Clean all project-related data from the database.

Keeps: users, system_settings, alembic_version.
Deletes: projects, tasks, comments, attachments, etc.
Also cleans the attachments filesystem directory.

Usage:
    python -m app.commands.clean_data           # dry run (shows summary)
    python -m app.commands.clean_data --confirm  # actually deletes
"""

import asyncio
import os
import shutil
import sys

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import async_session


# Tables to clean, in FK-safe deletion order
TABLES_TO_CLEAN = [
    ("task_subtasks", "Subtasks"),
    ("task_assignees", "Task Assignees"),
    ("task_watchers", "Task Watchers"),
    ("comments", "Comments"),
    ("attachments", "Attachments"),
    ("tasks", "Tasks"),
    ("task_lists", "Task Lists"),
    ("project_members", "Project Members"),
    ("projects", "Projects"),
    ("audit_log", "Audit Logs"),
    ("notifications", "Notifications"),
    ("saved_filters", "Saved Filters"),
]


async def get_counts(db: AsyncSession) -> list[tuple[str, str, int]]:
    """Get row counts for all tables to clean."""
    counts = []
    for table, label in TABLES_TO_CLEAN:
        result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
        count = result.scalar() or 0
        counts.append((table, label, count))
    return counts


async def clean_database(db: AsyncSession) -> dict[str, int]:
    """Delete all rows from project-related tables. Returns deletion counts."""
    deleted = {}
    for table, label in TABLES_TO_CLEAN:
        result = await db.execute(text(f"DELETE FROM {table}"))
        deleted[label] = result.rowcount
        print(f"  Deleted {result.rowcount:>6} rows from {table}")
    await db.commit()
    return deleted


def clean_attachments_dir() -> int:
    """Remove all files/folders inside attachments dir. Keep the root dir."""
    att_dir = settings.attachments_dir
    if not os.path.exists(att_dir):
        print(f"  Attachments directory does not exist: {att_dir}")
        return 0

    count = 0
    for entry in os.listdir(att_dir):
        path = os.path.join(att_dir, entry)
        if os.path.isdir(path):
            shutil.rmtree(path)
            count += 1
        elif os.path.isfile(path):
            os.remove(path)
            count += 1
    return count


async def main():
    confirm = "--confirm" in sys.argv

    print("=" * 60)
    print("  WLM Desk — Clean Project Data")
    print("=" * 60)
    print()

    # Show what will be preserved
    print("PRESERVED (not deleted):")
    print("  - users")
    print("  - system_settings")
    print("  - alembic_version")
    print()

    # Get counts
    async with async_session() as db:
        counts = await get_counts(db)

    # Show summary
    total = sum(c for _, _, c in counts)
    print("DATA TO DELETE:")
    for table, label, count in counts:
        if count > 0:
            print(f"  {label:<20} {count:>6} rows")
    print(f"  {'TOTAL':<20} {total:>6} rows")
    print()

    # Attachments dir
    att_dir = settings.attachments_dir
    if os.path.exists(att_dir):
        dir_count = len(os.listdir(att_dir))
        print(f"FILESYSTEM:")
        print(f"  Attachments dir:   {att_dir}")
        print(f"  Top-level entries: {dir_count}")
    else:
        dir_count = 0
        print(f"FILESYSTEM:")
        print(f"  Attachments dir:   {att_dir} (does not exist)")
    print()

    if total == 0 and dir_count == 0:
        print("Nothing to clean. Database and filesystem are already empty.")
        return

    if not confirm:
        print("DRY RUN — no changes made.")
        print()
        print("To execute, run:")
        print("  python -m app.commands.clean_data --confirm")
        return

    # Confirm
    print("EXECUTING CLEANUP...")
    print()

    # 1. Clean database
    print("Database:")
    async with async_session() as db:
        deleted = await clean_database(db)
    print()

    # 2. Clean filesystem
    print("Filesystem:")
    removed = clean_attachments_dir()
    print(f"  Removed {removed} top-level entries from {att_dir}")
    print()

    # 3. Reset user digest timestamps
    async with async_session() as db:
        await db.execute(text("UPDATE users SET last_digest_at = NULL"))
        await db.commit()
        print("Reset user digest timestamps.")

    # Summary
    print()
    print("=" * 60)
    print("  CLEANUP COMPLETE")
    print("=" * 60)
    total_deleted = sum(deleted.values())
    print(f"  Database rows deleted: {total_deleted}")
    print(f"  Filesystem entries removed: {removed}")
    print(f"  Users preserved: yes")
    print(f"  System settings preserved: yes")
    print()


if __name__ == "__main__":
    asyncio.run(main())
