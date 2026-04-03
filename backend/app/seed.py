"""Seed script for initial data. Run: python -m app.seed"""

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.db.session import async_session
from app.models import (
    Project,
    ProjectMember,
    Task,
    TaskAssignee,
    TaskList,
    TaskSubtask,
    User,
)
from app.models.enums import TaskPriority, TaskStatus, UserRole


async def seed() -> None:
    async with async_session() as db:
        # Check idempotency
        result = await db.execute(select(User).where(User.email == "admin@wlm.local"))
        if result.scalar_one_or_none():
            print("Seed data already exists. Skipping.")
            return

        # --- Users ---
        admin = User(
            id=uuid.uuid4(),
            full_name="Admin",
            email="admin@wlm.local",
            password_hash=hash_password("admin123"),
            role=UserRole.admin,
            timezone="UTC",
        )
        manager = User(
            id=uuid.uuid4(),
            full_name="Project Manager",
            email="manager@wlm.local",
            password_hash=hash_password("manager"),
            role=UserRole.manager,
            timezone="Europe/Kyiv",
        )
        dev1 = User(
            id=uuid.uuid4(),
            full_name="Developer One",
            email="user1@wlm.local",
            password_hash=hash_password("user123"),
            role=UserRole.user,
            timezone="Europe/Kyiv",
        )
        dev2 = User(
            id=uuid.uuid4(),
            full_name="Developer Two",
            email="user2@wlm.local",
            password_hash=hash_password("user123"),
            role=UserRole.user,
            timezone="UTC",
        )
        db.add_all([admin, manager, dev1, dev2])
        await db.flush()

        # --- Project ---
        project = Project(
            id=uuid.uuid4(),
            name="WLM Desk Development",
            description="Internal task management system project",
            owner_id=admin.id,
        )
        db.add(project)
        await db.flush()

        # --- Members (owner auto-added) ---
        for user in [admin, manager, dev1, dev2]:
            db.add(ProjectMember(project_id=project.id, user_id=user.id))
        await db.flush()

        # --- Task Lists (categories) ---
        backlog = TaskList(id=uuid.uuid4(), project_id=project.id, name="Backlog", position=0)
        development = TaskList(id=uuid.uuid4(), project_id=project.id, name="Development", position=1)
        design = TaskList(id=uuid.uuid4(), project_id=project.id, name="Design", position=2)
        qa = TaskList(id=uuid.uuid4(), project_id=project.id, name="QA", position=3)
        db.add_all([backlog, development, design, qa])
        await db.flush()

        # --- Tasks ---
        tasks_data = [
            # Backlog
            {
                "list": backlog, "title": "Set up CI/CD pipeline",
                "priority": TaskPriority.high, "status": TaskStatus.no_progress,
                "assignees": [dev1], "sort_order": 1000,
            },
            {
                "list": backlog, "title": "Write API documentation",
                "priority": TaskPriority.low, "status": TaskStatus.no_progress,
                "assignees": [manager], "sort_order": 2000,
            },
            # Development
            {
                "list": development, "title": "Implement auth",
                "priority": TaskPriority.high, "status": TaskStatus.in_progress,
                "assignees": [dev1], "sort_order": 1000,
                "subtasks": [
                    ("JWT generation", True),
                    ("Login endpoint", True),
                    ("RBAC middleware", False),
                ],
            },
            {
                "list": development, "title": "Design database schema",
                "priority": TaskPriority.medium, "status": TaskStatus.completed,
                "assignees": [dev1, dev2], "sort_order": 2000,
            },
            # Design
            {
                "list": design, "title": "Create wireframes for dashboard",
                "priority": TaskPriority.medium, "status": TaskStatus.in_progress,
                "assignees": [dev2], "sort_order": 1000,
            },
            # QA
            {
                "list": qa, "title": "Docker setup verification",
                "priority": TaskPriority.medium, "status": TaskStatus.completed,
                "assignees": [dev1], "sort_order": 1000,
            },
        ]

        for td in tasks_data:
            task = Task(
                id=uuid.uuid4(),
                project_id=project.id,
                list_id=td["list"].id,
                title=td["title"],
                priority=td["priority"],
                status=td["status"],
                is_completed=td["status"] == TaskStatus.completed,
                sort_order=td["sort_order"],
                created_by_id=admin.id,
            )
            db.add(task)
            await db.flush()

            for assignee in td.get("assignees", []):
                db.add(TaskAssignee(task_id=task.id, user_id=assignee.id))

            for title, completed in td.get("subtasks", []):
                db.add(TaskSubtask(task_id=task.id, title=title, is_completed=completed))

        await db.commit()
        print("Seed data created successfully.")
        print("  Admin: admin@wlm.local / admin123")
        print("  Manager: manager@wlm.local / manager")
        print("  User 1: user1@wlm.local / user123")
        print("  User 2: user2@wlm.local / user123")


if __name__ == "__main__":
    asyncio.run(seed())
