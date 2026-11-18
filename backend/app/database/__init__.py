"""Thread-safe SQLite database layer for frame bytes and hash-chain records."""

from .db import IntegrityDatabase

__all__ = ["IntegrityDatabase"]
