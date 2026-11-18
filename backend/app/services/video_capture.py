"""Thread-safe OpenCV video capture service (webcam, synthetic, file) with SHA-256 chaining."""

from __future__ import annotations

import base64
import logging
import os
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np

from app.config import DEFAULT_ENCODING
from app.database.db import IntegrityDatabase
from app.models.schemas import APIError, IntegrityStatus, StreamSource, StreamState
from app.services.hashing import utc_now_iso
from app.services.ws_manager import WebSocketManager

logger = logging.getLogger("videointegrity.capture")


def _new_stream_id() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("str_%Y%m%d_%H%M%S")


def _open_webcam_capture(device_index: int) -> cv2.VideoCapture:
    """Open webcam cleanly, preferring DirectShow on Windows for reliable release."""
    if sys.platform.startswith("win"):
        cap = cv2.VideoCapture(device_index, cv2.CAP_DSHOW)
        if cap.isOpened():
            return cap
        cap.release()
    return cv2.VideoCapture(device_index)


def _generate_synthetic_frame(frame_seq: int, timestamp: str) -> np.ndarray:
    """Generate a deterministic-style live animated BGR frame for reliable camera-free capture."""
    width, height = 640, 360
    frame = np.zeros((height, width, 3), dtype=np.uint8)

    # Subtle dark slate gradient background
    y_grad = np.linspace(18, 48, height, dtype=np.uint8)[:, None]
    x_grad = np.linspace(22, 62, width, dtype=np.uint8)[None, :]
    frame[:, :, 0] = np.clip(x_grad + 20, 0, 255)
    frame[:, :, 1] = np.clip(y_grad + 10, 0, 255)
    frame[:, :, 2] = 24

    # Animated moving indicator bar so consecutive frames have distinct pixel bytes
    bar_x = (frame_seq * 23) % (width - 80)
    cv2.rectangle(frame, (bar_x, 270), (bar_x + 80, 295), (60, 210, 120), -1)

    # Animated color wheel dot
    hue_shift = (frame_seq * 17) % 255
    cv2.circle(
        frame,
        (width - 65, 65),
        28,
        (hue_shift, (255 - hue_shift), 180),
        -1,
    )

    # Clean HUD overlays
    cv2.rectangle(frame, (20, 20), (width - 20, height - 20), (90, 130, 170), 2)
    cv2.putText(
        frame,
        "VIDEOINTEGRITY // LIVE SHA-256 STREAM",
        (36, 62),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (230, 240, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        f"SOURCE: SYNTHETIC   TICK: #{frame_seq:06d}",
        (36, 118),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (160, 220, 255),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        f"UTC: {timestamp}",
        (36, 162),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (130, 255, 190),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        frame,
        "HASH CHAIN ACTIVE",
        (36, 225),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (90, 235, 150),
        2,
        cv2.LINE_AA,
    )
    return frame


class VideoCaptureManager:
    """Coordinates single-threaded OpenCV capture, JPEG encoding, DB chaining, and WS push."""

    def __init__(self, db: IntegrityDatabase, ws_manager: WebSocketManager) -> None:
        self._db = db
        self._ws = ws_manager
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        self._status: StreamState = StreamState.IDLE
        self._stream_id: Optional[str] = None
        self._source: Optional[StreamSource] = None
        self._fps: Optional[float] = None
        self._started_at: Optional[str] = None
        self._stopped_at: Optional[str] = None
        self._last_error: Optional[str] = None
        self._synthetic_tick: int = 0

    def get_status_dict(self) -> dict[str, Any]:
        """Build StreamStatusResponse-compatible dictionary."""
        with self._lock:
            status = self._status.value
            stream_id = self._stream_id
            source = self._source.value if self._source is not None else None
            fps = self._fps
            started_at = self._started_at
            stopped_at = self._stopped_at

        summary = self._db.get_summary()
        return {
            "status": status,
            "stream_id": stream_id,
            "source": source,
            "fps": fps,
            "started_at": started_at,
            "stopped_at": stopped_at,
            "frames_captured": summary["total_records"],
            "latest_frame_id": summary["latest_frame_id"],
            "latest_chain_hash": summary["latest_chain_hash"],
            "integrity_status": summary["integrity_status"],
            "tamper_active": summary["tamper_active"],
            "active_tamper_count": summary["active_tamper_count"],
            "connected_ws_clients": self._ws.client_count,
        }

    def get_integrity_dict(self) -> dict[str, Any]:
        """Build integrity_update WebSocket payload dictionary."""
        summary = self._db.get_summary()
        return {
            "integrity_status": summary["integrity_status"],
            "total_records": summary["total_records"],
            "valid_records": summary["valid_records"],
            "compromised_records": summary["compromised_records"],
            "latest_frame_id": summary["latest_frame_id"],
            "latest_chain_hash": summary["latest_chain_hash"],
            "tamper_active": summary["tamper_active"],
            "active_tamper_count": summary["active_tamper_count"],
        }

    def start(
        self,
        *,
        source: str = "synthetic",
        fps: float = 2.0,
        device_index: int = 0,
        file_path: Optional[str] = None,
        reset_existing: bool = False,
        jpeg_quality: int = 85,
    ) -> dict[str, Any]:
        """Validate source, prevent duplicate threads, open OpenCV capture, and start loop."""
        try:
            parsed_source = StreamSource(source)
        except ValueError as exc:
            raise APIError(
                status_code=400,
                code="INVALID_SOURCE",
                message=f"Unsupported stream source '{source}'. Expected 'synthetic', 'webcam', or 'file'.",
                details={"allowed_sources": [s.value for s in StreamSource]},
            ) from exc

        if parsed_source == StreamSource.FILE:
            if not file_path or not file_path.strip():
                raise APIError(
                    status_code=400,
                    code="INVALID_SOURCE",
                    message="file_path is required when source is 'file'.",
                )
            if not Path(file_path).is_file():
                raise APIError(
                    status_code=400,
                    code="INVALID_SOURCE",
                    message=f"Video file not found: {file_path}",
                    details={"file_path": file_path},
                )

        with self._lock:
            if self._status == StreamState.RUNNING or (
                self._thread is not None and self._thread.is_alive()
            ):
                raise APIError(
                    status_code=409,
                    code="STREAM_ALREADY_RUNNING",
                    message="Video stream is already running.",
                    details={"stream_id": self._stream_id},
                )

            # Initialize OpenCV capture handle synchronously so camera/file errors return immediately
            cap: Optional[cv2.VideoCapture] = None
            first_frame: Optional[np.ndarray] = None

            if parsed_source == StreamSource.WEBCAM:
                cap = _open_webcam_capture(device_index)
                if not cap.isOpened():
                    cap.release()
                    self._status = StreamState.ERROR
                    self._last_error = f"Unable to open webcam device {device_index}."
                    raise APIError(
                        status_code=500,
                        code="CAPTURE_INIT_FAILED",
                        message=f"Unable to open webcam device {device_index}. Ensure a camera is connected and not in use.",
                        details={"device_index": device_index},
                    )
                ok, frame = cap.read()
                if not ok or frame is None:
                    cap.release()
                    self._status = StreamState.ERROR
                    self._last_error = f"Webcam device {device_index} opened but failed to deliver frames."
                    raise APIError(
                        status_code=500,
                        code="CAPTURE_INIT_FAILED",
                        message=f"Webcam device {device_index} opened but failed to read an initial frame.",
                        details={"device_index": device_index},
                    )
                first_frame = frame

            elif parsed_source == StreamSource.FILE:
                cap = cv2.VideoCapture(str(file_path))
                if not cap.isOpened():
                    cap.release()
                    self._status = StreamState.ERROR
                    self._last_error = f"Unable to open video file '{file_path}'."
                    raise APIError(
                        status_code=500,
                        code="CAPTURE_INIT_FAILED",
                        message=f"OpenCV could not open video file '{file_path}'.",
                        details={"file_path": file_path},
                    )

            if reset_existing:
                self._db.clear_all()

            started_at = utc_now_iso()
            stream_id = _new_stream_id()

            self._stop_event.clear()
            self._status = StreamState.RUNNING
            self._stream_id = stream_id
            self._source = parsed_source
            self._fps = float(fps)
            self._started_at = started_at
            self._stopped_at = None
            self._last_error = None

            self._thread = threading.Thread(
                target=self._capture_loop,
                name=f"VideoIntegrityCapture-{stream_id}",
                kwargs={
                    "source": parsed_source,
                    "fps": float(fps),
                    "jpeg_quality": int(jpeg_quality),
                    "cap": cap,
                    "initial_frame": first_frame,
                },
                daemon=True,
            )
            self._thread.start()

        frames_captured = self._db.get_summary()["total_records"]
        self._ws.broadcast_threadsafe("stream_status", self.get_status_dict())

        return {
            "status": StreamState.RUNNING.value,
            "stream_id": stream_id,
            "source": parsed_source.value,
            "fps": float(fps),
            "started_at": started_at,
            "frames_captured": frames_captured,
            "message": "Stream started successfully.",
        }

    def stop(self, *, allow_idle: bool = False) -> Optional[dict[str, Any]]:
        """Stop active capture thread cleanly and release OpenCV resources."""
        with self._lock:
            is_running = self._status == StreamState.RUNNING or (
                self._thread is not None and self._thread.is_alive()
            )
            if not is_running:
                if allow_idle:
                    return None
                raise APIError(
                    status_code=409,
                    code="STREAM_NOT_RUNNING",
                    message="Video stream is not currently running.",
                )
            self._stop_event.set()
            thread_to_join = self._thread

        if thread_to_join is not None and thread_to_join.is_alive():
            thread_to_join.join(timeout=4.0)

        stopped_at = utc_now_iso()
        with self._lock:
            self._status = StreamState.IDLE
            self._stopped_at = stopped_at
            self._thread = None
            stream_id = self._stream_id or "str_unknown"

        frames_captured = self._db.get_summary()["total_records"]
        self._ws.broadcast_threadsafe("stream_status", self.get_status_dict())

        return {
            "status": StreamState.IDLE.value,
            "stream_id": stream_id,
            "stopped_at": stopped_at,
            "frames_captured": frames_captured,
            "message": "Stream stopped successfully.",
        }

    def _capture_loop(
        self,
        *,
        source: StreamSource,
        fps: float,
        jpeg_quality: int,
        cap: Optional[cv2.VideoCapture],
        initial_frame: Optional[np.ndarray],
    ) -> None:
        """Background thread loop extracting frames at target FPS and chaining SHA-256 hashes."""
        interval = 1.0 / max(fps, 0.5)
        consecutive_failures = 0
        max_consecutive_failures = 5
        pending_frame = initial_frame

        try:
            while not self._stop_event.is_set():
                loop_start = time.monotonic()
                timestamp = utc_now_iso()

                frame: Optional[np.ndarray] = None
                if pending_frame is not None:
                    frame = pending_frame
                    pending_frame = None
                elif source == StreamSource.SYNTHETIC:
                    self._synthetic_tick += 1
                    frame = _generate_synthetic_frame(self._synthetic_tick, timestamp)
                elif cap is not None:
                    ok, grabbed = cap.read()
                    if not ok or grabbed is None:
                        if source == StreamSource.FILE:
                            # Loop video file back to frame 0 cleanly
                            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                            ok, grabbed = cap.read()
                        if not ok or grabbed is None:
                            consecutive_failures += 1
                            logger.warning(
                                "Frame read failure (%d/%d) on source=%s",
                                consecutive_failures,
                                max_consecutive_failures,
                                source.value,
                            )
                            if consecutive_failures >= max_consecutive_failures:
                                self._handle_stream_error(
                                    f"Capture source '{source.value}' disconnected after {consecutive_failures} read failures."
                                )
                                break
                            self._stop_event.wait(timeout=0.25)
                            continue
                    consecutive_failures = 0
                    frame = grabbed

                if frame is None:
                    continue

                ok_enc, encoded_buf = cv2.imencode(
                    ".jpg",
                    frame,
                    [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality],
                )
                if not ok_enc or encoded_buf is None:
                    logger.warning("Failed to JPEG-encode captured frame; skipping.")
                    continue

                frame_bytes = encoded_buf.tobytes()

                try:
                    record = self._db.append_frame(
                        frame_bytes=frame_bytes,
                        timestamp=timestamp,
                        encoding=DEFAULT_ENCODING,
                    )
                except Exception as exc:
                    logger.exception("Database error persisting frame: %s", exc)
                    self._handle_stream_error(f"Database persistence error: {exc}")
                    break

                frame_payload = dict(record)
                frame_payload["image_base64"] = base64.b64encode(frame_bytes).decode(
                    "ascii"
                )
                self._ws.broadcast_threadsafe("frame_update", frame_payload)
                self._ws.broadcast_threadsafe(
                    "integrity_update", self.get_integrity_dict()
                )

                elapsed = time.monotonic() - loop_start
                remaining = interval - elapsed
                if remaining > 0:
                    self._stop_event.wait(timeout=remaining)
        except Exception as exc:
            logger.exception("Unhandled error in capture loop: %s", exc)
            self._handle_stream_error(f"Unexpected capture loop error: {exc}")
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass

    def _handle_stream_error(self, message: str) -> None:
        logger.error("Stream entered ERROR state: %s", message)
        with self._lock:
            self._status = StreamState.ERROR
            self._stopped_at = utc_now_iso()
            self._last_error = message
        self._ws.broadcast_threadsafe("stream_status", self.get_status_dict())
