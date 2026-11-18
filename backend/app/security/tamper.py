"""Tamper simulation engine (owned by Laptop 3).

Provides:
1. `simulate_tamper(...)` — exact stateless contract consumed by Laptop 1's
   POST /api/tamper/simulate route (docs/DEVELOPMENT_GUIDE.md Section 4.3).
   Always operates on deep copies of records and never mutates the caller's list.
2. `IsolatedTamperSimulator` — fully isolated, non-destructive sandbox simulator
   that copies original records and frame bytes, applies tamper attacks to the
   test copy only, runs verification to pinpoint the first invalid frame, and
   supports clean reset back to the original untouched state.
"""

from __future__ import annotations

import copy
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from app.services.hashing import GENESIS_HASH, utc_now_iso
from app.security.verification import verify_chain

TAMPER_TYPES: tuple[str, ...] = (
    "modify_frame_bytes",
    "modify_metadata",
    "delete_record",
    "reorder_records",
    "break_link",
)

_TAMPER_COUNTER_LOCK = threading.Lock()
_TAMPER_COUNTER = 0


def _next_tamper_id() -> str:
    global _TAMPER_COUNTER
    with _TAMPER_COUNTER_LOCK:
        _TAMPER_COUNTER += 1
        seq = _TAMPER_COUNTER
    now_tag = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"tmp_{now_tag}_{seq:03d}"


def _corrupt_hex_hash(hex_value: str) -> str:
    """Return a guaranteed-different 64-char lowercase hex string."""
    if not isinstance(hex_value, str) or len(hex_value) != 64:
        return "f" * 64
    flipped = "0" if hex_value[0] != "0" else "f"
    return flipped + hex_value[1:]


def mutate_frame_bytes(raw_bytes: bytes) -> bytes:
    """Produce modified frame bytes guaranteed to differ from original raw_bytes."""
    if not isinstance(raw_bytes, (bytes, bytearray, memoryview)):
        raise TypeError("raw_bytes must be bytes-like.")
    buf = bytearray(raw_bytes)
    if len(buf) == 0:
        return b"\x00TAMPERED"
    # Flip a byte in the middle of the encoded payload (away from SOI/EOI markers when possible)
    flip_idx = len(buf) // 2
    buf[flip_idx] ^= 0xFF
    return bytes(buf)


def _find_index_by_frame_id(records: list[dict[str, Any]], frame_id: int) -> int:
    for idx, rec in enumerate(records):
        if int(rec["frame_id"]) == frame_id:
            return idx
    raise KeyError(f"Frame {frame_id} not found in chain records.")


def _reindex_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for idx, rec in enumerate(records):
        rec["sequence_index"] = idx
    return records


