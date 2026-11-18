import React, { useState } from 'react';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  CheckCircle, 
  AlertTriangle, 
  Clock, 
  Layers, 
  RotateCw,
  AlertOctagon,
  FileCheck
} from 'lucide-react';

export function VerificationPanel({ 
  verificationReport, 
  onVerify, 
  isLoading 
}) {
  const [isScanning, setIsScanning] = useState(false);

  const handleVerifyClick = async () => {
    setIsScanning(true);
    try {
      await onVerify();
    } finally {
      setTimeout(() => setIsScanning(false), 300);
    }
  };

  const status = verificationReport?.status || 'NOT RUN';
  const isValid = verificationReport?.is_valid;
  const isIntact = status === 'INTACT';
  const isCompromised = status === 'COMPROMISED';
  const isEmpty = status === 'EMPTY';

  return (
    <div className="rounded-xl bg-graphite-850 border border-graphite-750 overflow-hidden shadow-xl flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-4 py-3 bg-graphite-900 border-b border-graphite-750 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Cryptographic Verification Panel
          </h2>
        </div>

        {/* Verify Chain Action Button */}
        <button
          onClick={handleVerifyClick}
          disabled={isLoading || isScanning}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-mono font-medium border transition-all ${
            isScanning
              ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 cursor-wait'
              : 'bg-sky-600 hover:bg-sky-500 text-white border-transparent shadow-cyber-sm'
          }`}
        >
          <RotateCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          <span>{isScanning ? 'Scanning Chain...' : 'Verify Chain (POST /api/verify)'}</span>
        </button>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-y-auto">
        {/* Verification Result Summary Card */}
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${
          isIntact 
            ? 'bg-emerald-950/30 border-emerald-500/40 shadow-cyber-success' 
            : isCompromised 
            ? 'bg-rose-950/40 border-rose-500/60 shadow-cyber-danger' 
            : 'bg-graphite-900 border-graphite-750'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-xl ${
              isIntact 
                ? 'bg-emerald-500/20 text-emerald-400' 
                : isCompromised 
                ? 'bg-rose-500/20 text-rose-400' 
                : 'bg-graphite-800 text-graphite-400'
            }`}>
              {isIntact ? (
                <ShieldCheck className="w-8 h-8" />
              ) : isCompromised ? (
                <ShieldAlert className="w-8 h-8 animate-pulse" />
              ) : (
                <Clock className="w-8 h-8" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-graphite-400 uppercase tracking-wider">
                  Verification Result
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  isIntact 
                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700' 
                    : isCompromised 
                    ? 'bg-rose-900/80 text-rose-300 border border-rose-600 animate-pulse' 
                    : 'bg-graphite-800 text-graphite-400'
                }`}>
                  {status}
                </span>
              </div>

              <div className="text-base font-bold font-mono text-slate-100 mt-0.5">
                {isIntact 
                  ? 'All Frame & Chain Hashes Verified 100% Intact' 
                  : isCompromised 
                  ? 'Integrity Failure Detected in Hash Chain!' 
                  : isEmpty
                  ? 'Chain is Empty — No Blocks to Verify'
                  : 'Chain Has Not Been Formally Scanned Yet'}
              </div>

              <div className="text-xs font-mono text-graphite-400 mt-1">
                {verificationReport?.verified_at ? `Last run: ${verificationReport.verified_at}` : 'Ready for cryptographic check'}
              </div>
            </div>
          </div>

          {/* First Invalid Frame Highlight */}
          {isCompromised && verificationReport?.first_compromised_frame_id && (
            <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-600/80 text-center sm:text-right">
              <span className="text-[10px] font-mono text-rose-300 uppercase block font-semibold">
                First Invalid Frame
              </span>
              <span className="text-xl font-bold font-mono text-rose-200">
                Frame #{String(verificationReport.first_compromised_frame_id).padStart(5, '0')}
              </span>
            </div>
          )}
        </div>

        {/* Verification Report Metrics Grid */}
        {verificationReport && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750">
              <span className="text-graphite-400 block text-[10px]">Total Records Verified</span>
              <span className="text-base font-bold text-slate-200">
                {verificationReport.total_records}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750">
              <span className="text-graphite-400 block text-[10px]">Valid Intact Records</span>
              <span className="text-base font-bold text-emerald-400">
                {verificationReport.valid_records}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750">
              <span className="text-graphite-400 block text-[10px]">Compromised Records</span>
              <span className={`text-base font-bold ${
                verificationReport.compromised_records > 0 ? 'text-rose-400' : 'text-slate-200'
              }`}>
                {verificationReport.compromised_records}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750">
              <span className="text-graphite-400 block text-[10px]">Scan Execution Time</span>
              <span className="text-base font-bold text-sky-400">
                {verificationReport.duration_ms} ms
              </span>
            </div>
          </div>
        )}

        {/* Violations List (If any) */}
        {isCompromised && verificationReport?.violations && verificationReport.violations.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-mono font-semibold text-rose-300 flex items-center gap-1.5">
              <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
              <span>Detected Cryptographic Violations ({verificationReport.violations.length}):</span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {verificationReport.violations.map((v, i) => (
                <div 
                  key={i}
                  className="p-3 rounded-lg bg-graphite-900 border border-rose-500/40 text-xs font-mono space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-rose-300">
                      #{i + 1} {v.violation_type} (Frame #{v.frame_id}, Seq {v.sequence_index})
                    </span>
                  </div>

                  <p className="text-slate-300 text-[11px]">
                    {v.message}
                  </p>

                  {/* Expected vs Actual Hashes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] bg-graphite-950 p-2 rounded border border-graphite-800">
                    <div>
                      <span className="text-graphite-400 block">Expected:</span>
                      <span className="text-emerald-400 break-all select-all font-mono">
                        {v.expected || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-graphite-400 block">Observed / Actual:</span>
                      <span className="text-rose-400 break-all select-all font-mono font-medium">
                        {v.actual || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
