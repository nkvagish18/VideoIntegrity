"""Thread-safe SQLite storage for VideoIntegrity frame bytes, hash chain, and snapshots."""

from __future__ import annotations

import base64
from contextlib import contextmanager
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterator, Optional

from app.config import DB_PATH, DEFAULT_ENCODING, GENESIS_HASH
from app.models.schemas import IntegrityStatus
from app.services.hashing import build_chain_record


class IntegrityDatabase:
    """Synchronized SQLite repository persisting encoded frame bytes and chain metadata."""

    def __init__(self, db_path: Path | str = DB_PATH) -> None:
        self.db_path = Path(db_path)
        self._lock = threading.RLock()
        self._init_db()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(
            str(self.db_path),
            timeout=30.0,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA foreign_keys=OFF;")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self) -> None:
        """Create tables if missing without wiping any persisted chain data."""
        with self._lock:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as conn:
                conn.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS chain_records (
                        sequence_index INTEGER PRIMARY KEY,
                        frame_id INTEGER NOT NULL,
                        timestamp TEXT NOT NULL,
                        frame_hash TEXT NOT NULL,
                        previous_hash TEXT NOT NULL,
                        chain_hash TEXT NOT NULL,
                        byte_size INTEGER NOT NULL,
                        encoding TEXT NOT NULL DEFAULT 'image/jpeg'
                    );

                    CREATE INDEX IF NOT EXISTS idx_chain_records_frame_id
                        ON chain_records(frame_id);

                    CREATE TABLE IF NOT EXISTS frame_blobs (
                        frame_id INTEGER PRIMARY KEY,
                        frame_bytes BLOB NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS snapshot_records (
                        sequence_index INTEGER PRIMARY KEY,
                        frame_id INTEGER NOT NULL,
                        timestamp TEXT NOT NULL,
                        frame_hash TEXT NOT NULL,
                        previous_hash TEXT NOT NULL,
                        chain_hash TEXT NOT NULL,
                        byte_size INTEGER NOT NULL,
                        encoding TEXT NOT NULL DEFAULT 'image/jpeg'
                    );

                    CREATE TABLE IF NOT EXISTS snapshot_blobs (
                        frame_id INTEGER PRIMARY KEY,
                        frame_bytes BLOB NOT NULL
                    );

                    CREATE TABLE IF NOT EXISTS system_state (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    );
                    """
                )
                self._ensure_default_state(conn)

    def _ensure_default_state(self, conn: sqlite3.Connection) -> None:
        count = conn.execute("SELECT COUNT(*) FROM chain_records").fetchone()[0]
        default_status = (
            IntegrityStatus.EMPTY.value if count == 0 else IntegrityStatus.INTACT.value
        )
        defaults = {
            "integrity_status": default_status,
            "tamper_active": "0",
            "active_tamper_count": "0",
            "snapshot_available": "0",
            "valid_records": str(count),
            "compromised_records": "0",
        }
        for key, value in defaults.items():
            conn.execute(
                "INSERT OR IGNORE INTO system_state (key, value) VALUES (?, ?)",
                (key, value),
            )
        # Reconcile EMPTY status if DB has persisted records from previous run
        current_status = self._get_state_value(conn, "integrity_status", default_status)
        if count == 0 and current_status != IntegrityStatus.EMPTY.value:
            self._set_state_value(conn, "integrity_status", IntegrityStatus.EMPTY.value)
            self._set_state_value(conn, "valid_records", "0")
            self._set_state_value(conn, "compromised_records", "0")
        elif count > 0 and current_status == IntegrityStatus.EMPTY.value:
            self._set_state_value(conn, "integrity_status", IntegrityStatus.INTACT.value)
            self._set_state_value(conn, "valid_records", str(count))
            self._set_state_value(conn, "compromised_records", "0")

    @staticmethod
    def _get_state_value(conn: sqlite3.Connection, key: str, default: str) -> str:
        row = conn.execute(
            "SELECT value FROM system_state WHERE key = ?", (key,)
        ).fetchone()
        return row["value"] if row is not None else default

    @staticmethod
    def _set_state_value(conn: sqlite3.Connection, key: str, value: str) -> None:
        conn.execute(
            """
            INSERT INTO system_state (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )

    @staticmethod
    def _row_to_record(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "sequence_index": int(row["sequence_index"]),
            "frame_id": int(row["frame_id"]),
            "timestamp": str(row["timestamp"]),
            "frame_hash": str(row["frame_hash"]),
            "previous_hash": str(row["previous_hash"]),
            "chain_hash": str(row["chain_hash"]),
            "byte_size": int(row["byte_size"]),
            "encoding": str(row["encoding"]),
        }

    def append_frame(
        self,
        frame_bytes: bytes,
        timestamp: str,
        encoding: str = DEFAULT_ENCODING,
    ) -> dict[str, Any]:
        """Atomically hash, chain, and persist a newly captured encoded frame."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                tail = conn.execute(
                    """
                    SELECT sequence_index, chain_hash
                    FROM chain_records
                    ORDER BY sequence_index DESC
                    LIMIT 1
                    """
                ).fetchone()
                max_frame_row = conn.execute(
                    "SELECT MAX(frame_id) AS max_id FROM chain_records"
                ).fetchone()
                max_blob_row = conn.execute(
                    "SELECT MAX(frame_id) AS max_id FROM frame_blobs"
                ).fetchone()

                if tail is None:
                    sequence_index = 0
                    previous_hash = GENESIS_HASH
                else:
                    sequence_index = int(tail["sequence_index"]) + 1
                    previous_hash = str(tail["chain_hash"])

                max_existing_id = max(
                    int(max_frame_row["max_id"] or 0),
                    int(max_blob_row["max_id"] or 0),
                )
                frame_id = max_existing_id + 1

                record = build_chain_record(
                    sequence_index=sequence_index,
                    frame_id=frame_id,
                    timestamp=timestamp,
                    frame_bytes=frame_bytes,
                    previous_hash=previous_hash,
                    encoding=encoding,
                )

                conn.execute(
                    """
                    INSERT INTO chain_records (
                        sequence_index, frame_id, timestamp,
                        frame_hash, previous_hash, chain_hash,
                        byte_size, encoding
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record["sequence_index"],
                        record["frame_id"],
                        record["timestamp"],
                        record["frame_hash"],
                        record["previous_hash"],
                        record["chain_hash"],
                        record["byte_size"],
                        record["encoding"],
                    ),
                )
                conn.execute(
                    "INSERT INTO frame_blobs (frame_id, frame_bytes) VALUES (?, ?)",
                    (record["frame_id"], sqlite3.Binary(frame_bytes)),
                )

                total_records = conn.execute(
                    "SELECT COUNT(*) FROM chain_records"
                ).fetchone()[0]
                current_status = self._get_state_value(
                    conn, "integrity_status", IntegrityStatus.EMPTY.value
                )
                if current_status == IntegrityStatus.EMPTY.value:
                    self._set_state_value(
                        conn, "integrity_status", IntegrityStatus.INTACT.value
                    )
                    self._set_state_value(conn, "valid_records", str(total_records))
                    self._set_state_value(conn, "compromised_records", "0")
                elif current_status == IntegrityStatus.INTACT.value:
                    self._set_state_value(conn, "valid_records", str(total_records))
                    self._set_state_value(conn, "compromised_records", "0")
                else:
                    # Keep COMPROMISED state until explicitly verified/reset
                    compromised = int(
                        self._get_state_value(conn, "compromised_records", "0")
                    )
                    valid = max(0, total_records - compromised)
                    self._set_state_value(conn, "valid_records", str(valid))

                conn.commit()
                return record

    def get_all_records(self) -> list[dict[str, Any]]:
        """Return all stored chain records in ascending sequence_index order."""
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    "SELECT * FROM chain_records ORDER BY sequence_index ASC"
                ).fetchall()
                return [self._row_to_record(row) for row in rows]

    def get_chain_page(
        self, limit: int = 200, offset: int = 0
    ) -> tuple[int, list[dict[str, Any]]]:
        """Return (total_records, paginated_records) in ascending sequence_index order."""
        with self._lock:
            with self._connect() as conn:
                total = int(
                    conn.execute("SELECT COUNT(*) FROM chain_records").fetchone()[0]
                )
                rows = conn.execute(
                    """
                    SELECT * FROM chain_records
                    ORDER BY sequence_index ASC
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset),
                ).fetchall()
                return total, [self._row_to_record(row) for row in rows]

    def get_frames_page(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        order: str = "desc",
        include_image: bool = False,
    ) -> tuple[int, list[dict[str, Any]]]:
        """Return paginated frame items with optional Base64-encoded original JPEG bytes."""
        direction = "ASC" if order.lower() == "asc" else "DESC"
        with self._lock:
            with self._connect() as conn:
                total = int(
                    conn.execute("SELECT COUNT(*) FROM chain_records").fetchone()[0]
                )
                if include_image:
                    rows = conn.execute(
                        f"""
                        SELECT c.*, b.frame_bytes
                        FROM chain_records c
                        LEFT JOIN frame_blobs b ON b.frame_id = c.frame_id
                        ORDER BY c.sequence_index {direction}
                        LIMIT ? OFFSET ?
                        """,
                        (limit, offset),
                    ).fetchall()
                    items: list[dict[str, Any]] = []
                    for row in rows:
                        rec = self._row_to_record(row)
                        raw = row["frame_bytes"]
                        rec["image_base64"] = (
                            base64.b64encode(bytes(raw)).decode("ascii")
                            if raw is not None
                            else None
                        )
                        items.append(rec)
                    return total, items

                rows = conn.execute(
                    f"""
                    SELECT * FROM chain_records
                    ORDER BY sequence_index {direction}
                    LIMIT ? OFFSET ?
                    """,
                    (limit, offset),
                ).fetchall()
                items = []
                for row in rows:
                    rec = self._row_to_record(row)
                    rec["image_base64"] = None
                    items.append(rec)
                return total, items

    def read_frame_bytes(self, frame_id: int) -> Optional[bytes]:
        """Load persisted original encoded frame bytes for frame_id (or None if missing)."""
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT frame_bytes FROM frame_blobs WHERE frame_id = ?",
                    (frame_id,),
                ).fetchone()
                return bytes(row["frame_bytes"]) if row is not None else None

    def write_frame_bytes(self, frame_id: int, frame_bytes: bytes) -> None:
        """Persist raw frame bytes for frame_id (used by Laptop 3's tamper simulator)."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute(
                    """
                    INSERT INTO frame_blobs (frame_id, frame_bytes) VALUES (?, ?)
                    ON CONFLICT(frame_id) DO UPDATE SET frame_bytes = excluded.frame_bytes
                    """,
                    (frame_id, sqlite3.Binary(frame_bytes)),
                )
                conn.commit()

    def replace_records(self, records: list[dict[str, Any]]) -> None:
        """Atomically replace stored chain_records with mutated records from tamper.py."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute("DELETE FROM chain_records")
                for idx, rec in enumerate(records):
                    seq_idx = int(rec.get("sequence_index", idx))
                    conn.execute(
                        """
                        INSERT INTO chain_records (
                            sequence_index, frame_id, timestamp,
                            frame_hash, previous_hash, chain_hash,
                            byte_size, encoding
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            seq_idx,
                            int(rec["frame_id"]),
                            str(rec["timestamp"]),
                            str(rec["frame_hash"]),
                            str(rec["previous_hash"]),
                            str(rec["chain_hash"]),
                            int(rec["byte_size"]),
                            str(rec.get("encoding", DEFAULT_ENCODING)),
                        ),
                    )
                conn.commit()

    def save_snapshot_if_missing(self) -> bool:
        """Atomically capture pre-tamper snapshot if one does not already exist."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                already_saved = self._get_state_value(conn, "snapshot_available", "0")
                if already_saved == "1":
                    conn.commit()
                    return True

                conn.execute("DELETE FROM snapshot_records")
                conn.execute("DELETE FROM snapshot_blobs")
                conn.execute(
                    "INSERT INTO snapshot_records SELECT * FROM chain_records"
                )
                conn.execute("INSERT INTO snapshot_blobs SELECT * FROM frame_blobs")
                self._set_state_value(conn, "snapshot_available", "1")
                conn.commit()
                return True

    def record_tamper_applied(self) -> int:
        """Mark tampering active and increment active_tamper_count."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                count = int(self._get_state_value(conn, "active_tamper_count", "0")) + 1
                self._set_state_value(conn, "tamper_active", "1")
                self._set_state_value(conn, "active_tamper_count", str(count))
                conn.commit()
                return count

    def restore_snapshot(self) -> tuple[str, int]:
        """Restore clean pre-tamper records and frame bytes atomically."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                snapshot_available = (
                    self._get_state_value(conn, "snapshot_available", "0") == "1"
                )
                if not snapshot_available:
                    count = int(
                        conn.execute("SELECT COUNT(*) FROM chain_records").fetchone()[0]
                    )
                    self._set_state_value(conn, "tamper_active", "0")
                    self._set_state_value(conn, "active_tamper_count", "0")
                    conn.commit()
                    return "noop", count

                conn.execute("DELETE FROM chain_records")
                conn.execute("DELETE FROM frame_blobs")
                conn.execute(
                    "INSERT INTO chain_records SELECT * FROM snapshot_records"
                )
                conn.execute("INSERT INTO frame_blobs SELECT * FROM snapshot_blobs")
                conn.execute("DELETE FROM snapshot_records")
                conn.execute("DELETE FROM snapshot_blobs")

                restored_count = int(
                    conn.execute("SELECT COUNT(*) FROM chain_records").fetchone()[0]
                )
                self._set_state_value(conn, "snapshot_available", "0")
                self._set_state_value(conn, "tamper_active", "0")
                self._set_state_value(conn, "active_tamper_count", "0")
                status = (
                    IntegrityStatus.EMPTY.value
                    if restored_count == 0
                    else IntegrityStatus.INTACT.value
                )
                self._set_state_value(conn, "integrity_status", status)
                self._set_state_value(conn, "valid_records", str(restored_count))
                self._set_state_value(conn, "compromised_records", "0")
                conn.commit()
                return "restore_snapshot", restored_count

    def clear_all(self) -> None:
        """Explicitly wipe all frames, chain records, and snapshots."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                conn.execute("DELETE FROM chain_records")
                conn.execute("DELETE FROM frame_blobs")
                conn.execute("DELETE FROM snapshot_records")
                conn.execute("DELETE FROM snapshot_blobs")
                self._set_state_value(
                    conn, "integrity_status", IntegrityStatus.EMPTY.value
                )
                self._set_state_value(conn, "tamper_active", "0")
                self._set_state_value(conn, "active_tamper_count", "0")
                self._set_state_value(conn, "snapshot_available", "0")
                self._set_state_value(conn, "valid_records", "0")
                self._set_state_value(conn, "compromised_records", "0")
                conn.commit()

    def update_integrity_state(
        self,
        *,
        integrity_status: str,
        valid_records: int,
        compromised_records: int,
    ) -> None:
        """Persist latest verification outcome to system_state."""
        with self._lock:
            with self._connect() as conn:
                conn.execute("BEGIN IMMEDIATE")
                self._set_state_value(conn, "integrity_status", str(integrity_status))
                self._set_state_value(conn, "valid_records", str(int(valid_records)))
                self._set_state_value(
                    conn, "compromised_records", str(int(compromised_records))
                )
                conn.commit()

    def get_summary(self) -> dict[str, Any]:
        """Return consistent snapshot of counts, head hash, and integrity state."""
        with self._lock:
            with self._connect() as conn:
                total_records = int(
                    conn.execute("SELECT COUNT(*) FROM chain_records").fetchone()[0]
                )
                tail = conn.execute(
                    """
                    SELECT frame_id, chain_hash
                    FROM chain_records
                    ORDER BY sequence_index DESC
                    LIMIT 1
                    """
                ).fetchone()

                default_status = (
                    IntegrityStatus.EMPTY.value
                    if total_records == 0
                    else IntegrityStatus.INTACT.value
                )
                integrity_status = self._get_state_value(
                    conn, "integrity_status", default_status
                )
                if total_records == 0:
                    integrity_status = IntegrityStatus.EMPTY.value

                valid_records = int(
                    self._get_state_value(conn, "valid_records", str(total_records))
                )
                compromised_records = int(
                    self._get_state_value(conn, "compromised_records", "0")
                )
                tamper_active = (
                    self._get_state_value(conn, "tamper_active", "0") == "1"
                )
                active_tamper_count = int(
                    self._get_state_value(conn, "active_tamper_count", "0")
                )
                snapshot_available = (
                    self._get_state_value(conn, "snapshot_available", "0") == "1"
                )

                return {
                    "total_records": total_records,
                    "valid_records": valid_records,
                    "compromised_records": compromised_records,
                    "latest_frame_id": int(tail["frame_id"]) if tail else None,
                    "latest_chain_hash": str(tail["chain_hash"]) if tail else None,
                    "integrity_status": integrity_status,
                    "tamper_active": tamper_active,
                    "active_tamper_count": active_tamper_count,
                    "snapshot_available": snapshot_available,
                }
