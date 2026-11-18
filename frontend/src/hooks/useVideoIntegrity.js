/**
 * VideoIntegrity — Main Dashboard State Hook
 * Location: frontend/src/hooks/useVideoIntegrity.js
 * 
 * Centralizes real-time state synchronization, WebSocket event handling,
 * and REST API mutations matching docs/API_CONTRACT.md.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '../services/api';
import { socketService } from '../services/socket';

export function useVideoIntegrity() {
  // Connection and Mode State
  const [isMock, setIsMock] = useState(api.apiConfig.isMockMode());
  const [wsState, setWsState] = useState(socketService.getConnectionState());

  // Core Data States matching Contract Models
  const [streamState, setStreamState] = useState({
    status: 'IDLE', // 'IDLE' | 'RUNNING' | 'ERROR'
    stream_id: null,
    source: 'synthetic',
    fps: 2.0,
    started_at: null,
    stopped_at: null,
    frames_captured: 0,
    latest_frame_id: null,
    latest_chain_hash: null,
    integrity_status: 'INTACT', // 'INTACT' | 'COMPROMISED' | 'EMPTY'
    tamper_active: false,
    active_tamper_count: 0,
    connected_ws_clients: 1,
  });

  const [latestFrame, setLatestFrame] = useState(null); // FrameItem
  const [chainRecords, setChainRecords] = useState([]); // Array<ChainRecord>
  const [verificationReport, setVerificationReport] = useState(null); // VerificationReport
  const [tamperAlert, setTamperAlert] = useState(null); // TamperAlert
  const [activityLogs, setActivityLogs] = useState([]); // Audit log array
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Performance metrics for charts
  const [performanceHistory, setPerformanceHistory] = useState([]);

  // Add an entry to the Activity Log
  const addLog = useCallback((type, message, details = null) => {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      type, // 'FRAME_CAPTURED' | 'HASH_GENERATED' | 'CHAIN_EXTENDED' | 'VERIFICATION' | 'TAMPER_DETECTED' | 'STREAM_EVENT'
      message,
      details,
    };
    setActivityLogs(prev => [entry, ...prev.slice(0, 199)]); // Keep last 200 logs
  }, []);

  // Fetch complete chain from REST API
  const refreshChain = useCallback(async () => {
    try {
      const data = await api.getChain({ limit: 100, offset: 0 });
      if (data && data.records) {
        setChainRecords(data.records);
      }
    } catch (err) {
      console.warn('Failed to refresh chain:', err);
    }
  }, []);

  // Initial load & WebSocket subscription
  useEffect(() => {
    // Listen for mock mode changes
    const unsubMock = api.apiConfig.onMockModeChange((mock) => {
      setIsMock(mock);
      addLog('STREAM_EVENT', `Switched mode to: ${mock ? 'Mock Sandbox' : 'Live Backend API'}`);
    });

    // Listen for WS connection state
    const unsubWsState = socketService.onStateChange((state) => {
      setWsState(state);
    });

    // Subscribe to WebSocket events defined in Section 6
    const unsubFrame = socketService.subscribe('frame_update', (frameData) => {
      setLatestFrame(frameData);

      // Append to chain records in state
      setChainRecords(prev => {
        const exists = prev.some(r => r.frame_id === frameData.frame_id);
        if (exists) return prev;
        return [...prev, frameData];
      });

      // Update stream metrics
      setStreamState(prev => ({
        ...prev,
        frames_captured: prev.frames_captured + 1,
        latest_frame_id: frameData.frame_id,
        latest_chain_hash: frameData.chain_hash,
      }));

      // Performance history record
      setPerformanceHistory(prev => [
        ...prev.slice(-29), // Keep 30 entries
        {
          frame_id: frameData.frame_id,
          byte_size: frameData.byte_size || 24000,
          timestamp: frameData.timestamp.split('T')[1].slice(0, 8),
        }
      ]);

      // Activity logs
      addLog('FRAME_CAPTURED', `Frame #${frameData.frame_id} captured (${(frameData.byte_size / 1024).toFixed(1)} KB)`, {
        frame_id: frameData.frame_id,
        byte_size: frameData.byte_size,
      });
      addLog('HASH_GENERATED', `SHA-256 Frame Hash computed: ${frameData.frame_hash.slice(0, 16)}...`, {
        frame_hash: frameData.frame_hash,
      });
      addLog('CHAIN_EXTENDED', `Block #${frameData.frame_id} linked with Chain Hash: ${frameData.chain_hash.slice(0, 16)}...`, {
        chain_hash: frameData.chain_hash,
        previous_hash: frameData.previous_hash,
      });
    });

    const unsubIntegrity = socketService.subscribe('integrity_update', (integrityData) => {
      setStreamState(prev => ({
        ...prev,
        integrity_status: integrityData.integrity_status,
        tamper_active: integrityData.tamper_active,
        active_tamper_count: integrityData.active_tamper_count,
        latest_frame_id: integrityData.latest_frame_id ?? prev.latest_frame_id,
        latest_chain_hash: integrityData.latest_chain_hash ?? prev.latest_chain_hash,
      }));
    });

    const unsubVerify = socketService.subscribe('verification_result', (report) => {
      setVerificationReport(report);
      setStreamState(prev => ({
        ...prev,
        integrity_status: report.status,
      }));

      addLog(
        'VERIFICATION',
        `Verification completed: status ${report.status} (${report.valid_records}/${report.total_records} valid in ${report.duration_ms}ms)`,
        report
      );
    });

    const unsubTamper = socketService.subscribe('tamper_alert', (alert) => {
      setTamperAlert(alert);
      addLog(
        'TAMPER_DETECTED',
        `TAMPER ALERT [${alert.severity}]: ${alert.summary}`,
        alert
      );
    });

    const unsubStatus = socketService.subscribe('stream_status', (statusData) => {
      setStreamState(prev => ({
        ...prev,
        ...statusData,
      }));
      addLog('STREAM_EVENT', `Stream status changed: ${statusData.status} (source: ${statusData.source || 'default'})`);
    });

    // Start WebSocket connection
    socketService.connect();

    // Hydrate initial chain
    refreshChain();

    return () => {
      unsubMock();
      unsubWsState();
      unsubFrame();
      unsubIntegrity();
      unsubVerify();
      unsubTamper();
      unsubStatus();
      socketService.disconnect();
    };
  }, [addLog, refreshChain]);

  // Initial fetch on mount
  useEffect(() => {
    async function init() {
      try {
        const status = await api.getStreamStatus();
        if (status) {
          setStreamState(prev => ({ ...prev, ...status }));
        }
        const frames = await api.getFrames({ limit: 1, order: 'desc', include_image: true });
        if (frames && frames.frames && frames.frames.length > 0) {
          setLatestFrame(frames.frames[0]);
        }
      } catch (err) {
        console.warn('Initial status fetch error:', err);
      }
    }
    init();
  }, []);

  // --- Actions ---

  const startStream = async (config = {}) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.startStream(config);
      setStreamState(prev => ({ ...prev, status: 'RUNNING', ...res }));
      addLog('STREAM_EVENT', `Stream capture started (${res.source || 'synthetic'} @ ${res.fps || 2} FPS)`);
      return res;
    } catch (err) {
      setErrorMessage(err.message || 'Failed to start stream');
      addLog('STREAM_EVENT', `Stream start error: ${err.message}`, err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const stopStream = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.stopStream();
      setStreamState(prev => ({ ...prev, status: 'IDLE', ...res }));
      addLog('STREAM_EVENT', `Stream capture stopped (${res.frames_captured} frames captured total)`);
      return res;
    } catch (err) {
      setErrorMessage(err.message || 'Failed to stop stream');
      addLog('STREAM_EVENT', `Stream stop error: ${err.message}`, err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyChain = async (bounds = {}) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const report = await api.verifyChain(bounds);
      setVerificationReport(report);
      setStreamState(prev => ({ ...prev, integrity_status: report.status }));
      return report;
    } catch (err) {
      setErrorMessage(err.message || 'Verification failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const simulateTamper = async (params) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.simulateTamper(params);
      if (res.verification) {
        setVerificationReport(res.verification);
        setStreamState(prev => ({
          ...prev,
          integrity_status: res.verification.status,
          tamper_active: true,
          active_tamper_count: prev.active_tamper_count + 1,
        }));
      }
      await refreshChain();
      return res;
    } catch (err) {
      setErrorMessage(err.message || 'Tamper simulation failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resetTamper = async (clearAll = false) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.resetTamper({ clear_all: clearAll });
      setTamperAlert(null);
      if (res.verification) {
        setVerificationReport(res.verification);
      }
      setStreamState(prev => ({
        ...prev,
        integrity_status: res.integrity_status,
        tamper_active: false,
        active_tamper_count: 0,
        frames_captured: res.restored_records ?? prev.frames_captured,
      }));
      await refreshChain();
      addLog('STREAM_EVENT', clearAll ? 'Database completely reset and wiped' : 'Restored clean pre-tamper snapshot');
      return res;
    } catch (err) {
      setErrorMessage(err.message || 'Reset failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMockMode = (enabled) => {
    api.apiConfig.setMockMode(enabled);
  };

  const dismissTamperAlert = () => {
    setTamperAlert(null);
  };

  return {
    isMock,
    toggleMockMode,
    wsState,
    streamState,
    latestFrame,
    chainRecords,
    verificationReport,
    tamperAlert,
    dismissTamperAlert,
    activityLogs,
    clearLogs: () => setActivityLogs([]),
    performanceHistory,
    isLoading,
    errorMessage,
    clearError: () => setErrorMessage(null),
    startStream,
    stopStream,
    verifyChain,
    simulateTamper,
    resetTamper,
    refreshChain,
  };
}
