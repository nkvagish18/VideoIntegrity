"""Deterministic SHA-256 frame and hash-chain utilities matching API_CONTRACT.md."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from app.config import DEFAULT_ENCODING, GENESIS_HASH


def utc_now_iso() -> str:
    """Return current UTC timestamp formatted as YYYY-MM-DDTHH:MM:SS.mmmZ."""
    now = datetime.now(timezone.utc)
    ms = now.microsecond // 1000
    return now.strftime(f"%Y-%m-%dT%H:%M:%S.{ms:03d}Z")


def compute_frame_hash(frame_bytes: bytes) -> str:
    """Compute lowercase 64-char SHA-256 hex digest from actual encoded frame bytes."""
    if not isinstance(frame_bytes, (bytes, bytearray, memoryview)):
        raise TypeError("frame_bytes must be a bytes-like object.")
    raw = bytes(frame_bytes)
    if len(raw) == 0:
        raise ValueError("frame_bytes must not be empty.")
    return hashlib.sha256(raw).hexdigest()


def canonical_json(
    frame_id: int,
    timestamp: str,
    frame_hash: str,
    previous_hash: str,
) -> bytes:
    """Serialize chain payload to deterministic canonical UTF-8 JSON bytes."""
    if not isinstance(frame_id, int) or isinstance(frame_id, bool) or frame_id < 1:
        raise ValueError("frame_id must be a positive integer.")
    if not isinstance(timestamp, str) or not timestamp:
        raise ValueError("timestamp must be a non-empty string.")
    if not isinstance(frame_hash, str) or len(frame_hash) != 64:
        raise ValueError("frame_hash must be a 64-character hex string.")
    if not isinstance(previous_hash, str) or len(previous_hash) != 64:
        raise ValueError("previous_hash must be a 64-character hex string.")

    payload = {
        "frame_id": frame_id,
        "timestamp": timestamp,
        "frame_hash": frame_hash,
        "previous_hash": previous_hash,
    }
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def compute_chain_hash(
    frame_id: int,
    timestamp: str,
    frame_hash: str,
    previous_hash: str,
) -> str:
    """Compute lowercase 64-char SHA-256 chain hash over canonical JSON payload."""
    return hashlib.sha256(
        canonical_json(frame_id, timestamp, frame_hash, previous_hash)
    ).hexdigest()


def build_chain_record(
    *,
    sequence_index: int,
    frame_id: int,
    timestamp: str,
    frame_bytes: bytes,
    previous_hash: str,
    encoding: str = DEFAULT_ENCODING,
) -> dict[str, Any]:
    """Build a complete ChainRecord dictionary from raw encoded frame bytes."""
    frame_hash = compute_frame_hash(frame_bytes)
    chain_hash = compute_chain_hash(
        frame_id=frame_id,
        timestamp=timestamp,
        frame_hash=frame_hash,
        previous_hash=previous_hash,
    )
    return {
        "sequence_index": sequence_index,
        "frame_id": frame_id,
        "timestamp": timestamp,
        "frame_hash": frame_hash,
        "previous_hash": previous_hash,
        "chain_hash": chain_hash,
        "byte_size": len(frame_bytes),
        "encoding": encoding,
    }


__all__ = [
    "GENESIS_HASH",
    "build_chain_record",
    "canonical_json",
    "compute_chain_hash",
    "compute_frame_hash",
    "utc_now_iso",
]
