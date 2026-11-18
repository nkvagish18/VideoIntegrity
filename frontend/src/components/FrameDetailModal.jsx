import React, { useState } from 'react';
import { 
  X, 
  Hash, 
  Key, 
  Clock, 
  Copy, 
  Check, 
  ShieldCheck, 
  ShieldAlert, 
  FileText, 
  Image as ImageIcon,
  Binary
} from 'lucide-react';
import { canonicalJson } from '../services/mockBackend';

export function FrameDetailModal({ frame, onClose, isViolated = false, violation = null }) {
  const [copiedKey, setCopiedKey] = useState(null);

  if (!frame) return null;

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const canonicalPayload = canonicalJson(
    frame.frame_id,
    frame.timestamp,
    frame.frame_hash,
    frame.previous_hash
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-graphite-900 border border-graphite-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-graphite-850 border-b border-graphite-750 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isViolated ? 'bg-rose-500/20 text-rose-400' : 'bg-sky-500/10 text-sky-400'
            }`}>
              {isViolated ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                <span>Frame Block #{String(frame.frame_id).padStart(6, '0')}</span>
                {isViolated ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 uppercase font-mono">
                    Violation Detected
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 uppercase font-mono">
                    Verified Intact
                  </span>
                )}
              </h3>
              <p className="text-xs font-mono text-graphite-400">
                Sequence Index: {frame.sequence_index} | Stored Format: {frame.encoding || 'image/jpeg'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-graphite-400 hover:text-slate-200 hover:bg-graphite-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Violation Banner if Violated */}
          {isViolated && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-600/70 text-rose-200 text-xs font-mono space-y-1">
              <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>CRYPTOGRAPHIC VIOLATION: {violation?.violation_type || 'COMPROMISED'}</span>
              </div>
              <p className="text-rose-200/90">{violation?.message || 'Hash chain integrity mismatch detected.'}</p>
              {violation?.expected && (
                <div className="mt-2 pt-2 border-t border-rose-800/60 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-rose-400 block">Expected Digest:</span>
                    <span className="break-all font-mono text-slate-300">{violation.expected}</span>
                  </div>
                  <div>
                    <span className="text-rose-400 block">Actual Digest:</span>
                    <span className="break-all font-mono text-rose-300">{violation.actual}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Frame Preview Image & Meta */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 bg-graphite-950 border border-graphite-800 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
              {frame.image_base64 ? (
                <img
                  src={`data:image/jpeg;base64,${frame.image_base64}`}
                  alt={`Frame ${frame.frame_id}`}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center p-3 text-graphite-600 font-mono text-xs">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                  <span>Preview Not Cached</span>
                </div>
              )}
            </div>

            <div className="md:col-span-2 grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-graphite-850 border border-graphite-750">
                <span className="text-graphite-400 block text-[10px]">Frame ID</span>
                <span className="font-bold text-slate-200">#{frame.frame_id}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-graphite-850 border border-graphite-750">
                <span className="text-graphite-400 block text-[10px]">Sequence Index</span>
                <span className="font-bold text-slate-200">{frame.sequence_index}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-graphite-850 border border-graphite-750">
                <span className="text-graphite-400 block text-[10px]">Payload Size</span>
                <span className="font-bold text-slate-200">{frame.byte_size ? `${(frame.byte_size / 1024).toFixed(1)} KB` : 'N/A'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-graphite-850 border border-graphite-750">
                <span className="text-graphite-400 block text-[10px]">UTC Timestamp</span>
                <span className="font-semibold text-slate-200 truncate block" title={frame.timestamp}>
                  {frame.timestamp}
                </span>
              </div>
            </div>
          </div>

          {/* Hash Details */}
          <div className="space-y-3 font-mono text-xs">
            {/* Frame Hash */}
            <div className="p-3 rounded-xl bg-graphite-850 border border-graphite-750 space-y-1">
              <div className="flex items-center justify-between text-graphite-400 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-sky-400" />
                  SHA-256 Frame Hash: SHA256(JPEG bytes)
                </span>
                <button
                  onClick={() => copyToClipboard(frame.frame_hash, 'fh')}
                  className="hover:text-sky-300 flex items-center gap-1"
                >
                  {copiedKey === 'fh' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'fh' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-2 rounded bg-graphite-950 border border-graphite-800 text-sky-300 break-all select-all">
                {frame.frame_hash}
              </div>
            </div>

            {/* Previous Hash */}
            <div className="p-3 rounded-xl bg-graphite-850 border border-graphite-750 space-y-1">
              <div className="flex items-center justify-between text-graphite-400 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-sky-400" />
                  Previous Hash Pointer (Parent)
                </span>
                <button
                  onClick={() => copyToClipboard(frame.previous_hash, 'ph')}
                  className="hover:text-sky-300 flex items-center gap-1"
                >
                  {copiedKey === 'ph' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'ph' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-2 rounded bg-graphite-950 border border-graphite-800 text-graphite-300 break-all select-all">
                {frame.previous_hash}
              </div>
            </div>

            {/* Current Chain Hash */}
            <div className="p-3 rounded-xl bg-graphite-850 border border-sky-500/40 space-y-1">
              <div className="flex items-center justify-between text-sky-400 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  Current Chain Hash: SHA256(canonical_json)
                </span>
                <button
                  onClick={() => copyToClipboard(frame.chain_hash, 'ch')}
                  className="hover:text-sky-200 flex items-center gap-1"
                >
                  {copiedKey === 'ch' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'ch' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="p-2 rounded bg-graphite-950 border border-sky-950 text-emerald-400 break-all select-all">
                {frame.chain_hash}
              </div>
            </div>

            {/* Canonical JSON Payload */}
            <div className="p-3 rounded-xl bg-graphite-850 border border-graphite-750 space-y-1">
              <div className="flex items-center justify-between text-graphite-400 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  Canonical JSON Payload Serialized for Hash
                </span>
                <button
                  onClick={() => copyToClipboard(canonicalPayload, 'canon')}
                  className="hover:text-sky-300 flex items-center gap-1"
                >
                  {copiedKey === 'canon' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'canon' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="p-2 rounded bg-graphite-950 border border-graphite-800 text-[11px] text-slate-300 whitespace-pre-wrap break-all">
                {canonicalPayload}
              </pre>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-graphite-850 border-t border-graphite-750 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-graphite-800 hover:bg-graphite-750 border border-graphite-700 text-xs font-mono text-slate-200 transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
