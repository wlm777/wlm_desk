import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    user = "user"


class TaskStatus(str, enum.Enum):
    no_progress = "no_progress"
    in_progress = "in_progress"
    completed = "completed"


class SubtaskStatus(str, enum.Enum):
    no_progress = "no_progress"
    in_progress = "in_progress"
    completed = "completed"


class TaskPriority(str, enum.Enum):
    none = "none"
    low = "low"
    medium = "medium"
    high = "high"
