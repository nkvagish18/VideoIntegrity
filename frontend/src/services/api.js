/**
 * VideoIntegrity — Centralized API Service Layer (Production Live Backend)
 * Location: frontend/src/services/api.js
 *
 * Strict adherence to docs/API_CONTRACT.md (REST Endpoints 5.1 - 5.8).
 * Always communicates with the live FastAPI backend (default: http://localhost:8000).
 */

const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const STORAGE_KEY_BASE_URL = 'videointegrity_base_url';

let currentBaseUrl = (localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
const configListeners = new Set();

export const apiConfig = {
  getBaseUrl() {
    return currentBaseUrl;
  },

  setBaseUrl(url) {
    currentBaseUrl = String(url || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
    localStorage.setItem(STORAGE_KEY_BASE_URL, currentBaseUrl);
    configListeners.forEach((fn) => {
      try {
        fn(currentBaseUrl);
      } catch (err) {
        console.error('API config listener error:', err);
      }
    });
  },

  onBaseUrlChange(callback) {
    configListeners.add(callback);
    return () => configListeners.delete(callback);
  },
};

/**
 * Deterministic canonical JSON string matching docs/API_CONTRACT.md Section 2.3.
 * Used purely for display in the Frame Inspector modal.
 */
export function canonicalJson(frameId, timestamp, frameHash, previousHash) {
  return JSON.stringify({
    frame_hash: frameHash,
    frame_id: frameId,
    previous_hash: previousHash,
    timestamp,
  });
}

/**
 * Standardized API Error matching Section 7 uniform JSON structure:
 * { "error": { "code": "...", "message": "...", "details": {} } }
 */
export class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message || code || 'API Request Failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(endpoint, options = {}) {
  const url = `${currentBaseUrl}${endpoint}`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      if (data && typeof data === 'object' && data.error) {
        throw new ApiError(
          res.status,
          data.error.code || 'UNKNOWN_ERROR',
          data.error.message || `HTTP ${res.status}`,
          data.error.details || {}
        );
      }
      throw new ApiError(res.status, 'HTTP_ERROR', `Request failed with HTTP status ${res.status}`);
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      err.message || `Cannot reach backend server at ${currentBaseUrl}. Verify Uvicorn is running.`
    );
  }
}

// -------------------------------------------------------------
// REST API Endpoints (docs/API_CONTRACT.md Sections 5.1 - 5.8)
// -------------------------------------------------------------

/**
 * 5.1 POST /api/stream/start
 */
export async function startStream({
  source = 'synthetic',
  fps = 2.0,
  device_index = 0,
  file_path = null,
  reset_existing = false,
  jpeg_quality = 85,
} = {}) {
  return await request('/api/stream/start', {
    method: 'POST',
    body: JSON.stringify({
      source,
      fps: Number(fps),
      device_index: Number(device_index),
      file_path,
      reset_existing: Boolean(reset_existing),
      jpeg_quality: Number(jpeg_quality),
    }),
  });
}

/**
 * 5.2 POST /api/stream/stop
 */
export async function stopStream() {
  return await request('/api/stream/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * 5.3 GET /api/stream/status
 */
export async function getStreamStatus() {
  return await request('/api/stream/status', {
    method: 'GET',
  });
}

/**
 * 5.4 GET /api/frames
 */
export async function getFrames({
  limit = 50,
  offset = 0,
  include_image = false,
  order = 'desc',
} = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    include_image: String(include_image),
    order: String(order),
  });

  return await request(`/api/frames?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * 5.5 GET /api/chain
 */
export async function getChain({ limit = 200, offset = 0 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });

  return await request(`/api/chain?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * 5.6 POST /api/verify
 */
export async function verifyChain({ start_frame_id = null, end_frame_id = null } = {}) {
  return await request('/api/verify', {
    method: 'POST',
    body: JSON.stringify({
      start_frame_id,
      end_frame_id,
    }),
  });
}

/**
 * 5.7 POST /api/tamper/simulate
 */
export async function simulateTamper({
  tamper_type,
  target_frame_id = null,
  swap_with_frame_id = null,
  details = {},
}) {
  return await request('/api/tamper/simulate', {
    method: 'POST',
    body: JSON.stringify({
      tamper_type,
      target_frame_id,
      swap_with_frame_id,
      details,
    }),
  });
}

/**
 * 5.8 POST /api/tamper/reset
 */
export async function resetTamper({ clear_all = false } = {}) {
  return await request('/api/tamper/reset', {
    method: 'POST',
    body: JSON.stringify({
      clear_all: Boolean(clear_all),
    }),
  });
}

/**
 * Connectivity probe to verify the live backend is reachable.
 */
export async function probeBackendHealth(customUrl = null) {
  const url = (customUrl || currentBaseUrl).replace(/\/+$/, '');
  try {
    const res = await fetch(`${url}/api/stream/status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      return { online: true, status: res.status };
    }
    return { online: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { online: false, error: err.message };
  }
}
