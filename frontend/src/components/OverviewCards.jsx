import React from 'react';
import { 
  Activity, 
  Film, 
  CheckCircle, 
  AlertOctagon, 
  ShieldCheck, 
  ShieldAlert, 
  Lock,
  Layers,
  Radio
} from 'lucide-react';

export function OverviewCards({ streamState, verificationReport }) {
  const isRunning = streamState.status === 'RUNNING';
  const totalFrames = streamState.frames_captured || 0;
  
  // Compute valid vs tampered frames
  const tamperedFrames = verificationReport 
    ? verificationReport.compromised_records 
    : (streamState.tamper_active ? 1 : 0);
  
  const verifiedFrames = Math.max(0, totalFrames - tamperedFrames);
  const integrityStatus = streamState.integrity_status || 'EMPTY';
  const isIntact = integrityStatus === 'INTACT';
  const isCompromised = integrityStatus === 'COMPROMISED';

  const integrityPercent = totalFrames > 0 
    ? Math.round((verifiedFrames / totalFrames) * 100) 
    : 100;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Stream Connection Status */}
        <div className="relative overflow-hidden rounded-xl bg-graphite-850 border border-graphite-750 p-4 shadow-lg hover:border-graphite-650 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-graphite-400 uppercase tracking-wider">
              Stream Status
            </span>
            <div className={`p-2 rounded-lg ${
              isRunning ? 'bg-sky-500/10 text-sky-400' : 'bg-graphite-800 text-graphite-400'
            }`}>
              <Radio className={`w-4 h-4 ${isRunning ? 'animate-pulse text-sky-400' : ''}`} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {streamState.status}
            </span>
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase ${
              isRunning 
                ? 'bg-sky-950 text-sky-400 border border-sky-800' 
                : 'bg-graphite-800 text-graphite-400 border border-graphite-700'
            }`}>
              {streamState.source || 'idle'}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-graphite-400 flex items-center justify-between">
            <span>FPS: {isRunning ? (streamState.fps || 2.0).toFixed(1) : '0.0'}</span>
            <span>WS Clients: {streamState.connected_ws_clients || 1}</span>
          </div>
        </div>

        {/* 2. Total Frames Processed */}
        <div className="relative overflow-hidden rounded-xl bg-graphite-850 border border-graphite-750 p-4 shadow-lg hover:border-graphite-650 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-graphite-400 uppercase tracking-wider">
              Total Frames
            </span>
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <Film className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {totalFrames.toLocaleString()}
            </span>
            <span className="text-xs font-mono text-graphite-400">blocks</span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-graphite-400 truncate">
            Latest ID: #{streamState.latest_frame_id ? String(streamState.latest_frame_id).padStart(5, '0') : 'NONE'}
          </div>
        </div>

        {/* 3. Verified Frames */}
        <div className="relative overflow-hidden rounded-xl bg-graphite-850 border border-graphite-750 p-4 shadow-lg hover:border-graphite-650 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-graphite-400 uppercase tracking-wider">
              Verified Frames
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {verifiedFrames.toLocaleString()}
            </span>
            <span className="text-xs font-mono text-emerald-500/80">
              ({integrityPercent}%)
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-graphite-400">
            Cryptographically Intact
          </div>
        </div>

        {/* 4. Tampered Frames */}
        <div className={`relative overflow-hidden rounded-xl bg-graphite-850 border p-4 shadow-lg transition-all ${
          tamperedFrames > 0 
            ? 'border-rose-500/60 shadow-cyber-danger' 
            : 'border-graphite-700 hover:border-graphite-650'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-graphite-400 uppercase tracking-wider">
              Tampered Frames
            </span>
            <div className={`p-2 rounded-lg ${
              tamperedFrames > 0 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-graphite-800 text-graphite-400'
            }`}>
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${
              tamperedFrames > 0 ? 'text-rose-400' : 'text-slate-100'
            }`}>
              {tamperedFrames}
            </span>
            {tamperedFrames > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 uppercase animate-pulse">
                Breach
              </span>
            )}
          </div>
          <div className="mt-2 text-[11px] font-mono text-graphite-400">
            {tamperedFrames > 0 ? 'Violations active' : 'Zero tampering'}
          </div>
        </div>

        {/* 5. Current Chain Integrity */}
        <div className={`relative overflow-hidden rounded-xl bg-graphite-850 border p-4 shadow-lg transition-all ${
          isIntact 
            ? 'border-emerald-500/40 shadow-cyber-success' 
            : isCompromised 
            ? 'border-rose-500/60 shadow-cyber-danger animate-pulse-subtle' 
            : 'border-graphite-750'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-graphite-400 uppercase tracking-wider">
              Chain Integrity
            </span>
            <div className={`p-2 rounded-lg ${
              isIntact 
                ? 'bg-emerald-500/10 text-emerald-400' 
                : isCompromised 
                ? 'bg-rose-500/20 text-rose-400' 
                : 'bg-graphite-800 text-slate-400'
            }`}>
              {isIntact ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono tracking-wide ${
              isIntact ? 'text-emerald-400' : isCompromised ? 'text-rose-400' : 'text-slate-300'
            }`}>
              {integrityStatus}
            </span>
          </div>
          <div className="mt-2 text-[11px] font-mono text-graphite-400">
            Deterministic SHA-256
          </div>
        </div>
      </div>

      {/* Visual Integrity Progress Bar */}
      {totalFrames > 0 && (
        <div className="rounded-xl bg-graphite-850 border border-graphite-750 px-4 py-2.5 flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-graphite-300 whitespace-nowrap">
            <Lock className="w-3.5 h-3.5 text-sky-400" />
            <span>Chain Security Ratio:</span>
          </div>
          <div className="flex-1 h-2 rounded-full bg-graphite-800 overflow-hidden flex">
            <div 
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${integrityPercent}%` }}
              title={`Intact: ${verifiedFrames} frames (${integrityPercent}%)`}
            />
            {tamperedFrames > 0 && (
              <div 
                className="h-full bg-rose-500 animate-pulse"
                style={{ width: `${100 - integrityPercent}%` }}
                title={`Tampered: ${tamperedFrames} frames`}
              />
            )}
          </div>
          <span className={`text-xs font-mono font-semibold ${
            isIntact ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {integrityPercent}% Intact
          </span>
        </div>
      )}
    </div>
  );
}
