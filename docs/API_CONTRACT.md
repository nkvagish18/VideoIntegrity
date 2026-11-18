# VideoIntegrity — API & Cryptographic Contract

> **SINGLE SOURCE OF TRUTH**
> Version: `1.0.0` (Frozen for Hackathon Build)
>
> All three laptops (**Laptop 1: Backend**, **Laptop 2: Frontend**, **Laptop 3: Security & Testing**) **MUST** adhere strictly to this document. Do **not** rename endpoints, JSON keys, enum values, WebSocket event names, or cryptographic rules once agreed.

---

## Table of Contents

1. [Transport & Conventions](#1-transport--conventions)
2. [Cryptographic Contract](#2-cryptographic-contract)
3. [Verification Contract](#3-verification-contract)
4. [Shared Data Models & Enums](#4-shared-data-models--enums)
5. [REST API Endpoints](#5-rest-api-endpoints)
   - [`POST /api/stream/start`](#51-post-apistreamstart)
   - [`POST /api/stream/stop`](#52-post-apistreamstop)
   - [`GET /api/stream/status`](#53-get-apistreamstatus)
   - [`GET /api/frames`](#54-get-apiframes)
   - [`GET /api/chain`](#55-get-apichain)
   - [`POST /api/verify`](#56-post-apiverify)
   - [`POST /api/tamper/simulate`](#57-post-apitamper-simulate)
   - [`POST /api/tamper/reset`](#58-post-apitamper-reset)
6. [WebSocket Contract (`ws://HOST:8000/ws/live`)](#6-websocket-contract-wshost8000wslive)
   - [`frame_update`](#61-frame_update)
   - [`integrity_update`](#62-integrity_update)
   - [`verification_result`](#63-verification_result)
   - [`tamper_alert`](#64-tamper_alert)
   - [`stream_status`](#65-stream_status)
7. [Error Handling](#7-error-handling)

---

## 1. Transport & Conventions

| Item | Specification |
| --- | --- |
| **REST Base URL** | `http://<HOST>:8000` (local default: `http://localhost:8000`) |
| **WebSocket URL** | `ws://<HOST>:8000/ws/live` (local default: `ws://localhost:8000/ws/live`) |
| **Request / Response Format** | `application/json; charset=utf-8` |
| **Timestamps** | ISO-8601 UTC string with millisecond precision and trailing `Z`: `YYYY-MM-DDTHH:MM:SS.mmmZ` (e.g., `"2026-11-18T10:15:30.123Z"`). Stored verbatim and hashed as the exact string. |
| **Frame IDs** | 1-based strictly sequential positive integers (`1, 2, 3, ...`), incremented by `+1` for every captured frame. |
| **Hashes** | 64-character lowercase hexadecimal SHA-256 digests (`^[0-9a-f]{64}$`). |
| **Encoded Frame Format** | Raw JPEG bytes (`image/jpeg`). Live WebSocket previews and optional REST previews use standard Base64 without a `data:` URI prefix (frontend prepends `data:image/jpeg;base64,`). |
| **CORS** | Backend enables CORS for local and LAN frontend origins (`http://localhost:5173`, `http://127.0.0.1:5173`, or `*` for hackathon LAN testing). |

---

## 2. Cryptographic Contract

> **Scope Rule:** VideoIntegrity uses **pure deterministic SHA-256 hash chaining**. No blockchain, distributed ledger, or machine learning is used anywhere in the system.

### 2.1 Fixed Genesis Hash

The first frame (`frame_id = 1`) **MUST** link to the fixed 64-character zero genesis hash:

```text
GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"
```

### 2.2 Frame Hash

```text
frame_hash = SHA256(actual_encoded_frame_bytes)
```

- `actual_encoded_frame_bytes` is the exact encoded JPEG byte sequence generated at capture time and written verbatim to storage.
- **Critical Rule:** Never decode and re-encode an image before hashing. Both ingestion (Laptop 1) and verification (Laptop 3) **MUST** hash the exact persisted byte sequence.

### 2.3 Canonical JSON Serialization

To guarantee identical hashes across all modules and platforms, the chain payload **MUST** be serialized as canonical UTF-8 JSON with:

1. **Exact keys (no extra or missing fields):** `frame_id`, `timestamp`, `frame_hash`, `previous_hash`.
2. **Keys sorted lexicographically** (`frame_hash`, `frame_id`, `previous_hash`, `timestamp`).
3. **No whitespace** after `,` or `:` (`separators=(",", ":")`).
4. **UTF-8 encoding** with `ensure_ascii=False`.
5. **Exact types:**
   - `frame_id`: JSON integer (`int`)
   - `timestamp`: JSON string (`str`, verbatim stored UTC timestamp)
   - `frame_hash`: JSON string (`str`, 64-char lowercase hex)
   - `previous_hash`: JSON string (`str`, 64-char lowercase hex)

Reference Python implementation:

```python
import hashlib
import json

GENESIS_HASH = "0" * 64


def compute_frame_hash(frame_bytes: bytes) -> str:
    return hashlib.sha256(frame_bytes).hexdigest()


def canonical_json(
    frame_id: int,
    timestamp: str,
    frame_hash: str,
    previous_hash: str,
) -> bytes:
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
    return hashlib.sha256(
        canonical_json(frame_id, timestamp, frame_hash, previous_hash)
    ).hexdigest()
```

### 2.4 Chain Hash Formula

```text
chain_hash = SHA256(
    canonical_json({
        "frame_id": frame_id,
        "timestamp": timestamp,
        "frame_hash": frame_hash,
        "previous_hash": previous_hash
    })
)
```

For every frame `i` in the ordered chain:
- If `i == 0` (first record): `previous_hash == GENESIS_HASH`
- If `i > 0`: `previous_hash == records[i - 1].chain_hash`

### 2.5 Golden Test Vectors (Mandatory Cross-Laptop Sanity Check)

Both Laptop 1 and Laptop 3 **MUST** pass these exact vectors:

#### Vector 1 (Genesis Frame `frame_id = 1`)
- `actual_encoded_frame_bytes`: `b"VideoIntegrity-test-frame-1"`
- `timestamp`: `"2026-11-18T10:00:00.000Z"`
- `previous_hash`: `"0000000000000000000000000000000000000000000000000000000000000000"`
- Expected `frame_hash`:
  ```text
  c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe
  ```
- Expected canonical JSON string:
  ```json
  {"frame_hash":"c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe","frame_id":1,"previous_hash":"0000000000000000000000000000000000000000000000000000000000000000","timestamp":"2026-11-18T10:00:00.000Z"}
  ```
- Expected `chain_hash`:
  ```text
  4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14
  ```

#### Vector 2 (Chained Frame `frame_id = 2`)
- `actual_encoded_frame_bytes`: `b"VideoIntegrity-test-frame-2"`
- `timestamp`: `"2026-11-18T10:00:00.500Z"`
- `previous_hash`: `"4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14"`
- Expected `frame_hash`:
  ```text
  504c50139c605e56384a36e01d3aebb1c99bd05ce9327014bc835824c143beff
  ```
- Expected canonical JSON string:
  ```json
  {"frame_hash":"504c50139c605e56384a36e01d3aebb1c99bd05ce9327014bc835824c143beff","frame_id":2,"previous_hash":"4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14","timestamp":"2026-11-18T10:00:00.500Z"}
  ```
- Expected `chain_hash`:
  ```text
  8977be4f7320b8edb7682d1dd8b48e743071f7d3626a257c0da639cdc1267640
  ```

---

## 3. Verification Contract

Verification (owned by Laptop 3 in `backend/app/security/verification.py`) **MUST** perform full cryptographic and structural validation over stored records in sequence order (`sequence_index = 0 .. N-1`):

For each record at position `idx`:

1. **Frame Bytes Existence Check (`MISSING_FRAME_BYTES`):**
   - Load stored original encoded frame bytes for `record.frame_id`.
   - If bytes are missing or unreadable, record a `MISSING_FRAME_BYTES` violation.
2. **Frame Hash Recomputation (`FRAME_HASH_MISMATCH`):**
   - Recompute `recomputed_frame_hash = SHA256(stored_frame_bytes)`.
   - Compare against stored `record.frame_hash`.
   - Any mismatch indicates the stored video frame bytes were modified.
3. **Chain Hash Recomputation (`CHAIN_HASH_MISMATCH`):**
   - Recompute `recomputed_chain_hash = compute_chain_hash(record.frame_id, record.timestamp, record.frame_hash, record.previous_hash)` (and also verify that if `frame_hash` matched, the chain hash matches the recomputed frame hash as well).
   - Compare `recomputed_chain_hash` against stored `record.chain_hash`.
   - Any mismatch indicates record metadata (`frame_id`, `timestamp`, `frame_hash`, `previous_hash`) or `chain_hash` itself was modified.
4. **Genesis Link Validation (`INVALID_GENESIS_LINK`):**
   - For `idx == 0` (when verifying from genesis):
     - `record.previous_hash` MUST equal `GENESIS_HASH`.
     - If `record.frame_id > 1`, also flag `DELETED_RECORD` (genesis/leading frames missing).
5. **Sequential Order & Deletion Detection (`DELETED_RECORD` / `REORDERED_RECORD`):**
   - For `idx > 0`, compare `record.frame_id` against `prev_record.frame_id`:
     - If `record.frame_id > prev_record.frame_id + 1`: flag `DELETED_RECORD` (one or more intermediate records missing).
     - If `record.frame_id <= prev_record.frame_id`: flag `REORDERED_RECORD` (records swapped, out of order, or duplicated).
   - Also check for duplicate `frame_id` anywhere in the chain (`REORDERED_RECORD`).
6. **Chain Link Validation (`BROKEN_PREVIOUS_LINK`):**
   - For `idx > 0`: `record.previous_hash` MUST equal `prev_record.chain_hash`.
   - Any mismatch flags `BROKEN_PREVIOUS_LINK` (invalid link, deleted predecessor, or reordered record).

**Overall Status Rule:**
- If `total_records == 0`: `status = "EMPTY"`, `is_valid = true`.
- If `len(violations) == 0`: `status = "INTACT"`, `is_valid = true`.
- If `len(violations) > 0`: `status = "COMPROMISED"`, `is_valid = false`.

---

## 4. Shared Data Models & Enums

### 4.1 Enums

| Enum | Allowed Values |
| --- | --- |
| `StreamState` | `"IDLE"`, `"RUNNING"`, `"ERROR"` |
| `StreamSource` | `"synthetic"`, `"webcam"`, `"file"` |
| `IntegrityStatus` | `"INTACT"`, `"COMPROMISED"`, `"EMPTY"` |
| `TamperType` | `"modify_frame_bytes"`, `"modify_metadata"`, `"delete_record"`, `"reorder_records"`, `"break_link"` |
| `ViolationType` | `"MISSING_FRAME_BYTES"`, `"FRAME_HASH_MISMATCH"`, `"CHAIN_HASH_MISMATCH"`, `"INVALID_GENESIS_LINK"`, `"BROKEN_PREVIOUS_LINK"`, `"DELETED_RECORD"`, `"REORDERED_RECORD"` |
| `AlertSeverity` | `"CRITICAL"`, `"WARNING"` |

### 4.2 `ChainRecord`

```json
{
  "sequence_index": 0,
  "frame_id": 1,
  "timestamp": "2026-11-18T10:15:30.123Z",
  "frame_hash": "c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe",
  "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "chain_hash": "4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14",
  "byte_size": 24512,
  "encoding": "image/jpeg"
}
```

### 4.3 `FrameItem`

Same as `ChainRecord` plus `image_base64` (`string | null`):

```json
{
  "sequence_index": 0,
  "frame_id": 1,
  "timestamp": "2026-11-18T10:15:30.123Z",
  "frame_hash": "c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe",
  "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "chain_hash": "4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14",
  "byte_size": 24512,
  "encoding": "image/jpeg",
  "image_base64": null
}
```

### 4.4 `VerificationViolation`

```json
{
  "sequence_index": 4,
  "frame_id": 5,
  "violation_type": "FRAME_HASH_MISMATCH",
  "message": "Recomputed frame_hash does not match stored frame_hash for frame 5.",
  "expected": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
  "actual": "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100"
}
```

- `expected` (`string | null`): Expected hash, frame ID, or value.
- `actual` (`string | null`): Observed hash, frame ID, or `"MISSING"`.

### 4.5 `VerificationReport`

```json
{
  "verification_id": "ver_20261118_101545_001",
  "verified_at": "2026-11-18T10:15:45.412Z",
  "status": "COMPROMISED",
  "is_valid": false,
  "total_records": 25,
  "valid_records": 24,
  "compromised_records": 1,
  "first_compromised_frame_id": 5,
  "genesis_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "duration_ms": 12.4,
  "violations": [
    {
      "sequence_index": 4,
      "frame_id": 5,
      "violation_type": "FRAME_HASH_MISMATCH",
      "message": "Recomputed frame_hash does not match stored frame_hash for frame 5.",
      "expected": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
      "actual": "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100"
    }
  ]
}
```

---

## 5. REST API Endpoints

### 5.1 `POST /api/stream/start`

Starts real-time video frame capture, JPEG encoding, SHA-256 hash chaining, storage, and WebSocket broadcasting.

**Request Body** (`application/json`, optional — `{}` uses defaults):

```json
{
  "source": "synthetic",
  "fps": 2.0,
  "device_index": 0,
  "file_path": null,
  "reset_existing": false,
  "jpeg_quality": 85
}
```

| Field | Type | Required | Default | Constraints | Description |
| --- | --- | --- | --- | --- | --- |
| `source` | `StreamSource` | No | `"synthetic"` | `"synthetic" \| "webcam" \| "file"` | Video capture source. `"synthetic"` generates a live animated OpenCV feed with frame counter & UTC clock overlay (safe fallback if no webcam). |
| `fps` | `float` | No | `2.0` | `0.5 <= fps <= 15.0` | Capture & hashing rate in frames per second. |
| `device_index` | `int` | No | `0` | `>= 0` | Webcam device index (used only when `source == "webcam"`). |
| `file_path` | `string \| null` | No | `null` | Non-empty if `source == "file"` | Local video file path (used only when `source == "file"`). |
| `reset_existing` | `bool` | No | `false` | — | If `true`, clears previous frames and chain before starting at `frame_id = 1`. |
| `jpeg_quality` | `int` | No | `85` | `30 <= jpeg_quality <= 95` | JPEG compression quality for encoded frame bytes. |

**Response `200 OK`:**

```json
{
  "status": "RUNNING",
  "stream_id": "str_20261118_101530",
  "source": "synthetic",
  "fps": 2.0,
  "started_at": "2026-11-18T10:15:30.000Z",
  "frames_captured": 0,
  "message": "Stream started successfully."
}
```

**Error Responses:**
- `400 Bad Request` (`INVALID_SOURCE` / `VALIDATION_ERROR`)
- `409 Conflict` (`STREAM_ALREADY_RUNNING`)
- `500 Internal Server Error` (`CAPTURE_INIT_FAILED`)

**WebSocket Side Effects:** Broadcasts `stream_status` immediately, followed by `frame_update` and `integrity_update` for each captured frame.

---

### 5.2 `POST /api/stream/stop`

Stops the active video capture loop cleanly while preserving all recorded frames and hash-chain records in storage.

**Request Body:** None (empty body or `{}`).

**Response `200 OK`:**

```json
{
  "status": "IDLE",
  "stream_id": "str_20261118_101530",
  "stopped_at": "2026-11-18T10:16:00.000Z",
  "frames_captured": 60,
  "message": "Stream stopped successfully."
}
```

**Error Responses:**
- `409 Conflict` (`STREAM_NOT_RUNNING`)

**WebSocket Side Effects:** Broadcasts `stream_status`.

---

### 5.3 `GET /api/stream/status`

Returns the current stream lifecycle state, capture statistics, latest hash-chain head, and integrity status.

**Query Parameters:** None.

**Response `200 OK`:**

```json
{
  "status": "RUNNING",
  "stream_id": "str_20261118_101530",
  "source": "synthetic",
  "fps": 2.0,
  "started_at": "2026-11-18T10:15:30.000Z",
  "stopped_at": null,
  "frames_captured": 25,
  "latest_frame_id": 25,
  "latest_chain_hash": "8977be4f7320b8edb7682d1dd8b48e743071f7d3626a257c0da639cdc1267640",
  "integrity_status": "INTACT",
  "tamper_active": false,
  "active_tamper_count": 0,
  "connected_ws_clients": 2
}
```

| Field | Type | Description |
| --- | --- | --- |
| `status` | `StreamState` | `"IDLE"`, `"RUNNING"`, or `"ERROR"`. |
| `stream_id` | `string \| null` | Active or last stream session ID (`null` if never started). |
| `source` | `StreamSource \| null` | Active or last configured source. |
| `fps` | `float \| null` | Active or last configured FPS. |
| `started_at` | `string \| null` | ISO-8601 UTC start timestamp. |
| `stopped_at` | `string \| null` | ISO-8601 UTC stop timestamp (`null` while running). |
| `frames_captured` | `int` | Total records currently stored in the chain. |
| `latest_frame_id` | `int \| null` | `frame_id` of the latest stored record (`null` if empty). |
| `latest_chain_hash` | `string \| null` | `chain_hash` of the latest stored record (`null` if empty). |
| `integrity_status` | `IntegrityStatus` | `"INTACT"`, `"COMPROMISED"`, or `"EMPTY"`. |
| `tamper_active` | `bool` | `true` if one or more un-reset simulated tampers have been applied. |
| `active_tamper_count` | `int` | Number of simulated tampers applied since last reset. |
| `connected_ws_clients` | `int` | Current number of connected `/ws/live` WebSocket clients. |

---

### 5.4 `GET /api/frames`

Retrieves paginated frame metadata (and optionally Base64-encoded JPEG images).

**Query Parameters:**

| Param | Type | Default | Constraints | Description |
| --- | --- | --- | --- | --- |
| `limit` | `int` | `50` | `1 <= limit <= 500` | Maximum number of frames to return. |
| `offset` | `int` | `0` | `>= 0` | Pagination offset. |
| `include_image` | `bool` | `false` | `true \| false` | If `true`, includes `image_base64` from stored original encoded frame bytes. |
| `order` | `string` | `"desc"` | `"asc" \| "desc"` | Ordering by `sequence_index` (`"desc"` returns newest frames first). |

**Response `200 OK`:**

```json
{
  "total": 25,
  "limit": 50,
  "offset": 0,
  "frames": [
    {
      "sequence_index": 24,
      "frame_id": 25,
      "timestamp": "2026-11-18T10:15:42.500Z",
      "frame_hash": "504c50139c605e56384a36e01d3aebb1c99bd05ce9327014bc835824c143beff",
      "previous_hash": "4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14",
      "chain_hash": "8977be4f7320b8edb7682d1dd8b48e743071f7d3626a257c0da639cdc1267640",
      "byte_size": 24512,
      "encoding": "image/jpeg",
      "image_base64": null
    }
  ]
}
```

---

### 5.5 `GET /api/chain`

Returns the ordered SHA-256 hash chain records in ascending `sequence_index` order (`0 .. N-1`), suitable for chain visualization and inspection.

**Query Parameters:**

| Param | Type | Default | Constraints | Description |
| --- | --- | --- | --- | --- |
| `limit` | `int` | `200` | `1 <= limit <= 2000` | Maximum number of chain records to return. |
| `offset` | `int` | `0` | `>= 0` | Pagination offset from genesis. |

**Response `200 OK`:**

```json
{
  "genesis_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "total_records": 25,
  "limit": 200,
  "offset": 0,
  "integrity_status": "INTACT",
  "latest_chain_hash": "8977be4f7320b8edb7682d1dd8b48e743071f7d3626a257c0da639cdc1267640",
  "records": [
    {
      "sequence_index": 0,
      "frame_id": 1,
      "timestamp": "2026-11-18T10:15:30.500Z",
      "frame_hash": "c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe",
      "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000",
      "chain_hash": "4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14",
      "byte_size": 24100,
      "encoding": "image/jpeg"
    }
  ]
}
```

---

### 5.6 `POST /api/verify`

Triggers cryptographic and structural verification across stored original frame bytes and hash-chain records by delegating to `verification.py`.

**Request Body** (`application/json`, optional — `{}` verifies the entire chain from genesis):

```json
{
  "start_frame_id": null,
  "end_frame_id": null
}
```

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `start_frame_id` | `int \| null` | No | `null` | Optional inclusive lower bound `frame_id`. When `null`, verifies from genesis (`sequence_index = 0`). |
| `end_frame_id` | `int \| null` | No | `null` | Optional inclusive upper bound `frame_id`. When `null`, verifies through the latest record. |

**Response `200 OK`:** Returns a [`VerificationReport`](#45-verificationreport) object.

**WebSocket Side Effects:**
1. Broadcasts `verification_result` with the full `VerificationReport`.
2. Broadcasts `integrity_update` with updated counts and `integrity_status`.
3. If `is_valid == false`, also broadcasts `tamper_alert`.

---

### 5.7 `POST /api/tamper/simulate`

Simulates a realistic integrity attack against stored frames or hash-chain records (via `tamper.py`), automatically preserves a clean pre-tamper snapshot (if not already saved), and runs verification to report detected violations.

**Request Body** (`application/json`):

```json
{
  "tamper_type": "modify_frame_bytes",
  "target_frame_id": 5,
  "swap_with_frame_id": null,
  "details": {}
}
```

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `tamper_type` | `TamperType` | **Yes** | — | One of `"modify_frame_bytes"`, `"modify_metadata"`, `"delete_record"`, `"reorder_records"`, `"break_link"`. |
| `target_frame_id` | `int \| null` | No | `null` | Target `frame_id`. If `null`, backend chooses a valid stored frame (preferring a middle/recent frame). |
| `swap_with_frame_id` | `int \| null` | No | `null` | Second `frame_id` for `"reorder_records"`. If `null`, swaps `target_frame_id` with an adjacent record. |
| `details` | `object` | No | `{}` | Optional type-specific hints (e.g., `{"field": "timestamp"}` for `"modify_metadata"`). |

**Tamper Type Semantics:**

| `tamper_type` | Simulated Attack | Primary Expected Violation(s) |
| --- | --- | --- |
| `"modify_frame_bytes"` | Flips/corrupts bytes inside stored encoded frame bytes for `target_frame_id` without updating hashes. | `FRAME_HASH_MISMATCH` |
| `"modify_metadata"` | Alters `timestamp` (or specified metadata field) on `target_frame_id` without recalculating `chain_hash`. | `CHAIN_HASH_MISMATCH` |
| `"delete_record"` | Removes `target_frame_id` from the stored chain sequence. | `DELETED_RECORD`, `BROKEN_PREVIOUS_LINK` (or `INVALID_GENESIS_LINK` if frame 1 deleted) |
| `"reorder_records"` | Swaps the positions of `target_frame_id` and `swap_with_frame_id` in the stored chain sequence. | `REORDERED_RECORD`, `BROKEN_PREVIOUS_LINK` (or `INVALID_GENESIS_LINK`) |
| `"break_link"` | Corrupts `previous_hash` (or `chain_hash`) of `target_frame_id`. | `BROKEN_PREVIOUS_LINK` / `INVALID_GENESIS_LINK` and `CHAIN_HASH_MISMATCH` |

**Response `200 OK`:**

```json
{
  "tamper_id": "tmp_20261118_101540_001",
  "tamper_type": "modify_frame_bytes",
  "target_frame_id": 5,
  "affected_frame_ids": [5],
  "applied_at": "2026-11-18T10:15:40.200Z",
  "snapshot_available": true,
  "message": "Simulated modify_frame_bytes on frame 5.",
  "verification": {
    "verification_id": "ver_20261118_101540_002",
    "verified_at": "2026-11-18T10:15:40.215Z",
    "status": "COMPROMISED",
    "is_valid": false,
    "total_records": 25,
    "valid_records": 24,
    "compromised_records": 1,
    "first_compromised_frame_id": 5,
    "genesis_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "duration_ms": 11.2,
    "violations": [
      {
        "sequence_index": 4,
        "frame_id": 5,
        "violation_type": "FRAME_HASH_MISMATCH",
        "message": "Recomputed frame_hash does not match stored frame_hash for frame 5.",
        "expected": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        "actual": "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100"
      }
    ]
  }
}
```

**Error Responses:**
- `400 Bad Request` (`INVALID_TAMPER_TYPE`)
- `404 Not Found` (`FRAME_NOT_FOUND`)
- `409 Conflict` (`INSUFFICIENT_FRAMES` — e.g., empty chain, or `< 2` frames for `reorder_records`)

**WebSocket Side Effects:** Broadcasts `tamper_alert`, `verification_result`, and `integrity_update`.

---

### 5.8 `POST /api/tamper/reset`

Restores the chain and frame bytes to the clean pre-tamper snapshot (default), or wipes all data for a fresh session (`clear_all: true`).

**Request Body** (`application/json`, optional — `{}` restores pre-tamper snapshot):

```json
{
  "clear_all": false
}
```

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `clear_all` | `bool` | No | `false` | `false`: restores pre-tamper snapshot (records + frame bytes) and re-verifies. `true`: clears all stored frames, chain records, and snapshots (`status: "EMPTY"`). |

**Response `200 OK`:**

```json
{
  "reset_mode": "restore_snapshot",
  "restored_records": 25,
  "reset_at": "2026-11-18T10:15:55.100Z",
  "integrity_status": "INTACT",
  "message": "Restored chain and frame bytes from pre-tamper snapshot.",
  "verification": {
    "verification_id": "ver_20261118_101555_003",
    "verified_at": "2026-11-18T10:15:55.114Z",
    "status": "INTACT",
    "is_valid": true,
    "total_records": 25,
    "valid_records": 25,
    "compromised_records": 0,
    "first_compromised_frame_id": null,
    "genesis_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "duration_ms": 9.8,
    "violations": []
  }
}
```

- `reset_mode`: `"restore_snapshot"` | `"clear_all"` | `"noop"` (if no tamper was active and `clear_all == false`, returns current verified state cleanly with `200 OK`).

**WebSocket Side Effects:** Broadcasts `verification_result` and `integrity_update` (and `stream_status` if `clear_all == true`).

---

## 6. WebSocket Contract (`ws://HOST:8000/ws/live`)

### Connection & Envelope Format

- **Endpoint:** `ws://<HOST>:8000/ws/live`
- **On Connect:** Server immediately sends one `stream_status` event and one `integrity_update` event so the frontend hydrates without waiting for the next frame.
- **Heartbeat (Optional):** Client may send `{"event": "ping"}` and server responds with `{"event": "pong", "timestamp": "<UTC>", "data": {}}`.
- **Standard Server-to-Client Envelope:**

```json
{
  "event": "<event_name>",
  "timestamp": "2026-11-18T10:15:30.500Z",
  "data": {}
}
```

---

### 6.1 `frame_update`

Emitted whenever a new video frame is captured, JPEG-encoded, SHA-256 hashed, and appended to the hash chain.

```json
{
  "event": "frame_update",
  "timestamp": "2026-11-18T10:15:30.500Z",
  "data": {
    "sequence_index": 0,
    "frame_id": 1,
    "timestamp": "2026-11-18T10:15:30.500Z",
    "frame_hash": "c32872a33b9346c21836772de1ba37723d132f39a49f1058ce0ef1614a7436fe",
    "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "chain_hash": "4e8db6e9abf3678546f40acd4d0deb5720e5152dc702abcf5baa5327ab15af14",
    "byte_size": 24100,
    "encoding": "image/jpeg",
    "image_base64": "/9j/4AAQSkZJRgABAQAAAQABAAD/..."
  }
}
```

---

### 6.2 `integrity_update`

Emitted on WebSocket connect, after each new chained frame, after verification, after tamper simulation, and after tamper reset.

```json
{
  "event": "integrity_update",
  "timestamp": "2026-11-18T10:15:40.220Z",
  "data": {
    "integrity_status": "COMPROMISED",
    "total_records": 25,
    "valid_records": 24,
    "compromised_records": 1,
    "latest_frame_id": 25,
    "latest_chain_hash": "8977be4f7320b8edb7682d1dd8b48e743071f7d3626a257c0da639cdc1267640",
    "tamper_active": true,
    "active_tamper_count": 1
  }
}
```

---

### 6.3 `verification_result`

Emitted whenever `POST /api/verify`, `POST /api/tamper/simulate`, or `POST /api/tamper/reset` completes a verification run.

```json
{
  "event": "verification_result",
  "timestamp": "2026-11-18T10:15:45.412Z",
  "data": {
    "verification_id": "ver_20261118_101545_001",
    "verified_at": "2026-11-18T10:15:45.412Z",
    "status": "COMPROMISED",
    "is_valid": false,
    "total_records": 25,
    "valid_records": 24,
    "compromised_records": 1,
    "first_compromised_frame_id": 5,
    "genesis_hash": "0000000000000000000000000000000000000000000000000000000000000000",
    "duration_ms": 12.4,
    "violations": [
      {
        "sequence_index": 4,
        "frame_id": 5,
        "violation_type": "FRAME_HASH_MISMATCH",
        "message": "Recomputed frame_hash does not match stored frame_hash for frame 5.",
        "expected": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        "actual": "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100"
      }
    ]
  }
}
```

---

### 6.4 `tamper_alert`

Emitted immediately whenever a tamper attack is simulated or any integrity violation is detected during verification.

```json
{
  "event": "tamper_alert",
  "timestamp": "2026-11-18T10:15:40.220Z",
  "data": {
    "alert_id": "alt_20261118_101540_001",
    "severity": "CRITICAL",
    "tamper_type": "modify_frame_bytes",
    "affected_frame_ids": [5],
    "violation_count": 1,
    "summary": "Integrity compromised on frame 5: FRAME_HASH_MISMATCH detected.",
    "violations": [
      {
        "sequence_index": 4,
        "frame_id": 5,
        "violation_type": "FRAME_HASH_MISMATCH",
        "message": "Recomputed frame_hash does not match stored frame_hash for frame 5.",
        "expected": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
        "actual": "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100"
      }
    ]
  }
}
```

- `tamper_type`: `TamperType | null` (`null` if violation was discovered during a manual `POST /api/verify` rather than via the simulator).

---

### 6.5 `stream_status`

Emitted on WebSocket connect and whenever the stream starts, stops, resets (`clear_all: true`), or encounters a capture error.

```json
{
  "event": "stream_status",
  "timestamp": "2026-11-18T10:15:30.000Z",
  "data": {
    "status": "RUNNING",
    "stream_id": "str_20261118_101530",
    "source": "synthetic",
    "fps": 2.0,
    "started_at": "2026-11-18T10:15:30.000Z",
    "stopped_at": null,
    "frames_captured": 0,
    "latest_frame_id": null,
    "latest_chain_hash": null,
    "integrity_status": "EMPTY",
    "tamper_active": false,
    "active_tamper_count": 0,
    "connected_ws_clients": 1
  }
}
```

---

## 7. Error Handling

All `4xx` and `5xx` REST error responses **MUST** use this uniform JSON structure:

```json
{
  "error": {
    "code": "STREAM_ALREADY_RUNNING",
    "message": "Video stream is already running.",
    "details": {}
  }
}
```

| HTTP Status | Error Code | When Used |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Missing/invalid request parameters or JSON payload. |
| `400` | `INVALID_SOURCE` | Unsupported stream source or missing `file_path` for `"file"`. |
| `400` | `INVALID_TAMPER_TYPE` | `tamper_type` is not one of the 5 allowed values. |
| `404` | `FRAME_NOT_FOUND` | Requested `target_frame_id` or `swap_with_frame_id` does not exist. |
| `409` | `STREAM_ALREADY_RUNNING` | `POST /api/stream/start` called while stream is active. |
| `409` | `STREAM_NOT_RUNNING` | `POST /api/stream/stop` called while stream is idle. |
| `409` | `INSUFFICIENT_FRAMES` | Tamper requested on empty chain, or `reorder_records` with `< 2` frames. |
| `500` | `CAPTURE_INIT_FAILED` | Webcam or video file failed to open. |
| `500` | `INTERNAL_ERROR` | Unexpected server error. |
