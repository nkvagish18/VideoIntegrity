# VideoIntegrity — 3-Developer Hackathon Development Guide

> **Target Duration:** 8-Hour Hackathon
> **Single Source of Truth:** [`docs/API_CONTRACT.md`](./API_CONTRACT.md)

This guide coordinates parallel development across **3 laptops**, **3 local clones**, and **3 Git branches** with zero merge conflicts and clean integration checkpoints.

---

## 1. Team Roles & Strict Ownership Rules

| Developer | Git Branch | Primary Responsibility | Owned Directories / Files |
| --- | --- | --- | --- |
| **Laptop 1** | `backend` | Backend API, video capture, storage, WebSocket broadcasting, final integration | `backend/requirements.txt`, `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/api/*`, `backend/app/core/*`, `backend/app/services/*` |
| **Laptop 2** | `frontend` | Real-time React + Vite monitoring dashboard | `frontend/*` (`package.json`, `vite.config.*`, `index.html`, `public/*`, `src/*`) |
| **Laptop 3** | `security` | Cryptographic verification engine, tamper simulator, unit & integration tests | `backend/app/security/__init__.py`, `backend/app/security/verification.py`, `backend/app/security/tamper.py`, `tests/*` (`tests/unit/*`, `tests/integration/*`, `tests/conftest.py`) |

### Non-Negotiable Ground Rules

1. **Strict Module Boundaries:** Never create, modify, or delete implementation files owned by another laptop.
2. **Frozen Contract:** Never rename REST endpoints, JSON fields, enum strings, WebSocket event names, or cryptographic formulas defined in [`docs/API_CONTRACT.md`](./API_CONTRACT.md).
3. **No Blockchain / No ML:** Pure deterministic SHA-256 hash chaining only. Keep the system fast, inspectable, and rock-solid within 8 hours.
4. **Never Commit Runtime Artifacts:** `backend/data/*` (except `.gitkeep`), `.env*`, `.venv/`, and `node_modules/` are ignored by `.gitignore`.

---

## 2. Agreed Repository Folder Structure

```text
VideoIntegrity/
├── .gitignore
├── README.md
├── docs/
│   ├── API_CONTRACT.md                 # Shared single source of truth (frozen)
│   └── DEVELOPMENT_GUIDE.md            # This guide
├── backend/
│   ├── requirements.txt                # [Laptop 1] Python dependencies
│   ├── app/
│   │   ├── __init__.py                 # [Laptop 1]
│   │   ├── main.py                     # [Laptop 1] FastAPI app entry point, CORS, router registration
│   │   ├── api/                        # [Laptop 1] REST & WebSocket endpoints
│   │   │   ├── __init__.py
│   │   │   ├── routes_stream.py        #   POST /api/stream/start, /stop, GET /status
│   │   │   ├── routes_chain.py         #   GET /api/frames, GET /api/chain
│   │   │   ├── routes_verify.py        #   POST /api/verify
│   │   │   ├── routes_tamper.py        #   POST /api/tamper/simulate, /reset
│   │   │   └── ws.py                   #   WS /ws/live
│   │   ├── core/                       # [Laptop 1] Shared backend config, schemas, crypto helpers
│   │   │   ├── __init__.py
│   │   │   ├── config.py               #   Paths, host/port, defaults, GENESIS_HASH
│   │   │   ├── crypto.py               #   SHA-256 & canonical JSON helpers matching API_CONTRACT
│   │   │   └── schemas.py              #   Pydantic request/response models matching API_CONTRACT
│   │   ├── services/                   # [Laptop 1] Capture, persistence, WebSocket fan-out
│   │   │   ├── __init__.py
│   │   │   ├── storage.py              #   SQLite chain store + raw frame bytes + tamper snapshot
│   │   │   ├── stream_manager.py       #   OpenCV capture loop (synthetic / webcam / file)
│   │   │   └── ws_manager.py           #   Active WebSocket client registry & event broadcaster
│   │   └── security/                   # [Laptop 3] Security verification & tamper simulation
│   │       ├── __init__.py
│   │       ├── verification.py         #   Full frame + chain hash & structural verification
│   │       └── tamper.py               #   5-mode tamper attack simulator
│   └── data/                           # Runtime storage (gitignored except .gitkeep)
├── frontend/                           # [Laptop 2] React + Vite dashboard
│   ├── package.json
│   ├── index.html
│   ├── vite.config.js
│   ├── public/
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/                 #   LiveFeed, IntegrityBanner, ChainTable, TamperPanel, AlertsFeed
│       ├── hooks/                      #   useLiveWebSocket.js, useStreamApi.js
│       ├── services/                   #   apiClient.js, wsClient.js
│       └── styles/                     #   index.css
└── tests/                              # [Laptop 3] Automated test suite (pytest)
    ├── conftest.py                     #   Shared fixtures (temp storage, synthetic frames, test vectors)
    ├── unit/                           #   test_crypto_vectors.py, test_verification.py, test_tamper.py
    └── integration/                    #   test_api_contract.py, test_e2e_tamper_flow.py
```