def simulate_tamper(
    records: list[dict[str, Any]],
    read_frame_bytes: Callable[[int], Optional[bytes]],
    write_frame_bytes: Callable[[int, bytes], None],
    tamper_type: str,
    target_frame_id: Optional[int] = None,
    swap_with_frame_id: Optional[int] = None,
    details: Optional[dict[str, Any]] = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Apply a deterministic tamper mutation to a deep copy of records and/or frame bytes.

    Args:
        records: Ordered list of ChainRecord dicts (never mutated in place).
        read_frame_bytes: Callback(frame_id) -> raw bytes or None.
        write_frame_bytes: Callback(frame_id, mutated_bytes) -> None.
        tamper_type: One of TAMPER_TYPES.
        target_frame_id: Target frame_id (auto-selected from middle of chain if None).
        swap_with_frame_id: Second frame_id for reorder_records (adjacent if None).
        details: Optional type-specific hints (e.g. {"field": "timestamp"}).

    Returns:
        (mutated_records, tamper_metadata)

    Raises:
        ValueError: Invalid tamper_type or insufficient frames.
        KeyError: Requested target_frame_id / swap_with_frame_id / frame bytes not found.
    """
    if tamper_type not in TAMPER_TYPES:
        raise ValueError(
            f"Unsupported tamper_type '{tamper_type}'. Allowed: {', '.join(TAMPER_TYPES)}"
        )
    if not records:
        raise ValueError("Cannot simulate tamper on an empty chain.")

    mutated = copy.deepcopy(records)
    opts = details or {}

    if target_frame_id is None:
        target_idx = len(mutated) // 2
        resolved_target_id = int(mutated[target_idx]["frame_id"])
    else:
        resolved_target_id = int(target_frame_id)
        target_idx = _find_index_by_frame_id(mutated, resolved_target_id)

    affected_frame_ids: list[int] = [resolved_target_id]
    message: str

    if tamper_type == "modify_frame_bytes":
        original_bytes = read_frame_bytes(resolved_target_id)
        if original_bytes is None:
            raise KeyError(
                f"Original encoded frame bytes not found for frame {resolved_target_id}."
            )
        tampered_bytes = mutate_frame_bytes(original_bytes)
        write_frame_bytes(resolved_target_id, tampered_bytes)
        message = (
            f"Modified stored encoded frame bytes for frame {resolved_target_id} "
            "without updating recorded hashes."
        )

    elif tamper_type == "modify_metadata":
        field = str(opts.get("field", "timestamp"))
        target_rec = mutated[target_idx]
        if field == "timestamp":
            orig_ts = str(target_rec.get("timestamp", ""))
            target_rec["timestamp"] = (
                orig_ts[:-1] + "9Z" if orig_ts.endswith("Z") else orig_ts + "_TAMPERED"
            )
            if target_rec["timestamp"] == orig_ts:
                target_rec["timestamp"] = "1999-01-01T00:00:00.000Z"
        elif field == "frame_hash":
            target_rec["frame_hash"] = _corrupt_hex_hash(str(target_rec["frame_hash"]))
        elif field == "chain_hash":
            target_rec["chain_hash"] = _corrupt_hex_hash(str(target_rec["chain_hash"]))
        elif field == "previous_hash":
            target_rec["previous_hash"] = _corrupt_hex_hash(
                str(target_rec["previous_hash"])
            )
        else:
            # Default safe mutation on timestamp for unknown metadata field names
            target_rec["timestamp"] = "1999-01-01T00:00:00.000Z"
            field = "timestamp"
        message = (
            f"Modified metadata field '{field}' on frame {resolved_target_id} "
            "without recalculating chain_hash."
        )

    elif tamper_type == "delete_record":
        mutated.pop(target_idx)
        _reindex_records(mutated)
        message = f"Deleted record for frame {resolved_target_id} from the stored chain."

    elif tamper_type == "reorder_records":
        if len(mutated) < 2:
            raise ValueError("reorder_records requires at least 2 stored frames.")
        if swap_with_frame_id is None:
            swap_idx = target_idx - 1 if target_idx == len(mutated) - 1 else target_idx + 1
            resolved_swap_id = int(mutated[swap_idx]["frame_id"])
        else:
            resolved_swap_id = int(swap_with_frame_id)
            if resolved_swap_id == resolved_target_id:
                raise ValueError(
                    "swap_with_frame_id must differ from target_frame_id for reorder_records."
                )
            swap_idx = _find_index_by_frame_id(mutated, resolved_swap_id)

        mutated[target_idx], mutated[swap_idx] = mutated[swap_idx], mutated[target_idx]
        _reindex_records(mutated)
        affected_frame_ids = [resolved_target_id, resolved_swap_id]
        message = (
            f"Swapped chain positions of frame {resolved_target_id} and "
            f"frame {resolved_swap_id}."
        )

    elif tamper_type == "break_link":
        field = str(opts.get("field", "previous_hash"))
        target_rec = mutated[target_idx]
        if field == "chain_hash":
            target_rec["chain_hash"] = _corrupt_hex_hash(str(target_rec["chain_hash"]))
        else:
            field = "previous_hash"
            target_rec["previous_hash"] = _corrupt_hex_hash(
                str(target_rec["previous_hash"])
            )
        message = f"Corrupted '{field}' link on frame {resolved_target_id}."

    tamper_metadata = {
        "tamper_id": _next_tamper_id(),
        "tamper_type": tamper_type,
        "target_frame_id": resolved_target_id,
        "affected_frame_ids": affected_frame_ids,
        "applied_at": utc_now_iso(),
        "message": message,
    }
    return mutated, tamper_metadata


class IsolatedTamperSimulator:
    """Non-destructive isolated tamper simulation sandbox.

    Copies original chain records and frame bytes into an isolated working copy
    so production records and original frame bytes are NEVER modified.
    Supports simulating tamper attacks, running verification against the modified
    copy, pinpointing the first invalid frame, and resetting back to the original
    clean state.
    """

    def __init__(
        self,
        records: list[dict[str, Any]],
        frame_bytes_source: dict[int, bytes] | Callable[[int], Optional[bytes]],
        *,
        genesis_hash: str = GENESIS_HASH,
    ) -> None:
        self._genesis_hash = genesis_hash
        self._original_records: list[dict[str, Any]] = copy.deepcopy(records)
        self._original_frames: dict[int, bytes] = {}

        if isinstance(frame_bytes_source, dict):
            for fid, raw in frame_bytes_source.items():
                self._original_frames[int(fid)] = bytes(raw)
        else:
            for rec in self._original_records:
                fid = int(rec["frame_id"])
                raw = frame_bytes_source(fid)
                if raw is not None:
                    self._original_frames[fid] = bytes(raw)

        self._working_records: list[dict[str, Any]] = copy.deepcopy(self._original_records)
        self._working_frames: dict[int, bytes] = dict(self._original_frames)
        self._tamper_history: list[dict[str, Any]] = []

    @property
    def working_records(self) -> list[dict[str, Any]]:
        return copy.deepcopy(self._working_records)

    @property
    def tamper_history(self) -> list[dict[str, Any]]:
        return copy.deepcopy(self._tamper_history)

    @property
    def is_tampered(self) -> bool:
        return len(self._tamper_history) > 0

    def _read_working_bytes(self, frame_id: int) -> Optional[bytes]:
        return self._working_frames.get(int(frame_id))

    def _write_working_bytes(self, frame_id: int, data: bytes) -> None:
        self._working_frames[int(frame_id)] = bytes(data)

    def verify(
        self,
        *,
        start_frame_id: Optional[int] = None,
        end_frame_id: Optional[int] = None,
    ) -> dict[str, Any]:
        """Run full verification against the isolated working copy."""
        return verify_chain(
            self._working_records,
            self._read_working_bytes,
            start_frame_id=start_frame_id,
            end_frame_id=end_frame_id,
            genesis_hash=self._genesis_hash,
        )

    def simulate(
        self,
        tamper_type: str = "modify_frame_bytes",
        *,
        target_frame_id: Optional[int] = None,
        swap_with_frame_id: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Apply tamper attack to the isolated copy only and return report + metadata."""
        mutated_records, meta = simulate_tamper(
            self._working_records,
            self._read_working_bytes,
            self._write_working_bytes,
            tamper_type=tamper_type,
            target_frame_id=target_frame_id,
            swap_with_frame_id=swap_with_frame_id,
            details=details,
        )
        self._working_records = mutated_records
        self._tamper_history.append(meta)

        report = self.verify()
        return {
            **meta,
            "snapshot_available": True,
            "first_compromised_frame_id": report["first_compromised_frame_id"],
            "verification": report,
        }

    def reset(self) -> dict[str, Any]:
        """Restore the isolated working copy to the original clean snapshot and re-verify."""
        was_tampered = self.is_tampered
        self._working_records = copy.deepcopy(self._original_records)
        self._working_frames = dict(self._original_frames)
        self._tamper_history.clear()

        report = self.verify()
        return {
            "reset_mode": "restore_snapshot" if was_tampered else "noop",
            "restored_records": len(self._working_records),
            "reset_at": utc_now_iso(),
            "integrity_status": report["status"],
            "message": (
                "Restored isolated test copy to original clean state."
                if was_tampered
                else "Isolated test copy was already clean."
            ),
            "verification": report,
        }


__all__ = [
    "IsolatedTamperSimulator",
    "TAMPER_TYPES",
    "mutate_frame_bytes",
    "simulate_tamper",
]
