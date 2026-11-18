/**
 * VideoIntegrity — Centralized WebSocket Service Layer
 * Location: frontend/src/services/socket.js
 * 
 * Strict adherence to docs/API_CONTRACT.md (Section 6: ws://HOST:8000/ws/live)
 * 
 * Manages WebSocket connection lifecycle, automatic reconnection, heartbeats,
 * and event dispatching. Seamlessly routes between Live Laptop 1 WebSocket and
 * Mock WebSocket simulator.
 */

import { apiConfig } from './api';
import { mockBackend } from './mockBackend';

const DEFAULT_WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/live';
const STORAGE_KEY_WS_URL = 'videointegrity_ws_url';

class SocketService {
  constructor() {
    this.ws = null;
    this.wsUrl = localStorage.getItem(STORAGE_KEY_WS_URL) || DEFAULT_WS_URL;
    this.state = 'DISCONNECTED'; // 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
    this.listeners = new Map(); // eventName -> Set of callback functions
    this.stateListeners = new Set();
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.mockUnsubscribe = null;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 10000;

    // React to changes in mock mode setting
    apiConfig.onMockModeChange((isMock) => {
      this.reconnect();
    });
  }

  getWsUrl() {
    return this.wsUrl;
  }

  setWsUrl(url) {
    this.wsUrl = url;
    localStorage.setItem(STORAGE_KEY_WS_URL, url);
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING') {
      this.reconnect();
    }
  }

  getConnectionState() {
    return this.state;
  }

  setState(newState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach(cb => {
        try { cb(newState); } catch (e) { console.error('WS state listener error:', e); }
      });
    }
  }

  onStateChange(callback) {
    this.stateListeners.add(callback);
    callback(this.state);
    return () => this.stateListeners.delete(callback);
  }

  /**
   * Subscribe to specific WebSocket events defined in Section 6:
   * 'frame_update' | 'integrity_update' | 'verification_result' | 'tamper_alert' | 'stream_status' | '*'
   */
  subscribe(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(callback);
      }
    };
  }

  dispatchEvent(event, payload) {
    // Exact event listeners
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(cb => {
        try { cb(payload); } catch (err) { console.error(`Error in WS event handler for ${event}:`, err); }
      });
    }

    // Wildcard listeners
    const wildcardHandlers = this.listeners.get('*');
    if (wildcardHandlers) {
      wildcardHandlers.forEach(cb => {
        try { cb(event, payload); } catch (err) { console.error(`Error in WS wildcard handler:`, err); }
      });
    }
  }

  connect() {
    this.shouldReconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (apiConfig.isMockMode()) {
      this.connectMock();
    } else {
      this.connectReal();
    }
  }

  connectMock() {
    this.cleanupReal();
    this.setState('CONNECTING');

    setTimeout(() => {
      this.setState('CONNECTED');
      if (this.mockUnsubscribe) {
        this.mockUnsubscribe();
      }

      this.mockUnsubscribe = mockBackend.subscribeWs((envelope) => {
        if (envelope && envelope.event) {
          this.dispatchEvent(envelope.event, envelope.data, envelope.timestamp);
        }
      });
    }, 150);
  }

  connectReal() {
    this.cleanupMock();
    this.setState('CONNECTING');

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.setState('CONNECTED');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (messageEvent) => {
        try {
          const envelope = JSON.parse(messageEvent.data);
          if (envelope && envelope.event) {
            // Heartbeat pong response
            if (envelope.event === 'pong') {
              return;
            }
            this.dispatchEvent(envelope.event, envelope.data, envelope.timestamp);
          }
        } catch (err) {
          console.warn('WS message parse error:', err, messageEvent.data);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WS error:', err);
        this.setState('ERROR');
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.setState('DISCONNECTED');
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('WS initiation error:', err);
      this.setState('ERROR');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ event: 'ping' });
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  send(data) {
    if (apiConfig.isMockMode()) {
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }

  cleanupMock() {
    if (this.mockUnsubscribe) {
      this.mockUnsubscribe();
      this.mockUnsubscribe = null;
    }
  }

  cleanupReal() {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupMock();
    this.cleanupReal();
    this.setState('DISCONNECTED');
  }

  reconnect() {
    this.disconnect();
    this.connect();
  }
}

// Global singleton WebSocket service
export const socketService = new SocketService();
