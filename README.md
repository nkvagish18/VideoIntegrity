# VideoIntegrity — Real-Time Video Integrity Monitoring System

**VideoIntegrity** is a real-time video frame authentication and tamper-detection system built using **deterministic SHA-256 cryptographic hash chaining**. Every captured video frame is encoded, persisted as raw bytes, hashed with SHA-256, and cryptographically chained to the previous frame's chain hash—enabling instant detection of modified frame content, altered metadata, deleted records, reordered records, and broken chain links.

> **Architecture Principle:** Zero blockchain, zero machine learning. Fast, deterministic, auditable SHA-256 cryptography designed for real-time monitoring.

---

## Documentation (Start Here)

- **[`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md)** — **Single Source of Truth**: frozen REST endpoints, request/response schemas, WebSocket events, SHA-256 cryptographic specification, golden test vectors, and verification rules.
- **[`docs/DEVELOPMENT_GUIDE.md`](./docs/DEVELOPMENT_GUIDE.md)** — 3-laptop Git workflow, strict file ownership, Python integration interface between Backend & Security modules, LAN networking, and 8-hour hackathon milestones.

---

## How It Works

```text
[ Video Source (Synthetic / Webcam / File) ]
                     │
                     ▼
        Encode Frame -> Raw JPEG Bytes
                     │
                     ├──▶ Persist raw encoded bytes verbatim
                     │
                     ▼
     frame_hash = SHA256(encoded_frame_bytes)
                     │
                     ▼
     chain_hash = SHA256(canonical_json({
         "frame_id": frame_id,
         "timestamp": timestamp,
         "frame_hash": frame_hash,
         "previous_hash": previous_hash   # GENESIS_HASH ("0"*64) for frame 1
     }))
                     │
                     ├──▶ Store chain record (SQLite)
                     └──▶ Broadcast live over ws://HOST:8000/ws/live
```

### Verification Guarantee

When verification runs (`POST /api/verify` or automatically after tamper simulation):
1. Reloads the **stored original encoded frame bytes** for every record and recomputes `SHA256(frame_bytes)`.
2. Recomputes `chain_hash` from deterministic **canonical JSON** (`sort_keys=True`, compact separators `,` and `:`, UTF-8).
3. Compares recomputed hashes against stored hashes and validates sequential continuity from the fixed genesis hash.
4. Detects:
   - **Modified frame content** (`FRAME_HASH_MISMATCH`, `MISSING_FRAME_BYTES`)
   - **Modified metadata / hashes** (`CHAIN_HASH_MISMATCH`)
   - **Deleted records** (`DELETED_RECORD`)
   - **Reordered / duplicated records** (`REORDERED_RECORD`)
   - **Invalid genesis or predecessor links** (`INVALID_GENESIS_LINK`, `BROKEN_PREVIOUS_LINK`)

---

## Tech Stack

| Layer | Technology | Owner |
| --- | --- | --- |
| **Backend & Streaming** | Python 3.10+, FastAPI, Uvicorn, OpenCV (`opencv-python-headless`), SQLite (`sqlite3`) | Laptop 1 (`backend` branch) |
| **Frontend Dashboard** | React, Vite, WebSocket API, Fetch API | Laptop 2 (`frontend` branch) |
| **Security & Verification** | Python `hashlib` (SHA-256), `json` (canonical JSON), `pytest`, `httpx` | Laptop 3 (`security` branch) |

---

## Project Structure

```text
VideoIntegrity/
├── .gitignore
├── README.md
├── docs/
│   ├── API_CONTRACT.md            # Frozen REST, WebSocket & SHA-256 contract
│   └── DEVELOPMENT_GUIDE.md       # Team workflow, ownership & integration contract
├── backend/
│   ├── app/
│   │   ├── api/                   # [Laptop 1] REST routes & /ws/live WebSocket endpoint
│   │   ├── core/                  # [Laptop 1] Config, crypto helpers, Pydantic schemas
│   │   ├── services/              # [Laptop 1] Stream capture, SQLite/frame storage, WS manager
│   │   └── security/              # [Laptop 3] verification.py & tamper.py
│   └── data/                      # Runtime frames, SQLite DB & tamper snapshots (gitignored)
├── frontend/                      # [Laptop 2] React + Vite real-time dashboard
│   ├── public/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       └── styles/
└── tests/                         # [Laptop 3] Automated unit & integration tests
    ├── unit/
    └── integration/
```

---

## API Overview

### REST Endpoints (`http://HOST:8000`)

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/stream/start` | Start capturing, hashing, and chaining video frames |
| `POST` | `/api/stream/stop` | Stop active video capture cleanly |
| `GET` | `/api/stream/status` | Get current stream state, head hash, and integrity status |
| `GET` | `/api/frames` | List paginated frame records (optional Base64 image payload) |
| `GET` | `/api/chain` | Retrieve ordered hash chain records from genesis |
| `POST` | `/api/verify` | Recompute all frame & chain hashes and return `VerificationReport` |
| `POST` | `/api/tamper/simulate` | Simulate one of 5 attack modes (`modify_frame_bytes`, `modify_metadata`, `delete_record`, `reorder_records`, `break_link`) |
| `POST` | `/api/tamper/reset` | Restore clean pre-tamper snapshot (or wipe session with `clear_all: true`) |

### WebSocket (`ws://HOST:8000/ws/live`)

Server broadcasts JSON envelopes `{ "event", "timestamp", "data" }` for:
- `frame_update`
- `integrity_update`
- `verification_result`
- `tamper_alert`
- `stream_status`

See [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md) for exact request/response schemas and examples.

---

## Setup & Running Instructions

> **Prerequisites:** Python `3.10+`, Node.js `18+` (with `npm`), and Git.

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd VideoIntegrity
```

### 2. Run the Backend (Laptop 1 / Demo Machine)

**Windows (PowerShell):**
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**macOS / Linux:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- API base URL: `http://localhost:8000`
- Interactive Swagger docs: `http://localhost:8000/docs`
- WebSocket stream: `ws://localhost:8000/ws/live`

### 3. Run the Frontend (Laptop 2 / Demo Machine)

```bash
cd frontend
npm install
npm run dev
```

- Dashboard URL: `http://localhost:5173`
- To connect Laptop 2 to Laptop 1 over hackathon Wi-Fi / LAN, create `frontend/.env.local`:
  ```env
  VITE_API_BASE_URL=http://<LAPTOP1_IP>:8000
  VITE_WS_URL=ws://<LAPTOP1_IP>:8000/ws/live
  ```

### 4. Run Security & Integration Tests (Laptop 3)

From the repository root (with the backend virtual environment active):

```powershell
# Unit tests (run independently without starting the backend server)
pytest tests/unit -v

# Integration tests (against FastAPI app / live server)
pytest tests/integration -v

# Full test suite
pytest -v
```

---

## Team Ownership Summary

- **Laptop 1 (`backend`):** Backend FastAPI server, OpenCV capture, SQLite + raw frame storage, WebSocket fan-out, and final branch integration.
- **Laptop 2 (`frontend`):** React + Vite real-time monitoring UI, live video feed, chain explorer, tamper simulation triggers, and alert log.
- **Laptop 3 (`security`):** `backend/app/security/verification.py`, `backend/app/security/tamper.py`, and all automated tests under `tests/`.
