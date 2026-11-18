"""Exact Pydantic models and enums matching docs/API_CONTRACT.md v1.0.0."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class StreamState(str, Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    ERROR = "ERROR"


class StreamSource(str, Enum):
    SYNTHETIC = "synthetic"
    WEBCAM = "webcam"
    FILE = "file"


class IntegrityStatus(str, Enum):
    INTACT = "INTACT"
    COMPROMISED = "COMPROMISED"
    EMPTY = "EMPTY"


class TamperType(str, Enum):
    MODIFY_FRAME_BYTES = "modify_frame_bytes"
    MODIFY_METADATA = "modify_metadata"
    DELETE_RECORD = "delete_record"
    REORDER_RECORDS = "reorder_records"
    BREAK_LINK = "break_link"


class ViolationType(str, Enum):
    MISSING_FRAME_BYTES = "MISSING_FRAME_BYTES"
    FRAME_HASH_MISMATCH = "FRAME_HASH_MISMATCH"
    CHAIN_HASH_MISMATCH = "CHAIN_HASH_MISMATCH"
    INVALID_GENESIS_LINK = "INVALID_GENESIS_LINK"
    BROKEN_PREVIOUS_LINK = "BROKEN_PREVIOUS_LINK"
    DELETED_RECORD = "DELETED_RECORD"
    REORDERED_RECORD = "REORDERED_RECORD"


class AlertSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"


class APIError(Exception):
    """Structured API error rendered according to Section 7 of API_CONTRACT.md."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details if details is not None else {}


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ErrorResponse(BaseModel):
    error: ErrorDetail


class ChainRecord(BaseModel):
    sequence_index: int = Field(..., ge=0)
    frame_id: int = Field(..., ge=1)
    timestamp: str
    frame_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    previous_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    chain_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    byte_size: int = Field(..., ge=0)
    encoding: str = "image/jpeg"


class FrameItem(ChainRecord):
    image_base64: Optional[str] = None


class VerificationViolation(BaseModel):
    sequence_index: int
    frame_id: int
    violation_type: str
    message: str
    expected: Optional[str] = None
    actual: Optional[str] = None


class VerificationReport(BaseModel):
    verification_id: str
    verified_at: str
    status: IntegrityStatus
    is_valid: bool
    total_records: int
    valid_records: int
    compromised_records: int
    first_compromised_frame_id: Optional[int] = None
    genesis_hash: str
    duration_ms: float
    violations: list[VerificationViolation] = Field(default_factory=list)


class StreamStartRequest(BaseModel):
    source: str = "synthetic"
    fps: float = Field(default=2.0, ge=0.5, le=15.0)
    device_index: int = Field(default=0, ge=0)
    file_path: Optional[str] = None
    reset_existing: bool = False
    jpeg_quality: int = Field(default=85, ge=30, le=95)


class StreamStartResponse(BaseModel):
    status: StreamState
    stream_id: str
    source: StreamSource
    fps: float
    started_at: str
    frames_captured: int
    message: str


class StreamStopResponse(BaseModel):
    status: StreamState
    stream_id: str
    stopped_at: str
    frames_captured: int
    message: str


class StreamStatusResponse(BaseModel):
    status: StreamState
    stream_id: Optional[str] = None
    source: Optional[StreamSource] = None
    fps: Optional[float] = None
    started_at: Optional[str] = None
    stopped_at: Optional[str] = None
    frames_captured: int
    latest_frame_id: Optional[int] = None
    latest_chain_hash: Optional[str] = None
    integrity_status: IntegrityStatus
    tamper_active: bool
    active_tamper_count: int
    connected_ws_clients: int


class FramesListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    frames: list[FrameItem]


class ChainListResponse(BaseModel):
    genesis_hash: str
    total_records: int
    limit: int
    offset: int
    integrity_status: IntegrityStatus
    latest_chain_hash: Optional[str] = None
    records: list[ChainRecord]


class VerifyRequest(BaseModel):
    start_frame_id: Optional[int] = Field(default=None, ge=1)
    end_frame_id: Optional[int] = Field(default=None, ge=1)


class TamperSimulateRequest(BaseModel):
    tamper_type: str
    target_frame_id: Optional[int] = Field(default=None, ge=1)
    swap_with_frame_id: Optional[int] = Field(default=None, ge=1)
    details: dict[str, Any] = Field(default_factory=dict)


class TamperSimulateResponse(BaseModel):
    tamper_id: str
    tamper_type: TamperType
    target_frame_id: int
    affected_frame_ids: list[int]
    applied_at: str
    snapshot_available: bool
    message: str
    verification: VerificationReport


class TamperResetRequest(BaseModel):
    clear_all: bool = False


class TamperResetResponse(BaseModel):
    reset_mode: Literal["restore_snapshot", "clear_all", "noop"]
    restored_records: int
    reset_at: str
    integrity_status: IntegrityStatus
    message: str
    verification: Optional[VerificationReport] = None


class WSEnvelope(BaseModel):
    event: str
    timestamp: str
    data: dict[str, Any]