---

## 3. Git Branching & Sync Workflow

### Initial Setup (All 3 Laptops)

```bash
git clone <REPO_URL>
cd VideoIntegrity
git fetch --all
```

Each developer checks out their own branch from `main` (after this documentation & folder structure commit is merged into `main`):

```bash
# Laptop 1
git checkout -B backend origin/main

# Laptop 2
git checkout -B frontend origin/main

# Laptop 3
git checkout -B security origin/main
```

### Commit & Merge Cadence

- Commit small, focused changes every 30–60 minutes and push to your branch (`git push -u origin <branch>`).
- **Never push directly to `main`** during active coding.
- At each integration checkpoint, open a Pull Request (or merge via Laptop 1):
  1. Merge `security` -> `main` first (or into `backend` to test immediately).
  2. Merge `backend` -> `main`.
  3. Merge `frontend` -> `main`.
  4. All laptops run `git pull origin main` (or `git rebase origin/main`) after each checkpoint merge.

---

## 4. Python Integration Contract (Laptop 1 <-> Laptop 3)

To allow **Laptop 1** and **Laptop 3** to build completely in parallel from Hour 1 without circular imports or FastAPI coupling, `backend/app/security/verification.py` and `backend/app/security/tamper.py` **MUST** expose the exact pure-Python functions below.

### 4.1 Record Dictionary Shape

Both modules exchange chain records as standard Python `dict`s (matching `ChainRecord` in `API_CONTRACT.md`):

```python
RecordDict = {
    "sequence_index": int,   # 0-based position in stored chain order
    "frame_id": int,         # 1-based sequential frame ID
    "timestamp": str,        # Exact ISO-8601 UTC string ("2026-11-18T10:15:30.123Z")
    "frame_hash": str,       # 64-char lowercase hex SHA-256 of encoded frame bytes
    "previous_hash": str,    # 64-char lowercase hex (GENESIS_HASH for frame_id == 1)
    "chain_hash": str,       # 64-char lowercase hex SHA-256 of canonical JSON
    "byte_size": int,        # Length of encoded JPEG bytes
    "encoding": str,         # "image/jpeg"
}
```

### 4.2 `backend/app/security/verification.py` (Owned by Laptop 3)

Must export:

```python
from typing import Callable, Optional

GENESIS_HASH: str = "0" * 64

def compute_frame_hash(frame_bytes: bytes) -> str:
    """Return lowercase 64-char SHA-256 hex digest of raw encoded frame bytes."""

def canonical_json(
    frame_id: int,
    timestamp: str,
    frame_hash: str,
    previous_hash: str,
) -> bytes:
    """Return UTF-8 canonical JSON bytes with sorted keys and compact separators."""

def compute_chain_hash(
    frame_id: int,
    timestamp: str,
    frame_hash: str,
    previous_hash: str,
) -> str:
    """Return lowercase 64-char SHA-256 hex digest of canonical_json(...)."""

def verify_chain(
    records: list[dict],
    frame_bytes_loader: Callable[[int], Optional[bytes]],
    *,
    start_frame_id: Optional[int] = None,
    end_frame_id: Optional[int] = None,
    genesis_hash: str = GENESIS_HASH,
) -> dict:
    """
    Verify stored frame bytes and hash chain integrity.

    Args:
        records: Ordered list of RecordDicts in stored sequence order.
        frame_bytes_loader: Callback taking frame_id -> raw stored bytes (or None if missing).
        start_frame_id: Optional inclusive lower filter.
        end_frame_id: Optional inclusive upper filter.
        genesis_hash: Expected previous_hash for the first record in a full-chain check.

    Returns:
        Dict matching the VerificationReport schema in docs/API_CONTRACT.md.
    """
```

**Mandatory Checks Inside `verify_chain`:**
1. Empty chain -> `status="EMPTY"`, `is_valid=True`, `violations=[]`.
2. Missing frame bytes -> `MISSING_FRAME_BYTES`.
3. `compute_frame_hash(stored_bytes) != record["frame_hash"]` -> `FRAME_HASH_MISMATCH`.
4. `compute_chain_hash(...) != record["chain_hash"]` -> `CHAIN_HASH_MISMATCH`.
5. First record (`idx == 0` on full chain):
   - `previous_hash != genesis_hash` -> `INVALID_GENESIS_LINK`.
   - `frame_id > 1` -> `DELETED_RECORD`.
