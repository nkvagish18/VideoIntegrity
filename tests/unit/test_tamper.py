"""Unit tests for backend/app/security/tamper.py (owned by Laptop 3)."""

from __future__ import annotations

import copy

import pytest

from app.security.tamper import (
    TAMPER_TYPES,
    IsolatedTamperSimulator,
    simulate_tamper,
)
from app.security.verification import verify_chain


# Test Case 10: Isolated simulation & reset restores passing result without corrupting production data
def test_isolated_simulation_and_reset_preserves_original_data(sample_chain) -> None:
    original_records, original_frames = sample_chain
    records_before = copy.deepcopy(original_records)
    frames_before = dict(original_frames)

    sim = IsolatedTamperSimulator(original_records, original_frames)

    # Baseline verify passes
    baseline = sim.verify()
    assert baseline["status"] == "INTACT"
    assert baseline["is_valid"] is True

    # Simulate modifying frame 3 bytes on the isolated test copy
    sim_result = sim.simulate("modify_frame_bytes", target_frame_id=3)
    assert sim_result["tamper_type"] == "modify_frame_bytes"
    assert sim_result["target_frame_id"] == 3
    assert sim_result["first_compromised_frame_id"] == 3
    assert sim_result["verification"]["status"] == "COMPROMISED"
    assert sim_result["verification"]["is_valid"] is False
    assert any(
        v["frame_id"] == 3 and v["violation_type"] == "FRAME_HASH_MISMATCH"
        for v in sim_result["verification"]["violations"]
    )
    assert sim.is_tampered is True

    # Production records and original frame bytes MUST remain completely untouched
    assert original_records == records_before
    assert original_frames == frames_before
    assert verify_chain(original_records, original_frames.get)["is_valid"] is True

    # Reset restores the isolated test copy back to a passing INTACT state
    reset_result = sim.reset()
    assert reset_result["reset_mode"] == "restore_snapshot"
    assert reset_result["restored_records"] == len(original_records)
    assert reset_result["integrity_status"] == "INTACT"
    assert reset_result["verification"]["is_valid"] is True
    assert reset_result["verification"]["violations"] == []
    assert sim.is_tampered is False


@pytest.mark.parametrize(
    ("tamper_type", "expected_violation"),
    [
        ("modify_frame_bytes", "FRAME_HASH_MISMATCH"),
        ("modify_metadata", "CHAIN_HASH_MISMATCH"),
        ("delete_record", "DELETED_RECORD"),
        ("reorder_records", "REORDERED_RECORD"),
        ("break_link", "BROKEN_PREVIOUS_LINK"),
    ],
)
def test_isolated_simulator_all_five_tamper_modes_and_reset(
    sample_chain, tamper_type: str, expected_violation: str
) -> None:
    records, frames = sample_chain
    sim = IsolatedTamperSimulator(records, frames)

    res = sim.simulate(tamper_type, target_frame_id=3)
    report = res["verification"]
    assert report["is_valid"] is False
    assert report["status"] == "COMPROMISED"
    vtypes = {v["violation_type"] for v in report["violations"]}
    assert expected_violation in vtypes

    reset_res = sim.reset()
    assert reset_res["integrity_status"] == "INTACT"
    assert reset_res["verification"]["is_valid"] is True


def test_simulate_tamper_error_conditions(sample_chain, single_frame_chain) -> None:
    records, frames = sample_chain
    buf = dict(frames)

    with pytest.raises(ValueError):
        simulate_tamper(records, buf.get, buf.__setitem__, tamper_type="unknown_mode")

    with pytest.raises(ValueError):
        simulate_tamper([], buf.get, buf.__setitem__, tamper_type="modify_frame_bytes")

    with pytest.raises(KeyError):
        simulate_tamper(
            records,
            buf.get,
            buf.__setitem__,
            tamper_type="modify_frame_bytes",
            target_frame_id=999,
        )

    single_recs, single_frames = single_frame_chain
    sbuf = dict(single_frames)
    with pytest.raises(ValueError):
        simulate_tamper(
            single_recs,
            sbuf.get,
            sbuf.__setitem__,
            tamper_type="reorder_records",
        )


def test_tamper_types_constant_matches_contract() -> None:
    assert set(TAMPER_TYPES) == {
        "modify_frame_bytes",
        "modify_metadata",
        "delete_record",
        "reorder_records",
        "break_link",
    }
