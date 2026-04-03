"""Stable color assignment for users and lists based on entity ID."""

import hashlib

PALETTE = [
    "#7BAE8A",  # Sage
    "#5B8DB5",  # Denim
    "#C47A5A",  # Clay
    "#9B7BAE",  # Mauve
    "#3D9B8A",  # Jade
    "#C4A84A",  # Saffron
    "#5A7A9B",  # Slate
    "#6B9B5A",  # Fern
    "#7B6BAE",  # Dusk
    "#B5804A",  # Copper
    "#4A8B9B",  # Mist
    "#8B9B4A",  # Herb
]


def color_from_id(entity_id: str) -> str:
    """Return a stable color from the palette based on entity ID hash."""
    h = int(hashlib.md5(entity_id.encode()).hexdigest(), 16)
    return PALETTE[h % len(PALETTE)]


def random_color() -> str:
    import uuid
    return color_from_id(str(uuid.uuid4()))


def random_list_color() -> str:
    import uuid
    return color_from_id(str(uuid.uuid4()))