6. Subsequent records (`idx > 0`):
   - `frame_id > prev["frame_id"] + 1` -> `DELETED_RECORD`.
   - `frame_id <= prev["frame_id"]` or duplicate `frame_id` -> `REORDERED_RECORD`.
   - `previous_hash != prev["chain_hash"]` -> `BROKEN_PREVIOUS_LINK`.

### 4.3 `backend/app/security/tamper.py` (Owned by Laptop 3)

Must export:

```python
from typing import Callable, Optional

TAMPER_TYPES: tuple[str, ...] = (
    "modify_frame_bytes",
    "modify_metadata",
    "delete_record",
    "reorder_records",
    "break_link",
)

def simulate_tamper(
    records: list[dict],
    read_frame_bytes: Callable[[int], Optional[bytes]],
    write_frame_bytes: Callable[[int, bytes], None],
    tamper_type: str,
    target_frame_id: Optional[int] = None,
    swap_with_frame_id: Optional[int] = None,
    details: Optional[dict] = None,
) -> tuple[list[dict], dict]:
    """
    Apply a deterministic tamper mutation to a copy of the chain records
    and/or stored frame bytes via write_frame_bytes.

    Args:
        records: Current ordered list of RecordDicts.
        read_frame_bytes: Callback(frame_id) -> bytes | None.
        write_frame_bytes: Callback(frame_id, mutated_bytes) -> None.
        tamper_type: One of TAMPER_TYPES.
        target_frame_id: Target frame_id (auto-selected if None).
        swap_with_frame_id: Second frame_id for reorder_records (auto-selected if None).
        details: Optional extra parameters.

    Returns:
        (mutated_records, tamper_metadata) where:
        - mutated_records: Updated list of RecordDicts (with updated sequence_index 0..M-1)
          for Laptop 1's storage layer to persist.
        - tamper_metadata: {
              "tamper_id": str,
              "tamper_type": str,
              "target_frame_id": int,
              "affected_frame_ids": list[int],
              "applied_at": str,  # ISO-8601 UTC
              "message": str,
          }

    Raises:
        ValueError: Invalid tamper_type or insufficient frames (e.g. empty chain, <2 for reorder).
        KeyError: Requested target_frame_id or swap_with_frame_id not found.
    """
```

### 4.4 How Laptop 1 Integrates Laptop 3's Modules

In Laptop 1's `routes_verify.py` and `routes_tamper.py`:
- **Verify:** Load ordered `records` from `storage.py`, pass `storage.read_frame_bytes` to `verify_chain(...)`, update integrity status, and broadcast `verification_result` + `integrity_update` (+ `tamper_alert` if invalid).
- **Tamper Simulate:**
  1. If no pre-tamper snapshot exists yet, call `storage.save_snapshot()` first.
  2. Call `simulate_tamper(records, storage.read_frame_bytes, storage.write_frame_bytes, ...)`.
  3. Persist `mutated_records` via `storage.replace_records(mutated_records)`.
  4. Immediately run `verify_chain(...)`.
  5. Broadcast `tamper_alert`, `verification_result`, and `integrity_update`.
- **Tamper Reset:**
  - If `clear_all=False`: call `storage.restore_snapshot()`, re-run `verify_chain(...)`, broadcast `verification_result` + `integrity_update`.
  - If `clear_all=True`: call `storage.clear_all()`, broadcast `stream_status` + `integrity_update` + `verification_result`.

> **Parallel Work Tip for Laptop 1:** Before `security` merges into `backend` at Hour 4, Laptop 1 can use a temporary in-route fallback or thin adapter behind `try: from app.security.verification import verify_chain` without ever creating files inside `backend/app/security/`.

---

## 5. Frontend Integration Guide (Laptop 2)

Laptop 2 owns `frontend/` and builds a clean, responsive dashboard using **React + Vite**.

### Recommended Dashboard Sections (8-Hour Achievable Scope)

1. **Top Status Bar:**
   - Stream state badge (`RUNNING` / `IDLE` / `ERROR`) + `Start Stream` / `Stop Stream` buttons + source selector (`synthetic` / `webcam`) + FPS selector (`1`, `2`, `5` FPS).
   - Big prominent **Integrity Status Indicator** (`INTACT` green / `COMPROMISED` red / `EMPTY` gray) + WebSocket connection badge.
2. **Live Video Monitor Panel:**
   - Renders `data:image/jpeg;base64,${frame.image_base64}` from WebSocket `frame_update` events.
   - Displays current `frame_id`, `timestamp`, truncated `frame_hash`, `previous_hash`, and `chain_hash` (with copy-to-clipboard).
3. **Tamper Simulation & Verification Controls:**
   - `Verify Chain Now` button (`POST /api/verify`).
   - One-click tamper buttons for all 5 `TamperType` values (`modify_frame_bytes`, `modify_metadata`, `delete_record`, `reorder_records`, `break_link`) with optional `target_frame_id` input.
   - `Reset Tamper` (`POST /api/tamper/reset` with `clear_all: false`) and `Clear Session` (`clear_all: true`) buttons.
