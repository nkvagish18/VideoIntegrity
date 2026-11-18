"""Cryptographic hash-chain and frame-byte verification engine (owned by Laptop 3).

Strict adherence to docs/API_CONTRACT.md v1.0.0 and docs/DEVELOPMENT_GUIDE.md:
- Reuses shared SHA-256 and canonical JSON functions from app.services.hashing.
- Recomputes frame_hash from stored original encoded frame bytes.
- Recomputes chain_hash from deterministic canonical JSON.
- Detects modified frame bytes, modified metadata/hashes, missing frame bytes,
  deleted records, reordered/duplicated records, and invalid genesis/predecessor links.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from app.services.hashing import (
    GENESIS_HASH,
    canonical_json,
    compute_chain_hash,
    compute_frame_hash,
    utc_now_iso,
)

_VERIFICATION_COUNTER_LOCK = threading.Lock()
_VERIFICATION_COUNTER = 0


def _next_verification_id() -> str:
    global _VERIFICATION_COUNTER
    with _VERIFICATION_COUNTER_LOCK:
        _VERIFICATION_COUNTER += 1
        seq = _VERIFICATION_COUNTER
    now_tag = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"ver_{now_tag}_{seq:03d}"


def _make_violation(
    *,
    sequence_index: int,
    frame_id: int,
    violation_type: str,
    message: str,
    expected: Optional[str],
    actual: Optional[str],
) -> dict[str, Any]:
    return {
        "sequence_index": sequence_index,
        "frame_id": frame_id,
        "violation_type": violation_type,
        "message": message,
        "expected": expected,
        "actual": actual,
    }


def verify_chain(
    records: list[dict[str, Any]],
    frame_bytes_loader: Callable[[int], Optional[bytes]],
    *,
    start_frame_id: Optional[int] = None,
    end_frame_id: Optional[int] = None,
    genesis_hash: str = GENESIS_HASH,
) -> dict[str, Any]:
    """Verify stored frame bytes and hash-chain continuity.

    Args:
        records: Ordered list of ChainRecord dicts in stored sequence order.
        frame_bytes_loader: Callback(frame_id) -> raw stored frame bytes or None.
        start_frame_id: Optional inclusive lower frame_id bound.
        end_frame_id: Optional inclusive upper frame_id bound.
        genesis_hash: Fixed expected previous_hash for the genesis record.

    Returns:
        Dict strictly matching VerificationReport in docs/API_CONTRACT.md.
    """
    t0 = time.perf_counter()
    verification_id = _next_verification_id()
    verified_at = utc_now_iso()

    # Build (original_position, record) pairs, applying optional inclusive frame_id filter
    indexed_records: list[tuple[int, dict[str, Any]]] = []
    for full_pos, rec in enumerate(records):
        fid = int(rec["frame_id"])
        if start_frame_id is not None and fid < start_frame_id:
            continue
        if end_frame_id is not None and fid > end_frame_id:
            continue
        indexed_records.append((full_pos, rec))

    total_records = len(indexed_records)
    if total_records == 0:
        duration_ms = round((time.perf_counter() - t0) * 1000.0, 3)
        return {
            "verification_id": verification_id,
            "verified_at": verified_at,
            "status": "EMPTY",
            "is_valid": True,
            "total_records": 0,
            "valid_records": 0,
            "compromised_records": 0,
            "first_compromised_frame_id": None,
            "genesis_hash": genesis_hash,
            "duration_ms": duration_ms,
            "violations": [],
        }

    # Track all frame IDs present in the full chain to distinguish deletions from reorderings
    all_present_frame_ids = {int(rec["frame_id"]) for rec in records}
    seen_frame_ids: set[int] = set()

    violations: list[dict[str, Any]] = []
    compromised_positions: set[int] = set()
    first_compromised_frame_id: Optional[int] = None

    def record_violation(
        pos_in_scope: int,
        *,
        sequence_index: int,
        frame_id: int,
        violation_type: str,
        message: str,
        expected: Optional[str],
        actual: Optional[str],
    ) -> None:
        nonlocal first_compromised_frame_id
        violations.append(
            _make_violation(
                sequence_index=sequence_index,
                frame_id=frame_id,
                violation_type=violation_type,
                message=message,
                expected=expected,
                actual=actual,
            )
        )
        compromised_positions.add(pos_in_scope)
        if first_compromised_frame_id is None:
            first_compromised_frame_id = frame_id

    for scope_idx, (full_pos, rec) in enumerate(indexed_records):
        seq_idx = int(rec.get("sequence_index", full_pos))
        frame_id = int(rec["frame_id"])
        timestamp = rec.get("timestamp")
        stored_frame_hash = rec.get("frame_hash")
        stored_previous_hash = rec.get("previous_hash")
        stored_chain_hash = rec.get("chain_hash")

        # ------------------------------------------------------------------
        # 1. Load stored original encoded frame bytes & recompute frame_hash
        # ------------------------------------------------------------------
        raw_bytes = frame_bytes_loader(frame_id)
        if raw_bytes is None or len(raw_bytes) == 0:
            record_violation(
                scope_idx,
                sequence_index=seq_idx,
                frame_id=frame_id,
                violation_type="MISSING_FRAME_BYTES",
                message=f"Stored original frame bytes are missing for frame {frame_id}.",
                expected=str(stored_frame_hash) if stored_frame_hash is not None else None,
                actual="MISSING",
            )
        else:
            recomputed_frame_hash = compute_frame_hash(raw_bytes)
            if recomputed_frame_hash != stored_frame_hash:
                record_violation(
                    scope_idx,
                    sequence_index=seq_idx,
                    frame_id=frame_id,
                    violation_type="FRAME_HASH_MISMATCH",
                    message=(
                        f"Recomputed frame_hash does not match stored frame_hash "
                        f"for frame {frame_id}."
                    ),
                    expected=str(stored_frame_hash) if stored_frame_hash is not None else None,
                    actual=recomputed_frame_hash,
                )

        # ------------------------------------------------------------------
        # 2. Recompute chain_hash using canonical JSON serialization
        # ------------------------------------------------------------------
        try:
            recomputed_chain_hash = compute_chain_hash(
                frame_id=frame_id,
                timestamp=timestamp,
                frame_hash=stored_frame_hash,
                previous_hash=stored_previous_hash,
            )
            if recomputed_chain_hash != stored_chain_hash:
                record_violation(
                    scope_idx,
                    sequence_index=seq_idx,
                    frame_id=frame_id,
                    violation_type="CHAIN_HASH_MISMATCH",
                    message=(
                        f"Recomputed chain_hash does not match stored chain_hash "
                        f"for frame {frame_id}."
                    ),
                    expected=recomputed_chain_hash,
                    actual=str(stored_chain_hash) if stored_chain_hash is not None else None,
                )
        except (ValueError, TypeError) as exc:
            record_violation(
                scope_idx,
                sequence_index=seq_idx,
                frame_id=frame_id,
                violation_type="CHAIN_HASH_MISMATCH",
                message=(
                    f"Malformed metadata prevented canonical chain_hash computation "
                    f"for frame {frame_id}: {exc}"
                ),
                expected="VALID_CANONICAL_CHAIN_HASH",
                actual=str(stored_chain_hash) if stored_chain_hash is not None else None,
            )

        # ------------------------------------------------------------------
        # 3. Structural sequence, genesis link, and previous_hash link checks
        # ------------------------------------------------------------------
        if full_pos == 0:
            # First record in the stored chain must link to GENESIS_HASH and start at frame_id == 1
            if stored_previous_hash != genesis_hash:
                record_violation(
                    scope_idx,
                    sequence_index=seq_idx,
                    frame_id=frame_id,
                    violation_type="INVALID_GENESIS_LINK",
                    message=(
                        f"Genesis record (frame {frame_id}) previous_hash does not "
                        f"match fixed GENESIS_HASH."
                    ),
                    expected=genesis_hash,
                    actual=str(stored_previous_hash) if stored_previous_hash is not None else None,
                )
            if frame_id > 1:
                missing_leading = [
                    fid for fid in range(1, frame_id) if fid not in all_present_frame_ids
                ]
                if missing_leading:
                    record_violation(
                        scope_idx,
                        sequence_index=seq_idx,
                        frame_id=frame_id,
                        violation_type="DELETED_RECORD",
                        message=(
                            f"Missing leading frame record(s) {missing_leading} before "
                            f"first stored frame {frame_id}."
                        ),
                        expected="1",
                        actual=str(frame_id),
                    )
                else:
                    record_violation(
                        scope_idx,
                        sequence_index=seq_idx,
                        frame_id=frame_id,
                        violation_type="REORDERED_RECORD",
                        message=(
                            f"First stored record is frame {frame_id}, but earlier "
                            f"frame(s) appear later in the chain."
                        ),
                        expected="1",
                        actual=str(frame_id),
                    )
        else:
            prev_rec = records[full_pos - 1]
            prev_frame_id = int(prev_rec["frame_id"])
            prev_chain_hash = prev_rec.get("chain_hash")

            # Duplicate or decreasing frame_id -> REORDERED_RECORD
            if frame_id in seen_frame_ids:
                record_violation(
                    scope_idx,
                    sequence_index=seq_idx,
                    frame_id=frame_id,
                    violation_type="REORDERED_RECORD",
                    message=(
                        f"Duplicate frame_id {frame_id} detected at sequence index {seq_idx}."
                    ),
                    expected=str(prev_frame_id + 1),
                    actual=str(frame_id),
                )
            elif frame_id <= prev_frame_id:
                record_violation(
                    scope_idx,
                    sequence_index=seq_idx,
                    frame_id=frame_id,
                    violation_type="REORDERED_RECORD",
                    message=(
                        f"Out-of-order frame {frame_id} follows frame {prev_frame_id} "
                        f"(expected frame {prev_frame_id + 1})."
                    ),
                    expected=str(prev_frame_id + 1),
                    actual=str(frame_id),
                )
            elif frame_id > prev_frame_id + 1:
                skipped_ids = list(range(prev_frame_id + 1, frame_id))
                genuinely_missing = [
                    fid for fid in skipped_ids if fid not in all_present_frame_ids
                ]
                if genuinely_missing:
                    record_violation(
                        scope_idx,
                        sequence_index=seq_idx,
                        frame_id=frame_id,
                        violation_type="DELETED_RECORD",
                        message=(
                            f"Missing frame record(s) {genuinely_missing} between "
                            f"frame {prev_frame_id} and frame {frame_id}."
                        ),
                        expected=str(prev_frame_id + 1),
                        actual=str(frame_id),
                    )
                else:
                    record_violation(
                        scope_idx,
                        sequence_index=seq_idx,
                        frame_id=frame_id,
                        violation_type="REORDERED_RECORD",
                        message=(
                            f"Frame {frame_id} appears prematurely after frame {prev_frame_id}; "
                            f"skipped frame(s) {skipped_ids} exist elsewhere in the chain."
                        ),
                        expected=str(prev_frame_id + 1),
                        actual=str(frame_id),
                    )

            # Previous chain hash linkage check -> BROKEN_PREVIOUS_LINK
            if stored_previous_hash != prev_chain_hash:
                record_violation(
                    scope_idx,
                    sequence_index=seq_idx,
                    frame_id=frame_id,
                    violation_type="BROKEN_PREVIOUS_LINK",
                    message=(
                        f"Frame {frame_id} previous_hash does not match predecessor "
                        f"frame {prev_frame_id} chain_hash."
                    ),
                    expected=str(prev_chain_hash) if prev_chain_hash is not None else None,
                    actual=str(stored_previous_hash) if stored_previous_hash is not None else None,
                )

        seen_frame_ids.add(frame_id)

    compromised_records = len(compromised_positions)
    valid_records = total_records - compromised_records
    is_valid = len(violations) == 0
    status = "INTACT" if is_valid else "COMPROMISED"
    duration_ms = round((time.perf_counter() - t0) * 1000.0, 3)

    return {
        "verification_id": verification_id,
        "verified_at": verified_at,
        "status": status,
        "is_valid": is_valid,
        "total_records": total_records,
        "valid_records": valid_records,
        "compromised_records": compromised_records,
        "first_compromised_frame_id": first_compromised_frame_id,
        "genesis_hash": genesis_hash,
        "duration_ms": duration_ms,
        "violations": violations,
    }


__all__ = [
    "GENESIS_HASH",
    "canonical_json",
    "compute_chain_hash",
    "compute_frame_hash",
    "verify_chain",
]
