/**
 * VideoIntegrity — Centralized API Service Layer
 * Location: frontend/src/services/api.js
 * 
 * Strict adherence to docs/API_CONTRACT.md (REST Endpoints 5.1 - 5.8)
 * 
 * Supports seamless switching between Live Backend (Laptop 1: http://localhost:8000)
 * and Realistic Mock Mode for independent UI development and demonstrations.
 */

import { mockBackend } from './mockBackend';

// Default configuration from environment or fallback
const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const STORAGE_KEY_MOCK = 'videointegrity_mock_mode';
const STORAGE_KEY_BASE_URL = 'videointegrity_base_url';

// Determine initial mock mode: default to true if backend isn't configured, or respect localStorage/env
function getInitialMockMode() {
  const stored = localStorage.getItem(STORAGE_KEY_MOCK);
  if (stored !== null) {
    return stored === 'true';
  }
  // If explicitly specified in .env
  if (import.meta.env.VITE_USE_MOCK !== undefined) {
    return import.meta.env.VITE_USE_MOCK === 'true';
  }
  // Default to mock mode initially so frontend runs out-of-the-box before backend starts
  return true;
}

let mockModeActive = getInitialMockMode();
let currentBaseUrl = localStorage.getItem(STORAGE_KEY_BASE_URL) || DEFAULT_API_BASE_URL;
const modeListeners = new Set();

export const apiConfig = {
  isMockMode() {
    return mockModeActive;
  },

  setMockMode(enabled) {
    mockModeActive = Boolean(enabled);
    localStorage.setItem(STORAGE_KEY_MOCK, String(mockModeActive));
    modeListeners.forEach(fn => fn(mockModeActive));
  },

  getBaseUrl() {
    return currentBaseUrl;
  },

  setBaseUrl(url) {
    currentBaseUrl = url.replace(/\/+$/, '');
    localStorage.setItem(STORAGE_KEY_BASE_URL, currentBaseUrl);
  },

  onMockModeChange(callback) {
    modeListeners.add(callback);
    return () => modeListeners.delete(callback);
  }
};

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

/**
 * Helper for making actual HTTP requests to Laptop 1 backend
 */
async function request(endpoint, options = {}) {
  const url = `${currentBaseUrl}${endpoint}`;
  const headers = {
    'Accept': 'application/json',
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
    throw new ApiError(0, 'NETWORK_ERROR', err.message || 'Cannot reach backend server. Check host or enable Mock Mode.');
  }
}

// -------------------------------------------------------------
// Centralized API Service Implementation (docs/API_CONTRACT.md)
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
  if (mockModeActive) {
    return await mockBackend.startStream({ source, fps, device_index, file_path, reset_existing, jpeg_quality });
  }

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
  if (mockModeActive) {
    return await mockBackend.stopStream();
  }

  return await request('/api/stream/stop', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/**
 * 5.3 GET /api/stream/status
 */
export async function getStreamStatus() {
  if (mockModeActive) {
    return await mockBackend.getStreamStatus();
  }

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
  if (mockModeActive) {
    return await mockBackend.getFrames({ limit, offset, include_image, order });
  }

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
export async function getChain({
  limit = 200,
  offset = 0,
} = {}) {
  if (mockModeActive) {
    return await mockBackend.getChain({ limit, offset });
  }

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
export async function verifyChain({
  start_frame_id = null,
  end_frame_id = null,
} = {}) {
  if (mockModeActive) {
    return await mockBackend.verifyChain({ start_frame_id, end_frame_id });
  }

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
  if (mockModeActive) {
    return await mockBackend.simulateTamper({
      tamper_type,
      target_frame_id,
      swap_with_frame_id,
      details,
    });
  }

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
export async function resetTamper({
  clear_all = false,
} = {}) {
  if (mockModeActive) {
    return await mockBackend.resetTamper({ clear_all });
  }

  return await request('/api/tamper/reset', {
    method: 'POST',
    body: JSON.stringify({
      clear_all: Boolean(clear_all),
    }),
  });
}

/**
 * Quick connectivity test to verify if Laptop 1 backend is alive
 */
export async function probeBackendHealth(customUrl = null) {
  const url = (customUrl || currentBaseUrl).replace(/\/+$/, '');
  try {
    const res = await fetch(`${url}/api/stream/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
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
