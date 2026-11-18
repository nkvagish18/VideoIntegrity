import React, { useState } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Radio, 
  Server, 
  Wifi, 
  WifiOff, 
  Settings, 
  RotateCcw,
  ExternalLink,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { apiConfig, probeBackendHealth } from '../services/api';
import { socketService } from '../services/socket';

export function Navbar({ 
  streamState, 
  wsState, 
  onResetAll 
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [restUrl, setRestUrl] = useState(apiConfig.getBaseUrl());
  const [wsUrl, setWsUrl] = useState(socketService.getWsUrl());
  const [healthStatus, setHealthStatus] = useState(null);
  const [isProbing, setIsProbing] = useState(false);

  const handleProbe = async () => {
    setIsProbing(true);
    setHealthStatus(null);
    const res = await probeBackendHealth(restUrl);
    setHealthStatus(res);
    setIsProbing(false);
  };

  const handleSaveSettings = () => {
    apiConfig.setBaseUrl(restUrl);
    socketService.setWsUrl(wsUrl);
    setShowSettings(false);
  };

  const isIntact = streamState.integrity_status === 'INTACT';
  const isCompromised = streamState.integrity_status === 'COMPROMISED';

  return (
    <header className="sticky top-0 z-40 bg-graphite-900/90 backdrop-blur-md border-b border-graphite-750 px-4 lg:px-8 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-lg bg-graphite-800 border border-sky-500/30 text-sky-400 shadow-cyber-sm">
            <Shield className="w-6 h-6 text-sky-400" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-wider text-slate-100 font-mono">
                VIDEO<span className="text-sky-400">INTEGRITY</span>
              </span>
              <span className="text-[10px] font-mono tracking-widest px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-800/60 uppercase">
                v1.0.0 SHA-256
              </span>
            </div>
            <p className="text-xs text-graphite-400 font-mono hidden sm:block">
              Deterministic Cryptographic Chain Surveillance System
            </p>
          </div>
        </div>

        {/* Status Indicators & Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Integrity Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border transition-all ${
            isIntact 
              ? 'bg-emerald-950/50 text-emerald-300 border-emerald-500/40 shadow-cyber-success'
              : isCompromised
              ? 'bg-rose-950/60 text-rose-300 border-rose-500/60 animate-pulse shadow-cyber-danger'
              : 'bg-graphite-800 text-slate-400 border-graphite-700'
          }`}>
            {isIntact && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
            {isCompromised && <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
            {!isIntact && !isCompromised && <Info className="w-3.5 h-3.5 text-slate-400" />}
            <span>CHAIN: {streamState.integrity_status}</span>
          </div>

          {/* WebSocket Status */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border ${
            wsState === 'CONNECTED'
              ? 'bg-graphite-800/80 text-sky-300 border-sky-500/30'
              : wsState === 'CONNECTING'
              ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
              : 'bg-rose-950/30 text-rose-400 border-rose-500/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              wsState === 'CONNECTED' ? 'bg-sky-400 animate-pulse' : wsState === 'CONNECTING' ? 'bg-amber-400' : 'bg-rose-500'
            }`} />
            <span className="hidden md:inline">WS:</span>
            <span>{wsState}</span>
          </div>

          {/* Live Production Backend Indicator */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-emerald-950/50 text-emerald-300 border border-emerald-500/40"
            title={`Connected to live backend: ${apiConfig.getBaseUrl()}`}
          >
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>LIVE BACKEND</span>
          </div>

          {/* Settings Modal Toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1.5 rounded-lg bg-graphite-800 border border-graphite-700 text-graphite-300 hover:text-sky-300 hover:border-sky-500/40 transition-colors"
            title="Configure Backend Endpoints"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Dialog Drawer */}
      {showSettings && (
        <div className="mt-3 max-w-7xl mx-auto p-4 rounded-xl bg-graphite-850 border border-graphite-700 shadow-2xl animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-graphite-750">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200 font-mono">
              <Server className="w-4 h-4 text-sky-400" />
              <span>Laptop 1 Integration & Network Endpoint Configuration</span>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="text-xs text-graphite-400 hover:text-slate-200 font-mono"
            >
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <label className="block text-xs font-mono text-graphite-300 mb-1">
                REST API Base URL (docs/API_CONTRACT.md: http://&lt;HOST&gt;:8000)
              </label>
              <input
                type="text"
                value={restUrl}
                onChange={(e) => setRestUrl(e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full bg-graphite-900 border border-graphite-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-graphite-300 mb-1">
                WebSocket Live URL (Section 6: ws://&lt;HOST&gt;:8000/ws/live)
              </label>
              <input
                type="text"
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                placeholder="ws://localhost:8000/ws/live"
                className="w-full bg-graphite-900 border border-graphite-700 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Test Health Button */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <button
                onClick={handleProbe}
                disabled={isProbing}
                className="px-3 py-1.5 rounded text-xs font-mono bg-graphite-800 hover:bg-graphite-750 border border-graphite-700 text-sky-300 transition-colors"
              >
                {isProbing ? 'Probing...' : 'Probe Backend Health (GET /api/stream/status)'}
              </button>
              {healthStatus && (
                <span className={`text-xs font-mono flex items-center gap-1 ${
                  healthStatus.online ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {healthStatus.online ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                  {healthStatus.online ? 'Backend Online & Reachable!' : `Unreachable: ${healthStatus.error}`}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-1.5 rounded text-xs font-mono bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
              >
                Apply & Save Endpoints
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