4. **Hash Chain Explorer Table:**
   - Shows records from `GET /api/chain` updated live by `frame_update`.
   - Highlights compromised rows in red based on the latest `VerificationReport.violations`.
5. **Real-Time Alert & Verification Log:**
   - Shows incoming `tamper_alert` events and violation breakdowns (`violation_type`, `frame_id`, `expected` vs `actual`).

### Connecting Over LAN (Laptop 2 -> Laptop 1)

Create `frontend/.env.local` (gitignored) when pointing to Laptop 1 over hackathon Wi-Fi:

```env
VITE_API_BASE_URL=http://<LAPTOP1_LAN_IP>:8000
VITE_WS_URL=ws://<LAPTOP1_LAN_IP>:8000/ws/live
```

Default fallback in `apiClient.js` / `wsClient.js` when env vars are unset:
- `http://localhost:8000`
- `ws://localhost:8000/ws/live`

---

## 6. 8-Hour Hackathon Timeline & Checkpoints

| Time | Laptop 1 (Backend) | Laptop 2 (Frontend) | Laptop 3 (Security & Tests) |
| --- | --- | --- | --- |
| **Hour 0–1** | Setup FastAPI + venv + `requirements.txt`; implement `config.py`, `crypto.py`, `schemas.py`; pass golden SHA-256 test vectors. | Scaffold Vite + React app; build `apiClient.js` & `wsClient.js` against `API_CONTRACT.md`; create layout skeleton. | Setup `pytest`; implement SHA-256 & canonical JSON in `verification.py`; write & pass golden test vector tests. |
| **Hour 1–3** | Build `storage.py` (SQLite + raw frame bytes + snapshot), `stream_manager.py` (synthetic + webcam OpenCV capture), and `ws_manager.py`. | Build Live Feed, Integrity Status Banner, Hash Chain Table, and Tamper Controls using mock WebSocket/REST data. | Complete `verify_chain()` (all 7 violation types) and `simulate_tamper()` (all 5 tamper types) + comprehensive unit tests. |
| **Hour 3–4** | Wire all 8 REST endpoints + `/ws/live`; verify Swagger docs (`/docs`) match `API_CONTRACT.md`. | Add Alert Feed, violation diff viewer (`expected` vs `actual`), and auto-reconnecting WS hook. | Write edge-case unit tests (empty chain, single frame, genesis deletion, double tamper, multi-violation chains). |
| **Hour 4–5** | **CHECKPOINT 1:** Merge `security` + `backend`. Connect real `verification.py` & `tamper.py` into routes. | Point frontend `.env.local` at Laptop 1's LAN IP (`0.0.0.0:8000`). | Run integration test suite (`tests/integration/`) against live FastAPI server; report any schema mismatches. |
| **Hour 5–6.5** | Fix integration bugs, verify snapshot restore & WebSocket fan-out under live capture. | Verify all 5 WS events update UI live; highlight compromised frames in chain table; polish UX. | Verify every tamper attack triggers exact expected violations + WS `tamper_alert` + clean reset back to `INTACT`. |
| **Hour 6.5–7.5** | **CHECKPOINT 2:** Merge all 3 branches into `main`. Full demo dry-run on one demo laptop. | Final UI responsiveness & demo-readiness check. | Run full `pytest` regression suite on merged `main`. |
| **Hour 7.5–8** | Code freeze. Prepare pitch & live demo script. | Code freeze. Prepare pitch & live demo script. | Code freeze. Prepare pitch & live demo script. |

---

## 7. Demo Verification Checklist (Pre-Pitch)

Before presenting to judges, confirm this exact end-to-end flow succeeds on `main`:

1. Start backend (`uvicorn app.main:app --host 0.0.0.0 --port 8000`) and frontend (`npm run dev`).
2. Dashboard connects to `ws://localhost:8000/ws/live` and displays `IDLE` + `EMPTY`.
3. Click **Start Stream** (`synthetic` or `webcam`, `2.0` FPS) -> live video frames stream in, hash chain grows, status shows `INTACT`.
4. Click **Verify Chain** -> `is_valid: true`, `0` violations.
5. Simulate **`modify_frame_bytes`** -> instant `tamper_alert`, status flips to `COMPROMISED`, `FRAME_HASH_MISMATCH` shown with expected vs actual hashes.
6. Click **Reset Tamper** -> pre-tamper snapshot restored, chain re-verified, status returns to `INTACT`.
7. Repeat quickly for **`delete_record`** (`DELETED_RECORD` + `BROKEN_PREVIOUS_LINK`) and **`reorder_records`** (`REORDERED_RECORD` + `BROKEN_PREVIOUS_LINK`).
8. Run `pytest` -> 100% green.
