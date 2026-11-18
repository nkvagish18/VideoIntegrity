import React, { useState } from 'react';
import { 
  Skull, 
  RotateCcw, 
  AlertTriangle, 
  ShieldAlert, 
  FileWarning, 
  ArrowRightLeft, 
  Trash2, 
  Link2Off, 
  CheckCircle, 
  XCircle,
  HelpCircle
} from 'lucide-react';

export function TamperDemonstration({ 
  streamState, 
  tamperAlert, 
  dismissTamperAlert,
  onSimulateTamper, 
  onResetDemonstration, 
  isLoading 
}) {
  const [tamperType, setTamperType] = useState('modify_frame_bytes');
  const [targetFrameId, setTargetFrameId] = useState('');
  const [swapFrameId, setSwapFrameId] = useState('');
  const [lastSimulation, setLastSimulation] = useState(null);

  const tamperTypes = [
    {
      id: 'modify_frame_bytes',
      name: 'Corrupt Frame Bytes',
      expectedViolation: 'FRAME_HASH_MISMATCH',
      desc: 'Silently mutates raw JPEG bytes in storage without recalculating hash.',
      icon: Skull,
    },
    {
      id: 'modify_metadata',
      name: 'Alter Timestamp Metadata',
      expectedViolation: 'CHAIN_HASH_MISMATCH',
      desc: 'Forges frame timestamp; canonical JSON hash mismatch is caught.',
      icon: FileWarning,
    },
    {
      id: 'delete_record',
      name: 'Delete Stored Frame',
      expectedViolation: 'DELETED_RECORD & BROKEN_PREVIOUS_LINK',
      desc: 'Drops an intermediate block from storage, breaking the continuity chain.',
      icon: Trash2,
    },
    {
      id: 'reorder_records',
      name: 'Swap / Reorder Frames',
      expectedViolation: 'REORDERED_RECORD',
      desc: 'Swaps the sequence order of two frames; detects chronological tampering.',
      icon: ArrowRightLeft,
    },
    {
      id: 'break_link',
      name: 'Corrupt Previous Hash Pointer',
      expectedViolation: 'BROKEN_PREVIOUS_LINK',
      desc: 'Overwrites previous_hash pointer with garbage hex value.',
      icon: Link2Off,
    },
  ];

  const handleSimulate = async () => {
    const payload = {
      tamper_type: tamperType,
      target_frame_id: targetFrameId ? Number(targetFrameId) : null,
      swap_with_frame_id: swapFrameId ? Number(swapFrameId) : null,
      details: {},
    };

    const res = await onSimulateTamper(payload);
    setLastSimulation(res);
  };

  const handleReset = async (clearAll = false) => {
    await onResetDemonstration(clearAll);
    setLastSimulation(null);
  };

  // Helper to highlight character diffs between expected and actual hashes
  const renderHashDiff = (expected = '', actual = '') => {
    if (!expected || !actual || expected.length !== actual.length) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2 rounded bg-graphite-950 border border-graphite-800 text-emerald-400 break-all">
            <span className="text-graphite-500 block text-[10px]">Expected:</span>
            {expected || 'None'}
          </div>
          <div className="p-2 rounded bg-graphite-950 border border-rose-950 text-rose-400 break-all">
            <span className="text-graphite-500 block text-[10px]">Actual:</span>
            {actual || 'None'}
          </div>
        </div>
      );
    }

    // Character by character diff
    const expChars = expected.split('');
    const actChars = actual.split('');

    return (
      <div className="space-y-2 text-xs font-mono">
        <div>
          <span className="text-graphite-400 text-[10px] block mb-0.5">Expected Hash (Untampered):</span>
          <div className="p-2 rounded bg-graphite-950 border border-emerald-950 text-emerald-300 break-all select-all">
            {expected}
          </div>
        </div>
        <div>
          <span className="text-rose-400 text-[10px] block mb-0.5">Actual Hash (Observed with Diffs):</span>
          <div className="p-2 rounded bg-graphite-950 border border-rose-900 break-all select-all">
            {actChars.map((ch, idx) => {
              const matches = ch === expChars[idx];
              return (
                <span
                  key={idx}
                  className={matches ? 'text-slate-300' : 'text-rose-400 bg-rose-950/80 font-bold px-0.5 rounded'}
                  title={matches ? 'Matching' : `Mismatch! Expected: ${expChars[idx]}`}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Find active violation for comparison
  const activeViolation = tamperAlert?.violations?.[0] || lastSimulation?.verification?.violations?.[0];

  return (
    <div className="rounded-xl bg-graphite-850 border border-graphite-750 overflow-hidden shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 bg-graphite-900 border-b border-graphite-750 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skull className="w-4 h-4 text-rose-400" />
          <h2 className="text-sm font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Tamper Demonstration & Attack Simulator
          </h2>
        </div>

        {/* Reset Demonstration Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleReset(false)}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-graphite-800 hover:bg-graphite-750 border border-graphite-700 text-xs font-mono text-emerald-400 transition-colors shadow-sm disabled:opacity-50"
            title="Restore clean state from pre-tamper snapshot"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo (Snapshot)</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Critical Tamper Alert Banner */}
        {tamperAlert && (
          <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-500/80 shadow-cyber-danger text-rose-200 text-xs font-mono space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
                <span>CRITICAL TAMPER ALERT // BREACH DETECTED</span>
              </div>
              <button
                onClick={dismissTamperAlert}
                className="text-rose-400 hover:text-rose-200 text-xs font-bold"
              >
                Dismiss ✕
              </button>
            </div>

            <p className="text-rose-100/90 text-xs">
              {tamperAlert.summary || 'Integrity violation detected in video stream hash chain.'}
            </p>

            <div className="pt-2 border-t border-rose-800/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
              <div>
                <span className="text-rose-400 block">Alert ID:</span>
                <span className="text-slate-200 truncate block">{tamperAlert.alert_id}</span>
              </div>
              <div>
                <span className="text-rose-400 block">Severity:</span>
                <span className="text-rose-300 font-bold">{tamperAlert.severity}</span>
              </div>
              <div>
                <span className="text-rose-400 block">Affected Frames:</span>
                <span className="text-rose-200 font-semibold">
                  {tamperAlert.affected_frame_ids ? tamperAlert.affected_frame_ids.join(', ') : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-rose-400 block">Violations:</span>
                <span className="text-rose-200 font-bold">{tamperAlert.violation_count || 1}</span>
              </div>
            </div>
          </div>
        )}

        {/* Expected Hash vs Actual Hash Comparison Component */}
        {activeViolation && (
          <div className="p-4 rounded-xl bg-graphite-900 border border-graphite-750 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-sky-300 font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Cryptographic Digest Comparison (Frame #{activeViolation.frame_id}):
              </span>
              <span className="text-[10px] text-rose-400 px-2 py-0.5 rounded bg-rose-950 border border-rose-900 uppercase">
                {activeViolation.violation_type}
              </span>
            </div>

            {renderHashDiff(activeViolation.expected, activeViolation.actual)}

            <p className="text-[11px] font-mono text-graphite-400">
              {activeViolation.message}
            </p>
          </div>
        )}

        {/* Tamper Attack Selection Form */}
        <div className="space-y-3">
          <label className="text-xs font-mono text-graphite-300 block">
            Select Tamper Attack Vector (Section 5.7):
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {tamperTypes.map((t) => {
              const Icon = t.icon;
              const isSelected = tamperType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTamperType(t.id)}
                  className={`text-left p-3 rounded-xl border text-xs font-mono transition-all ${
                    isSelected
                      ? 'bg-rose-950/40 border-rose-500 text-rose-200 shadow-cyber-danger'
                      : 'bg-graphite-900 border-graphite-750 text-graphite-400 hover:text-slate-200 hover:border-graphite-650'
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-rose-400' : 'text-graphite-400'}`} />
                    <span className={isSelected ? 'text-rose-300' : 'text-slate-200'}>{t.name}</span>
                  </div>
                  <p className="text-[10px] text-graphite-400 leading-relaxed">
                    {t.desc}
                  </p>
                  <div className="mt-2 text-[9px] text-sky-400/90 font-mono">
                    Flags: {t.expectedViolation}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Frame Input & Action Button */}
        <div className="p-3 rounded-xl bg-graphite-900 border border-graphite-750 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div>
              <label className="text-graphite-400 block text-[10px] mb-0.5">Target Frame ID (optional)</label>
              <input
                type="number"
                placeholder="Auto (Middle)"
                value={targetFrameId}
                onChange={(e) => setTargetFrameId(e.target.value)}
                className="w-32 bg-graphite-950 border border-graphite-700 rounded px-2.5 py-1 text-xs font-mono text-slate-200 placeholder-graphite-600 focus:outline-none focus:border-rose-500"
              />
            </div>

            {tamperType === 'reorder_records' && (
              <div>
                <label className="text-graphite-400 block text-[10px] mb-0.5">Swap With Frame ID</label>
                <input
                  type="number"
                  placeholder="Adjacent Frame"
                  value={swapFrameId}
                  onChange={(e) => setSwapFrameId(e.target.value)}
                  className="w-32 bg-graphite-950 border border-graphite-700 rounded px-2.5 py-1 text-xs font-mono text-slate-200 placeholder-graphite-600 focus:outline-none focus:border-rose-500"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleSimulate}
            disabled={isLoading || streamState.frames_captured === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-medium shadow-cyber-danger transition-all disabled:opacity-40"
          >
            <Skull className="w-3.5 h-3.5" />
            <span>Simulate Tampering (POST /api/tamper/simulate)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
