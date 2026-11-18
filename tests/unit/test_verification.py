"""Unit tests for backend/app/security/verification.py (owned by Laptop 3)."""

from __future__ import annotations

import copy

from app.security.verification import GENESIS_HASH, verify_chain


def _flip_hex(hex_str: str) -> str:
    return ("0" if hex_str[0] != "0" else "f") + hex_str[1:]


# Test Case 1: Valid chain passes
def test_valid_chain_passes(sample_chain) -> None:
    records, frames = sample_chain
    report = verify_chain(records, frames.get)

    assert report["status"] == "INTACT"
    assert report["is_valid"] is True
    assert report["total_records"] == 5
    assert report["valid_records"] == 5
    assert report["compromised_records"] == 0
    assert report["first_compromised_frame_id"] is None
    assert report["genesis_hash"] == GENESIS_HASH
    assert report["violations"] == []
    assert report["duration_ms"] >= 0.0


# Test Case 2: Modified frame bytes fail
def test_modified_frame_bytes_fail(sample_chain) -> None:
    records, frames = sample_chain
    tampered_frames = dict(frames)
    tampered_frames[3] = frames[3] + b"\x01"

    report = verify_chain(records, tampered_frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 3
    assert report["compromised_records"] == 1
    assert report["valid_records"] == 4
    vtypes = [v["violation_type"] for v in report["violations"]]
    assert vtypes == ["FRAME_HASH_MISMATCH"]
    assert report["violations"][0]["frame_id"] == 3


# Test Case 3: Modified stored frame_hash fails
def test_modified_frame_hash_fails(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered[1]["frame_hash"] = _flip_hex(tampered[1]["frame_hash"])

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 2
    vtypes = {v["violation_type"] for v in report["violations"] if v["frame_id"] == 2}
    assert "FRAME_HASH_MISMATCH" in vtypes
    assert "CHAIN_HASH_MISMATCH" in vtypes


# Test Case 4: Modified stored chain_hash fails
def test_modified_chain_hash_fails(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered[2]["chain_hash"] = _flip_hex(tampered[2]["chain_hash"])

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 3
    by_frame = {
        fid: {v["violation_type"] for v in report["violations"] if v["frame_id"] == fid}
        for fid in (3, 4)
    }
    assert "CHAIN_HASH_MISMATCH" in by_frame[3]
    assert "BROKEN_PREVIOUS_LINK" in by_frame[4]


# Test Case 5: Missing frame fails (deleted record, missing bytes, and missing genesis)
def test_missing_middle_record_fails(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered.pop(2)  # remove frame_id=3
    for idx, rec in enumerate(tampered):
        rec["sequence_index"] = idx

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 4
    vtypes = {v["violation_type"] for v in report["violations"] if v["frame_id"] == 4}
    assert "DELETED_RECORD" in vtypes
    assert "BROKEN_PREVIOUS_LINK" in vtypes


def test_missing_genesis_record_fails(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records[1:])  # remove frame_id=1
    for idx, rec in enumerate(tampered):
        rec["sequence_index"] = idx

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 2
    vtypes = {v["violation_type"] for v in report["violations"] if v["frame_id"] == 2}
    assert "INVALID_GENESIS_LINK" in vtypes
    assert "DELETED_RECORD" in vtypes


def test_missing_frame_bytes_fails(sample_chain) -> None:
    records, frames = sample_chain
    incomplete_frames = dict(frames)
    incomplete_frames.pop(4)

    report = verify_chain(records, incomplete_frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 4
    assert any(
        v["frame_id"] == 4 and v["violation_type"] == "MISSING_FRAME_BYTES"
        for v in report["violations"]
    )


# Test Case 6: Reordered frames fail (plus duplicate frame IDs)
def test_reordered_frames_fail(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered[1], tampered[2] = tampered[2], tampered[1]  # [1, 3, 2, 4, 5]
    for idx, rec in enumerate(tampered):
        rec["sequence_index"] = idx

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 3
    vtypes = {v["violation_type"] for v in report["violations"]}
    assert "REORDERED_RECORD" in vtypes
    assert "BROKEN_PREVIOUS_LINK" in vtypes
    # Frame 2 is present later in chain, so it should NOT be falsely labeled DELETED_RECORD
    assert "DELETED_RECORD" not in vtypes


def test_duplicate_frame_id_detected_as_reordered(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered.append(copy.deepcopy(records[1]))
    for idx, rec in enumerate(tampered):
        rec["sequence_index"] = idx

    report = verify_chain(tampered, frames.get)

    assert report["is_valid"] is False
    assert any(v["violation_type"] == "REORDERED_RECORD" for v in report["violations"])


# Test Case 7: Invalid previous_hash fails (both non-genesis and genesis)
def test_invalid_previous_hash_fails(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered[3]["previous_hash"] = _flip_hex(tampered[3]["previous_hash"])

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 4
    vtypes = {v["violation_type"] for v in report["violations"] if v["frame_id"] == 4}
    assert "BROKEN_PREVIOUS_LINK" in vtypes
    assert "CHAIN_HASH_MISMATCH" in vtypes


def test_invalid_genesis_previous_hash_fails(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered[0]["previous_hash"] = _flip_hex(GENESIS_HASH)

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 1
    vtypes = {v["violation_type"] for v in report["violations"] if v["frame_id"] == 1}
    assert "INVALID_GENESIS_LINK" in vtypes
    assert "CHAIN_HASH_MISMATCH" in vtypes


# Test Case 8: Empty chain is handled gracefully
def test_empty_chain_handled() -> None:
    report = verify_chain([], lambda _fid: None)

    assert report["status"] == "EMPTY"
    assert report["is_valid"] is True
    assert report["total_records"] == 0
    assert report["valid_records"] == 0
    assert report["compromised_records"] == 0
    assert report["first_compromised_frame_id"] is None
    assert report["violations"] == []


# Test Case 9: Single-frame chain passes
def test_single_frame_chain_passes(single_frame_chain) -> None:
    records, frames = single_frame_chain
    report = verify_chain(records, frames.get)

    assert report["status"] == "INTACT"
    assert report["is_valid"] is True
    assert report["total_records"] == 1
    assert report["valid_records"] == 1
    assert report["compromised_records"] == 0
    assert report["first_compromised_frame_id"] is None
    assert report["violations"] == []


def test_modified_metadata_timestamp_fails(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered[2]["timestamp"] = "2099-01-01T00:00:00.000Z"

    report = verify_chain(tampered, frames.get)

    assert report["status"] == "COMPROMISED"
    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 3
    assert [v["violation_type"] for v in report["violations"]] == ["CHAIN_HASH_MISMATCH"]


def test_malformed_metadata_does_not_crash_verifier(sample_chain) -> None:
    records, frames = sample_chain
    tampered = copy.deepcopy(records)
    tampered[1]["frame_hash"] = "short-corrupt-hash"

    report = verify_chain(tampered, frames.get)

    assert report["is_valid"] is False
    assert report["first_compromised_frame_id"] == 2
    vtypes = {v["violation_type"] for v in report["violations"] if v["frame_id"] == 2}
    assert "FRAME_HASH_MISMATCH" in vtypes
    assert "CHAIN_HASH_MISMATCH" in vtypes


def test_subrange_verification(sample_chain) -> None:
    records, frames = sample_chain
    report = verify_chain(records, frames.get, start_frame_id=2, end_frame_id=4)

    assert report["status"] == "INTACT"
    assert report["is_valid"] is True
    assert report["total_records"] == 3
    assert report["valid_records"] == 3
