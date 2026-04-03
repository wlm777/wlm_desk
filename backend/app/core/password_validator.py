"""Strong password validation."""

import re

WEAK_PASSWORDS = {
    "password123", "qwerty123!", "admin123!", "password1!", "123456789a!",
    "letmein123!", "welcome123!", "changeme12!", "password12!", "iloveyou12!",
}


def validate_password(password: str) -> str | None:
    """Validate password strength. Returns error message or None if valid."""
    if len(password) < 12:
        return "Password must be at least 12 characters"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least 1 uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least 1 lowercase letter"
    if not re.search(r"[0-9]", password):
        return "Password must contain at least 1 number"
    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain at least 1 special character"
    if password.lower() in WEAK_PASSWORDS:
        return "This password is too common"
    return None
