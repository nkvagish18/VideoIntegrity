"""End-to-end integration tests wiring Laptop 3's security modules into Laptop 1's FastAPI backend."""

from __future__ import annotations

import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_fastapi_verify_tamper_and_reset_end_to_end(tmp_path: Path) -> None:
    db_path = tmp_path / "integration_test.db"
    app = create_app(db_path=db_path)

    with TestClient(app) as client:
        # 1. Confirm backend detects Laptop 3's security modules automatically
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["verification_module_loaded"] is True
        assert health.json()["tamper_module_loaded"] is True

        # 2. Empty chain verification returns EMPTY + valid
        r_empty = client.post("/api/verify", json={})
        assert r_empty.status_code == 200
        assert r_empty.json()["status"] == "EMPTY"
        assert r_empty.json()["is_valid"] is True

        # 3. Capture several real JPEG frames from synthetic OpenCV source
        r_start = client.post("/api/stream/start", json={"source": "synthetic", "fps": 5.0})
        assert r_start.status_code == 200
        time.sleep(1.1)
        r_stop = client.post("/api/stream/stop")
        assert r_stop.status_code == 200
        captured_count = r_stop.json()["frames_captured"]
        assert captured_count >= 3

        # 4. Full verification on fresh chain passes
        r_ok = client.post("/api/verify", json={})
        assert r_ok.status_code == 200
        ok_data = r_ok.json()
        assert ok_data["status"] == "INTACT"
        assert ok_data["is_valid"] is True
        assert ok_data["total_records"] == captured_count
        assert ok_data["violations"] == []

        # 5. Simulate tamper over REST + confirm WebSocket tamper_alert & verification_result
        with client.websocket_connect("/ws/live") as ws:
            # Drain initial hydration events
            assert ws.receive_json()["event"] == "stream_status"
            assert ws.receive_json()["event"] == "integrity_update"

            r_sim = client.post(
                "/api/tamper/simulate",
                json={"tamper_type": "modify_frame_bytes", "target_frame_id": 2},
            )
            assert r_sim.status_code == 200, r_sim.text
            sim_data = r_sim.json()
            assert sim_data["tamper_type"] == "modify_frame_bytes"
            assert sim_data["target_frame_id"] == 2
            assert sim_data["snapshot_available"] is True
            assert sim_data["verification"]["status"] == "COMPROMISED"
            assert sim_data["verification"]["is_valid"] is False
            assert sim_data["verification"]["first_compromised_frame_id"] == 2

            ws_events = [ws.receive_json()["event"] for _ in range(3)]
            assert "tamper_alert" in ws_events
            assert "verification_result" in ws_events
            assert "integrity_update" in ws_events

            # 6. Subsequent POST /api/verify also reports COMPROMISED
            r_ver2 = client.post("/api/verify", json={})
            assert r_ver2.status_code == 200
            assert r_ver2.json()["is_valid"] is False
            assert r_ver2.json()["first_compromised_frame_id"] == 2

            # Drain WS events from POST /api/verify
            for _ in range(3):
                ws.receive_json()

            # 7. Reset simulation restores snapshot and returns INTACT
            r_reset = client.post("/api/tamper/reset", json={"clear_all": False})
            assert r_reset.status_code == 200, r_reset.text
            reset_data = r_reset.json()
            assert reset_data["reset_mode"] == "restore_snapshot"
            assert reset_data["restored_records"] == captured_count
            assert reset_data["integrity_status"] == "INTACT"
            assert reset_data["verification"]["is_valid"] is True
            assert reset_data["verification"]["violations"] == []

        # 8. Test delete_record and reorder_records + clean clear_all reset
        r_del = client.post(
            "/api/tamper/simulate",
            json={"tamper_type": "delete_record", "target_frame_id": 2},
        )
        assert r_del.status_code == 200
        del_vtypes = {v["violation_type"] for v in r_del.json()["verification"]["violations"]}
        assert "DELETED_RECORD" in del_vtypes
        assert "BROKEN_PREVIOUS_LINK" in del_vtypes

        r_restore = client.post("/api/tamper/reset", json={"clear_all": False})
        assert r_restore.status_code == 200
        assert r_restore.json()["integrity_status"] == "INTACT"

        r_reord = client.post(
            "/api/tamper/simulate",
            json={
                "tamper_type": "reorder_records",
                "target_frame_id": 1,
                "swap_with_frame_id": 2,
            },
        )
        assert r_reord.status_code == 200
        reord_vtypes = {v["violation_type"] for v in r_reord.json()["verification"]["violations"]}
        assert "REORDERED_RECORD" in reord_vtypes

        r_clear = client.post("/api/tamper/reset", json={"clear_all": True})
        assert r_clear.status_code == 200
        assert r_clear.json()["reset_mode"] == "clear_all"
        assert r_clear.json()["integrity_status"] == "EMPTY"
        assert r_clear.json()["verification"]["status"] == "EMPTY"
        assert r_clear.json()["verification"]["is_valid"] is True
