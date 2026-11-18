/**
 * VideoIntegrity — Mock Backend Engine & Cryptographic Simulator
 * 
 * Implements 100% of the API & Cryptographic Contract (docs/API_CONTRACT.md)
 * for independent frontend development.
 * 
 * Features:
 * - Deterministic SHA-256 hashing (pure SHA-256 via Web Crypto API)
 * - Canonical JSON formatting (sorted keys, no spaces, verbatim UTC strings)
 * - Genesis hash linking (64 zeros)
 * - Live synthetic frame generator (dynamic HUD canvas / SVG)
 * - Full verification engine (missing bytes, frame hash mismatch, chain hash mismatch, broken links, reordering, deletion)
 * - 5-mode tamper attack simulator (modify_frame_bytes, modify_metadata, delete_record, reorder_records, break_link)
 * - Pre-tamper snapshot capture and restoration
 */

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

// Helper: Convert ArrayBuffer to 64-char lowercase hex
function bufferToHex(buffer) {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Compute SHA-256 hex of string or bytes
export async function sha256Hex(data) {
  let encoded;
  if (typeof data === 'string') {
    encoded = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    encoded = data;
  } else if (data instanceof ArrayBuffer) {
    encoded = new Uint8Array(data);
  } else {
    encoded = new TextEncoder().encode(String(data));
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return bufferToHex(hashBuffer);
}

/**
 * Section 2.3: Canonical JSON serialization
 * Exact keys: frame_id, timestamp, frame_hash, previous_hash
 * Lexicographically sorted keys: frame_hash, frame_id, previous_hash, timestamp
 * No whitespace after ',' or ':'
 */
export function canonicalJson(frame_id, timestamp, frame_hash, previous_hash) {
  return JSON.stringify({
    frame_hash,
    frame_id: Number(frame_id),
    previous_hash,
    timestamp: String(timestamp),
  });
}

/**
 * Section 2.4: Chain Hash computation
 */
export async function computeChainHash(frame_id, timestamp, frame_hash, previous_hash) {
  const canonical = canonicalJson(frame_id, timestamp, frame_hash, previous_hash);
  return await sha256Hex(canonical);
}

// Generate realistic synthetic frame data & image
function generateSyntheticFrame(frameId, timestamp, isCompromised = false) {
  // Try using OffscreenCanvas or regular document canvas if available
  let base64 = "";
  try {
    const width = 640;
    const height = 360;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, isCompromised ? '#2b0c15' : '#080d1a');
    grad.addColorStop(1, isCompromised ? '#450a1b' : '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = isCompromised ? 'rgba(244, 63, 94, 0.15)' : 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Scanning radar line or pulse
    const sweepY = (frameId * 15) % height;
    ctx.strokeStyle = isCompromised ? 'rgba(244, 63, 94, 0.4)' : 'rgba(14, 165, 233, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, sweepY);
    ctx.lineTo(width, sweepY);
    ctx.stroke();

    // Corner HUD brackets
    ctx.strokeStyle = isCompromised ? '#f43f5e' : '#38bdf8';
    ctx.lineWidth = 2;
    const bracketSize = 25;
    // Top-left
    ctx.beginPath(); ctx.moveTo(20, 20 + bracketSize); ctx.lineTo(20, 20); ctx.lineTo(20 + bracketSize, 20); ctx.stroke();
    // Top-right
    ctx.beginPath(); ctx.moveTo(width - 20 - bracketSize, 20); ctx.lineTo(width - 20, 20); ctx.lineTo(width - 20, 20 + bracketSize); ctx.stroke();
    // Bottom-left
    ctx.beginPath(); ctx.moveTo(20, height - 20 - bracketSize); ctx.lineTo(20, height - 20); ctx.lineTo(20 + bracketSize, height - 20); ctx.stroke();
    // Bottom-right
    ctx.beginPath(); ctx.moveTo(width - 20 - bracketSize, height - 20); ctx.lineTo(width - 20, height - 20); ctx.lineTo(width - 20, height - 20 - bracketSize); ctx.stroke();

    // Central crosshair & target box
    ctx.strokeRect(width / 2 - 60, height / 2 - 40, 120, 80);
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 8, 0, Math.PI * 2);
    ctx.fillStyle = isCompromised ? 'rgba(244, 63, 94, 0.6)' : 'rgba(56, 189, 248, 0.6)';
    ctx.fill();

    // Top Header Text
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.fillStyle = isCompromised ? '#f43f5e' : '#38bdf8';
    ctx.fillText('VIDEOINTEGRITY // LIVE SURVEILLANCE FEED', 30, 42);

    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`FRAME: #${String(frameId).padStart(6, '0')}`, 30, 64);
    ctx.fillText(`UTC: ${timestamp}`, 30, 82);

    // Status Pill in Canvas
    ctx.fillStyle = isCompromised ? '#f43f5e' : '#10b981';
    ctx.fillRect(width - 160, 30, 130, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(isCompromised ? 'CHAIN COMPROMISED' : 'CHAIN INTACT', width - 150, 46);

    // Bottom Watermark
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.fillText(`DETERMINISTIC SHA-256 HASH CHAIN // VERIFICATION ACTIVE`, 30, height - 30);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  } catch {
    // Fallback if canvas is unavailable
    base64 = btoa(`VIDEOINTEGRITY_FRAME_${frameId}_${timestamp}`);
  }

  // Raw byte simulation
  const rawBytesText = `VideoIntegrity-frame-payload-${frameId}-${timestamp}`;
  return {
    image_base64: base64,
    rawBytesText,
    byte_size: 24000 + (frameId % 500) * 10,
  };
}

class MockBackendStore {
  constructor() {
    this.records = []; // Array of ChainRecord
    this.frameStore = new Map(); // frame_id -> { image_base64, rawBytesText }
    this.snapshot = null; // Snapshot for tamper reset
    this.streamState = {
      status: "IDLE", // "IDLE" | "RUNNING" | "ERROR"
      stream_id: null,
      source: "synthetic",
      fps: 2.0,
      started_at: null,
      stopped_at: null,
      frames_captured: 0,
      latest_frame_id: null,
      latest_chain_hash: null,
      integrity_status: "EMPTY", // "INTACT" | "COMPROMISED" | "EMPTY"
      tamper_active: false,
      active_tamper_count: 0,
      connected_ws_clients: 1,
    };
    this.activeTampers = [];
    this.lastVerificationReport = null;
    this.subscribers = new Set();
    this.timerId = null;

    // Pre-populate with initial clean frames so the dashboard is immediately populated & realistic!
    this.readyPromise = this.initInitialRecords(12);
  }

  async ready() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  // Subscribe to synthetic WebSocket events
  subscribeWs(callback) {
    this.subscribers.add(callback);
    // Hydrate immediately with stream_status and integrity_update as per contract
    this.ready().then(() => {
      callback({
        event: "stream_status",
        timestamp: new Date().toISOString(),
        data: { ...this.streamState }
      });
      callback({
        event: "integrity_update",
        timestamp: new Date().toISOString(),
        data: this.getIntegritySummary()
      });
    });
    return () => this.subscribers.delete(callback);
  }

  broadcast(event, data) {
    const envelope = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    for (const cb of this.subscribers) {
      try {
        cb(envelope);
      } catch (err) {
        console.error("Mock WS subscriber error:", err);
      }
    }
  }

  getIntegritySummary() {
    const compromised = this.lastVerificationReport
      ? this.lastVerificationReport.compromised_records
      : (this.streamState.tamper_active ? 1 : 0);

    const valid = Math.max(0, this.records.length - compromised);
    return {
      integrity_status: this.streamState.integrity_status,
      total_records: this.records.length,
      valid_records: valid,
      compromised_records: compromised,
      latest_frame_id: this.streamState.latest_frame_id,
      latest_chain_hash: this.streamState.latest_chain_hash,
      tamper_active: this.streamState.tamper_active,
      active_tamper_count: this.streamState.active_tamper_count,
    };
  }

  async initInitialRecords(count = 12) {
    this.records = [];
    this.frameStore.clear();
    const baseTime = Date.now() - count * 500;

    for (let i = 1; i <= count; i++) {
      const ts = new Date(baseTime + i * 500).toISOString();
      const synthetic = generateSyntheticFrame(i, ts, false);
      const frameHash = await sha256Hex(synthetic.rawBytesText);

      const prevHash = (i === 1)
        ? GENESIS_HASH
        : this.records[i - 2].chain_hash;

      const chainHash = await computeChainHash(i, ts, frameHash, prevHash);

      const record = {
        sequence_index: i - 1,
        frame_id: i,
        timestamp: ts,
        frame_hash: frameHash,
        previous_hash: prevHash,
        chain_hash: chainHash,
        byte_size: synthetic.byte_size,
        encoding: "image/jpeg",
      };

      this.records.push(record);
      this.frameStore.set(i, {
        image_base64: synthetic.image_base64,
        rawBytesText: synthetic.rawBytesText,
      });
    }

    this.streamState.frames_captured = this.records.length;
    this.streamState.latest_frame_id = count;
    this.streamState.latest_chain_hash = this.records[this.records.length - 1]?.chain_hash || null;
    this.streamState.integrity_status = "INTACT";

    // Auto-save initial clean snapshot
    this.takeSnapshot();
  }

  takeSnapshot() {
    const deepFrameStore = new Map();
    for (const [k, v] of this.frameStore.entries()) {
      deepFrameStore.set(k, { ...v });
    }
    this.snapshot = {
      records: JSON.parse(JSON.stringify(this.records)),
      frameStore: deepFrameStore,
      streamState: { ...this.streamState },
    };
  }

  async addFrame() {
    const nextFrameId = (this.streamState.latest_frame_id || 0) + 1;
    const seqIndex = this.records.length;
    const timestamp = new Date().toISOString();

    const isCompromised = this.streamState.tamper_active;
    const synthetic = generateSyntheticFrame(nextFrameId, timestamp, isCompromised);
    const frameHash = await sha256Hex(synthetic.rawBytesText);

    const prevHash = (seqIndex === 0)
      ? GENESIS_HASH
      : this.records[seqIndex - 1].chain_hash;

    const chainHash = await computeChainHash(nextFrameId, timestamp, frameHash, prevHash);

    const record = {
      sequence_index: seqIndex,
      frame_id: nextFrameId,
      timestamp,
      frame_hash: frameHash,
      previous_hash: prevHash,
      chain_hash: chainHash,
      byte_size: synthetic.byte_size,
      encoding: "image/jpeg",
    };

    this.records.push(record);
    this.frameStore.set(nextFrameId, {
      image_base64: synthetic.image_base64,
      rawBytesText: synthetic.rawBytesText,
    });

    this.streamState.frames_captured = this.records.length;
    this.streamState.latest_frame_id = nextFrameId;
    this.streamState.latest_chain_hash = chainHash;

    // Broadcast frame_update
    this.broadcast("frame_update", {
      ...record,
      image_base64: synthetic.image_base64,
    });

    // Broadcast integrity_update
    this.broadcast("integrity_update", this.getIntegritySummary());
  }

  // --- REST Handlers ---

  async startStream({ source = "synthetic", fps = 2.0, device_index = 0, file_path = null, reset_existing = false, jpeg_quality = 85 } = {}) {
    await this.ready();
    if (this.streamState.status === "RUNNING") {
      throw {
        status: 409,
        error: {
          code: "STREAM_ALREADY_RUNNING",
          message: "Video stream is already running.",
          details: {},
        }
      };
    }

    if (reset_existing) {
      this.records = [];
      this.frameStore.clear();
      this.streamState.latest_frame_id = null;
      this.streamState.latest_chain_hash = null;
      this.streamState.frames_captured = 0;
      this.streamState.integrity_status = "EMPTY";
      this.activeTampers = [];
      this.snapshot = null;
    }

    const stream_id = `str_${Date.now()}`;
    const started_at = new Date().toISOString();

    this.streamState.status = "RUNNING";
    this.streamState.stream_id = stream_id;
    this.streamState.source = source;
    this.streamState.fps = Math.max(0.5, Math.min(15.0, fps));
    this.streamState.started_at = started_at;
    this.streamState.stopped_at = null;
    if (this.records.length > 0 && this.streamState.integrity_status === "EMPTY") {
      this.streamState.integrity_status = "INTACT";
    }

    // Start capture interval
    const intervalMs = Math.round(1000 / this.streamState.fps);
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = setInterval(() => {
      this.addFrame();
    }, intervalMs);

    const res = {
      status: "RUNNING",
      stream_id,
      source: this.streamState.source,
      fps: this.streamState.fps,
      started_at,
      frames_captured: this.records.length,
      message: "Stream started successfully.",
    };

    this.broadcast("stream_status", { ...this.streamState });
    return res;
  }

  async stopStream() {
    if (this.streamState.status === "IDLE") {
      throw {
        status: 409,
        error: {
          code: "STREAM_NOT_RUNNING",
          message: "Video stream is not running.",
          details: {},
        }
      };
    }

    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    const stopped_at = new Date().toISOString();
    this.streamState.status = "IDLE";
    this.streamState.stopped_at = stopped_at;

    const res = {
      status: "IDLE",
      stream_id: this.streamState.stream_id,
      stopped_at,
      frames_captured: this.records.length,
      message: "Stream stopped successfully.",
    };

    this.broadcast("stream_status", { ...this.streamState });
    return res;
  }

  async getStreamStatus() {
    await this.ready();
    return { ...this.streamState };
  }

  async getFrames({ limit = 50, offset = 0, include_image = false, order = "desc" } = {}) {
    await this.ready();
    let list = [...this.records];
    if (order === "desc") {
      list.reverse();
    }
    const sliced = list.slice(offset, offset + limit);
    const frames = sliced.map(rec => {
      const stored = this.frameStore.get(rec.frame_id);
      return {
        ...rec,
        image_base64: include_image && stored ? stored.image_base64 : null,
      };
    });

    return {
      total: this.records.length,
      limit,
      offset,
      frames,
    };
  }

  async getChain({ limit = 200, offset = 0 } = {}) {
    await this.ready();
    const sliced = this.records.slice(offset, offset + limit);
    return {
      genesis_hash: GENESIS_HASH,
      total_records: this.records.length,
      limit,
      offset,
      integrity_status: this.streamState.integrity_status,
      latest_chain_hash: this.streamState.latest_chain_hash,
      records: sliced,
    };
  }

  /**
   * Section 3: Verification Contract
   * Performs full cryptographic verification:
   * 1. MISSING_FRAME_BYTES
   * 2. FRAME_HASH_MISMATCH
   * 3. CHAIN_HASH_MISMATCH
   * 4. INVALID_GENESIS_LINK
   * 5. DELETED_RECORD / REORDERED_RECORD
   * 6. BROKEN_PREVIOUS_LINK
   */
  async verifyChain({ start_frame_id = null, end_frame_id = null } = {}) {
    await this.ready();
    const startTime = performance.now();
    const violations = [];

    if (this.records.length === 0) {
      const report = {
        verification_id: `ver_${Date.now()}`,
        verified_at: new Date().toISOString(),
        status: "EMPTY",
        is_valid: true,
        total_records: 0,
        valid_records: 0,
        compromised_records: 0,
        first_compromised_frame_id: null,
        genesis_hash: GENESIS_HASH,
        duration_ms: Number((performance.now() - startTime).toFixed(2)),
        violations: [],
      };
      this.lastVerificationReport = report;
      this.streamState.integrity_status = "EMPTY";
      this.broadcast("verification_result", report);
      this.broadcast("integrity_update", this.getIntegritySummary());
      return report;
    }

    // Filter range if specified
    let recordsToVerify = this.records;
    if (start_frame_id !== null || end_frame_id !== null) {
      recordsToVerify = this.records.filter(r => {
        if (start_frame_id !== null && r.frame_id < start_frame_id) return false;
        if (end_frame_id !== null && r.frame_id > end_frame_id) return false;
        return true;
      });
    }

    const seenFrameIds = new Set();

    for (let idx = 0; idx < recordsToVerify.length; idx++) {
      const rec = recordsToVerify[idx];
      const prevRec = idx > 0 ? recordsToVerify[idx - 1] : null;

      // 1. Frame Bytes Existence & Hash Check
      const stored = this.frameStore.get(rec.frame_id);
      if (!stored || stored.rawBytesText === undefined) {
        violations.push({
          sequence_index: rec.sequence_index,
          frame_id: rec.frame_id,
          violation_type: "MISSING_FRAME_BYTES",
          message: `Frame bytes missing or unreadable for frame ${rec.frame_id}.`,
          expected: rec.frame_hash,
          actual: "MISSING",
        });
      } else {
        // Recompute frame hash
        const recomputedFrameHash = await sha256Hex(stored.rawBytesText);
        if (recomputedFrameHash !== rec.frame_hash) {
          violations.push({
            sequence_index: rec.sequence_index,
            frame_id: rec.frame_id,
            violation_type: "FRAME_HASH_MISMATCH",
            message: `Recomputed frame_hash does not match stored frame_hash for frame ${rec.frame_id}.`,
            expected: rec.frame_hash,
            actual: recomputedFrameHash,
          });
        }
      }

      // 2. Genesis Link Validation
      if (idx === 0 && start_frame_id === null) {
        if (rec.previous_hash !== GENESIS_HASH) {
          violations.push({
            sequence_index: rec.sequence_index,
            frame_id: rec.frame_id,
            violation_type: "INVALID_GENESIS_LINK",
            message: `Genesis frame previous_hash must equal GENESIS_HASH.`,
            expected: GENESIS_HASH,
            actual: rec.previous_hash,
          });
        }
        if (rec.frame_id !== 1) {
          violations.push({
            sequence_index: rec.sequence_index,
            frame_id: rec.frame_id,
            violation_type: "DELETED_RECORD",
            message: `Genesis record is missing; chain begins with frame ${rec.frame_id}.`,
            expected: "1",
            actual: String(rec.frame_id),
          });
        }
      }

      // 3. Sequential Order & Deletion Detection
      if (prevRec) {
        if (rec.frame_id > prevRec.frame_id + 1) {
          violations.push({
            sequence_index: rec.sequence_index,
            frame_id: rec.frame_id,
            violation_type: "DELETED_RECORD",
            message: `Detected frame gap between frame ${prevRec.frame_id} and ${rec.frame_id}.`,
            expected: String(prevRec.frame_id + 1),
            actual: String(rec.frame_id),
          });
        } else if (rec.frame_id <= prevRec.frame_id || seenFrameIds.has(rec.frame_id)) {
          violations.push({
            sequence_index: rec.sequence_index,
            frame_id: rec.frame_id,
            violation_type: "REORDERED_RECORD",
            message: `Frame order inverted or duplicated: frame ${rec.frame_id} after ${prevRec.frame_id}.`,
            expected: `> ${prevRec.frame_id}`,
            actual: String(rec.frame_id),
          });
        }

        // 4. Chain Link Validation
        if (rec.previous_hash !== prevRec.chain_hash) {
          violations.push({
            sequence_index: rec.sequence_index,
            frame_id: rec.frame_id,
            violation_type: "BROKEN_PREVIOUS_LINK",
            message: `Previous hash link broken at frame ${rec.frame_id}. Does not match prior chain_hash.`,
            expected: prevRec.chain_hash,
            actual: rec.previous_hash,
          });
        }
      }

      seenFrameIds.add(rec.frame_id);

      // 5. Chain Hash Recomputation
      const recomputedChainHash = await computeChainHash(
        rec.frame_id,
        rec.timestamp,
        rec.frame_hash,
        rec.previous_hash
      );
      if (recomputedChainHash !== rec.chain_hash) {
        violations.push({
          sequence_index: rec.sequence_index,
          frame_id: rec.frame_id,
          violation_type: "CHAIN_HASH_MISMATCH",
          message: `Recomputed chain_hash mismatch at frame ${rec.frame_id}. Payload or digest altered.`,
          expected: rec.chain_hash,
          actual: recomputedChainHash,
        });
      }
    }

    const duration_ms = Number((performance.now() - startTime).toFixed(2));
    const isValid = violations.length === 0;
    const status = isValid ? "INTACT" : "COMPROMISED";
    const compromisedCount = violations.length > 0 ? new Set(violations.map(v => v.frame_id)).size : 0;
    const firstCompromisedFrameId = violations.length > 0 ? violations[0].frame_id : null;

    const report = {
      verification_id: `ver_${Date.now()}`,
      verified_at: new Date().toISOString(),
      status,
      is_valid: isValid,
      total_records: recordsToVerify.length,
      valid_records: Math.max(0, recordsToVerify.length - compromisedCount),
      compromised_records: compromisedCount,
      first_compromised_frame_id: firstCompromisedFrameId,
      genesis_hash: GENESIS_HASH,
      duration_ms,
      violations,
    };

    this.lastVerificationReport = report;
    this.streamState.integrity_status = status;
    this.streamState.tamper_active = !isValid;
    this.streamState.active_tamper_count = this.activeTampers.length;

    // Broadcast WebSocket side effects
    this.broadcast("verification_result", report);
    this.broadcast("integrity_update", this.getIntegritySummary());

    if (!isValid) {
      this.broadcast("tamper_alert", {
        alert_id: `alt_${Date.now()}`,
        severity: "CRITICAL",
        tamper_type: null,
        affected_frame_ids: Array.from(new Set(violations.map(v => v.frame_id))),
        violation_count: violations.length,
        summary: `Integrity compromised: ${violations[0].violation_type} detected on frame ${firstCompromisedFrameId}.`,
        violations,
      });
    }

    return report;
  }

  /**
   * Section 5.7: Tamper Simulation
   */
  async simulateTamper({ tamper_type, target_frame_id = null, swap_with_frame_id = null, details = {} }) {
    await this.ready();
    const validTypes = ["modify_frame_bytes", "modify_metadata", "delete_record", "reorder_records", "break_link"];
    if (!validTypes.includes(tamper_type)) {
      throw {
        status: 400,
        error: {
          code: "INVALID_TAMPER_TYPE",
          message: `tamper_type must be one of: ${validTypes.join(", ")}`,
          details: {},
        }
      };
    }

    if (this.records.length === 0) {
      throw {
        status: 409,
        error: {
          code: "INSUFFICIENT_FRAMES",
          message: "Cannot tamper with an empty chain. Capture frames first.",
          details: {},
        }
      };
    }

    // Auto-save pre-tamper snapshot if not already saved
    if (!this.snapshot) {
      this.takeSnapshot();
    }

    // Determine target frame ID
    let targetId = target_frame_id;
    if (targetId === null) {
      const mid = Math.max(0, Math.floor(this.records.length / 2));
      targetId = this.records[mid].frame_id;
    }

    const targetIdx = this.records.findIndex(r => r.frame_id === targetId);
    if (targetIdx === -1 && tamper_type !== "delete_record") {
      throw {
        status: 404,
        error: {
          code: "FRAME_NOT_FOUND",
          message: `Frame ${targetId} not found in chain records.`,
          details: {},
        }
      };
    }

    const appliedAt = new Date().toISOString();
    let affectedFrames = [targetId];

    // Apply specific tamper mode
    switch (tamper_type) {
      case "modify_frame_bytes": {
        // Corrupt frame bytes in storage without updating stored frame_hash
        const stored = this.frameStore.get(targetId);
        if (stored) {
          stored.rawBytesText = stored.rawBytesText + "_CORRUPTED_BYTES_ATTACK";
          stored.image_base64 = generateSyntheticFrame(targetId, this.records[targetIdx].timestamp, true).image_base64;
        }
        break;
      }

      case "modify_metadata": {
        // Corrupt timestamp on target record without updating chain_hash
        if (this.records[targetIdx]) {
          this.records[targetIdx].timestamp = new Date(Date.now() - 99999999).toISOString();
        }
        break;
      }

      case "delete_record": {
        // Remove record from chain sequence
        if (targetIdx !== -1) {
          this.records.splice(targetIdx, 1);
          this.frameStore.delete(targetId);
        }
        break;
      }

      case "reorder_records": {
        if (this.records.length < 2) {
          throw {
            status: 409,
            error: {
              code: "INSUFFICIENT_FRAMES",
              message: "reorder_records requires at least 2 frames.",
              details: {},
            }
          };
        }
        let swapId = swap_with_frame_id;
        let swapIdx = -1;
        if (swapId === null) {
          swapIdx = targetIdx > 0 ? targetIdx - 1 : targetIdx + 1;
          swapId = this.records[swapIdx].frame_id;
        } else {
          swapIdx = this.records.findIndex(r => r.frame_id === swapId);
          if (swapIdx === -1) {
            throw {
              status: 404,
              error: {
                code: "FRAME_NOT_FOUND",
                message: `Swap frame ${swapId} not found in chain records.`,
                details: {},
              }
            };
          }
        }
        // Swap positions
        const temp = this.records[targetIdx];
        this.records[targetIdx] = this.records[swapIdx];
        this.records[swapIdx] = temp;
        affectedFrames = [targetId, swapId];
        break;
      }

      case "break_link": {
        // Corrupt previous_hash pointer
        if (this.records[targetIdx]) {
          this.records[targetIdx].previous_hash = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        }
        break;
      }
    }

    this.activeTampers.push({
      tamper_id: `tmp_${Date.now()}`,
      tamper_type,
      target_frame_id: targetId,
      affected_frame_ids: affectedFrames,
      applied_at: appliedAt,
    });

    this.streamState.tamper_active = true;
    this.streamState.active_tamper_count = this.activeTampers.length;

    // Run verification to detect the attack
    const verification = await this.verifyChain();

    // Broadcast tamper alert with contract shape
    this.broadcast("tamper_alert", {
      alert_id: `alt_${Date.now()}`,
      severity: "CRITICAL",
      tamper_type,
      affected_frame_ids: affectedFrames,
      violation_count: verification.violations.length,
      summary: `Simulated attack ${tamper_type} applied to frame(s) ${affectedFrames.join(", ")}.`,
      violations: verification.violations,
    });

    return {
      tamper_id: `tmp_${Date.now()}`,
      tamper_type,
      target_frame_id: targetId,
      affected_frame_ids: affectedFrames,
      applied_at: appliedAt,
      snapshot_available: true,
      message: `Simulated ${tamper_type} on frame ${targetId}.`,
      verification,
    };
  }

  /**
   * Section 5.8: Tamper Reset
   */
  async resetTamper({ clear_all = false } = {}) {
    if (clear_all) {
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.records = [];
      this.frameStore.clear();
      this.snapshot = null;
      this.activeTampers = [];
      this.streamState.status = "IDLE";
      this.streamState.frames_captured = 0;
      this.streamState.latest_frame_id = null;
      this.streamState.latest_chain_hash = null;
      this.streamState.integrity_status = "EMPTY";
      this.streamState.tamper_active = false;
      this.streamState.active_tamper_count = 0;

      const verification = await this.verifyChain();
      this.broadcast("stream_status", { ...this.streamState });

      return {
        reset_mode: "clear_all",
        restored_records: 0,
        reset_at: new Date().toISOString(),
        integrity_status: "EMPTY",
        message: "Cleared all stored frames, chain records, and snapshots.",
        verification,
      };
    }

    if (!this.snapshot) {
      // Re-populate clean frames if no snapshot
      await this.initInitialRecords(12);
    } else {
      // Restore clean snapshot
      this.records = JSON.parse(JSON.stringify(this.snapshot.records));
      this.frameStore = new Map();
      for (const [k, v] of this.snapshot.frameStore.entries()) {
        this.frameStore.set(k, { ...v });
      }
    }

    this.activeTampers = [];
    this.streamState.tamper_active = false;
    this.streamState.active_tamper_count = 0;
    this.streamState.latest_frame_id = this.records[this.records.length - 1]?.frame_id || null;
    this.streamState.latest_chain_hash = this.records[this.records.length - 1]?.chain_hash || null;
    this.streamState.frames_captured = this.records.length;

    // Run verification to confirm restored state is intact
    const verification = await this.verifyChain();

    return {
      reset_mode: "restore_snapshot",
      restored_records: this.records.length,
      reset_at: new Date().toISOString(),
      integrity_status: "INTACT",
      message: "Restored chain and frame bytes from pre-tamper snapshot.",
      verification,
    };
  }
}

// Global singleton instance for mock backend
export const mockBackend = new MockBackendStore();
