"""Shared pytest configuration and fixtures for VideoIntegrity (owned by Laptop 3)."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.hashing import GENESIS_HASH, build_chain_record


def build_sample_chain(
    num_frames: int = 5,
    *,
    genesis_hash: str = GENESIS_HASH,
) -> tuple[list[dict[str, Any]], dict[int, bytes]]:
    """Construct a valid deterministic SHA-256 hash chain and matching raw frame bytes."""
    records: list[dict[str, Any]] = []
    frame_bytes_map: dict[int, bytes] = {}
    previous_hash = genesis_hash

    for idx in range(num_frames):
        frame_id = idx + 1
        timestamp = f"2026-11-18T10:00:{idx:02d}.000Z"
        # Distinct fake JPEG-like bytes starting with SOI (FF D8) and ending with EOI (FF D9)
        raw_bytes = b"\xff\xd8\xff\xe0" + f"sample-encoded-frame-{frame_id:04d}".encode("utf-8") + b"\xff\xd9"
        rec = build_chain_record(
            sequence_index=idx,
            frame_id=frame_id,
            timestamp=timestamp,
            frame_bytes=raw_bytes,
            previous_hash=previous_hash,
        )
        records.append(rec)
        frame_bytes_map[frame_id] = raw_bytes
        previous_hash = rec["chain_hash"]

    return records, frame_bytes_map


@pytest.fixture
def sample_chain() -> tuple[list[dict[str, Any]], dict[int, bytes]]:
    """Return a valid 5-frame chain and its original encoded frame bytes."""
    return build_sample_chain(5)


@pytest.fixture
def single_frame_chain() -> tuple[list[dict[str, Any]], dict[int, bytes]]:
    """Return a valid 1-frame chain linked to GENESIS_HASH."""
    return build_sample_chain(1)
