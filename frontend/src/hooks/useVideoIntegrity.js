/**
 * VideoIntegrity — Main Dashboard State Hook (Production Live Backend)
 * Location: frontend/src/hooks/useVideoIntegrity.js
 *
 * Centralizes real-time state synchronization, WebSocket event handling,
 * and REST API mutations matching docs/API_CONTRACT.md.
 */

import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';
import { socketService } from '../services/socket';

export function useVideoIntegrity() {
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
    integrity_status: 'EMPTY', // 'INTACT' | 'COMPROMISED' | 'EMPTY'
    tamper_active: false,
    active_tamper_count: 0,
    connected_ws_clients: 0,
  });

  const [latestFrame, setLatestFrame] = useState(null);
  const [chainRecords, setChainRecords] = useState([]);
  const [verificationReport, setVerificationReport] = useState(null);
  const [tamperAlert, setTamperAlert] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [performanceHistory, setPerformanceHistory] = useState([]);

  const addLog = useCallback((type, message, details = null) => {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
    };
    setActivityLogs((prev) => [entry, ...prev.slice(0, 199)]);
  }, []);

  const refreshChain = useCallback(async () => {
    try {
      const data = await api.getChain({ limit: 200, offset: 0 });
      if (data && Array.isArray(data.records)) {
        setChainRecords(data.records);
      }
    } catch (err) {
      console.warn('Failed to refresh chain:', err);
    }
  }, []);

  const hydrateFromBackend = useCallback(async () => {
    try {
      const status = await api.getStreamStatus();
      if (status) {
        setStreamState((prev) => ({ ...prev, ...status }));
      }
      const frames = await api.getFrames({ limit: 1, order: 'desc', include_image: true });
      if (frames && Array.isArray(frames.frames) && frames.frames.length > 0) {
        setLatestFrame(frames.frames[0]);
      } else {
        setLatestFrame(null);
      }
      await refreshChain();
    } catch (err) {
      console.warn('Backend hydration error:', err);
    }
  }, [refreshChain]);

  useEffect(() => {
    const unsubBaseUrl = api.apiConfig.onBaseUrlChange((newUrl) => {
      addLog('STREAM_EVENT', `Backend API endpoint updated to ${newUrl}`);
      hydrateFromBackend();
    });

    const unsubWsState = socketService.onStateChange((state) => {
      setWsState(state);
    });

    const unsubFrame = socketService.subscribe('frame_update', (frameData) => {
      setLatestFrame(frameData);

      setChainRecords((prev) => {
        const exists = prev.some(
          (r) => r.sequence_index === frameData.sequence_index && r.frame_id === frameData.frame_id
        );
        if (exists) return prev;
        return [...prev, frameData];
      });

      setStreamState((prev) => ({
        ...prev,
        latest_frame_id: frameData.frame_id,
        latest_chain_hash: frameData.chain_hash,
      }));

      setPerformanceHistory((prev) => [
        ...prev.slice(-29),
        {
          frame_id: frameData.frame_id,
          byte_size: frameData.byte_size || 0,
          timestamp: frameData.timestamp ? frameData.timestamp.split('T')[1].slice(0, 8) : '',
        },
      ]);

      addLog(
        'FRAME_CAPTURED',
        `Frame #${frameData.frame_id} captured (${((frameData.byte_size || 0) / 1024).toFixed(1)} KB)`,
        { frame_id: frameData.frame_id, byte_size: frameData.byte_size }
      );
      addLog('HASH_GENERATED', `SHA-256 Frame Hash computed: ${frameData.frame_hash.slice(0, 16)}...`, {
        frame_hash: frameData.frame_hash,
      });
      addLog(
        'CHAIN_EXTENDED',
        `Block #${frameData.frame_id} linked with Chain Hash: ${frameData.chain_hash.slice(0, 16)}...`,
        { chain_hash: frameData.chain_hash, previous_hash: frameData.previous_hash }
      );
    });

    const unsubIntegrity = socketService.subscribe('integrity_update', (integrityData) => {
      setStreamState((prev) => ({
        ...prev,
        integrity_status: integrityData.integrity_status,
        frames_captured: integrityData.total_records ?? prev.frames_captured,
        tamper_active: integrityData.tamper_active,
        active_tamper_count: integrityData.active_tamper_count,
        latest_frame_id: integrityData.latest_frame_id ?? null,
        latest_chain_hash: integrityData.latest_chain_hash ?? null,
      }));
    });

    const unsubVerify = socketService.subscribe('verification_result', (report) => {
      setVerificationReport(report);
      setStreamState((prev) => ({
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
      addLog('TAMPER_DETECTED', `TAMPER ALERT [${alert.severity}]: ${alert.summary}`, alert);
    });

    const unsubStatus = socketService.subscribe('stream_status', (statusData) => {
      setStreamState((prev) => ({
        ...prev,
        ...statusData,
      }));
      addLog(
        'STREAM_EVENT',
        `Stream status changed: ${statusData.status} (source: ${statusData.source || 'idle'})`
      );
    });

    socketService.connect();
    hydrateFromBackend();

    return () => {
      unsubBaseUrl();
      unsubWsState();
      unsubFrame();
      unsubIntegrity();
      unsubVerify();
      unsubTamper();
      unsubStatus();
      socketService.disconnect();
    };
  }, [addLog, hydrateFromBackend]);

  // --- Actions ---

  const startStream = async (config = {}) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.startStream(config);
      if (config.reset_existing) {
        setChainRecords([]);
        setLatestFrame(null);
        setPerformanceHistory([]);
        setVerificationReport(null);
        setTamperAlert(null);
      }
      setStreamState((prev) => ({ ...prev, status: 'RUNNING', ...res }));
      addLog('STREAM_EVENT', `Stream capture started (${res.source} @ ${res.fps} FPS)`);
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
      setStreamState((prev) => ({ ...prev, status: 'IDLE', ...res }));
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
      setStreamState((prev) => ({ ...prev, integrity_status: report.status }));
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
        setStreamState((prev) => ({
          ...prev,
          integrity_status: res.verification.status,
          tamper_active: true,
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
      } else {
        setVerificationReport(null);
      }
      if (clearAll) {
        setChainRecords([]);
        setLatestFrame(null);
        setPerformanceHistory([]);
      }
      setStreamState((prev) => ({
        ...prev,
        integrity_status: res.integrity_status,
        tamper_active: false,
        active_tamper_count: 0,
        frames_captured: res.restored_records ?? prev.frames_captured,
      }));
      await hydrateFromBackend();
      addLog(
        'STREAM_EVENT',
        clearAll ? 'Database completely reset and wiped' : 'Restored clean pre-tamper snapshot'
      );
      return res;
    } catch (err) {
      setErrorMessage(err.message || 'Reset failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const dismissTamperAlert = () => {
    setTamperAlert(null);
  };

  return {
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
