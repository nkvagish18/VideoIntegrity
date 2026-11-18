import React, { useState } from 'react';
import { 
  Key, 
  Hash, 
  Clock, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  Code, 
  HelpCircle,
  Binary,
  Layers
} from 'lucide-react';

export function CryptographicInfo({ latestFrame, streamState }) {
  const [copiedKey, setCopiedKey] = useState(null);
  const [showFormula, setShowFormula] = useState(false);

  const copyToClipboard = (text, keyName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const frameId = latestFrame?.frame_id ?? streamState.latest_frame_id ?? null;
  const timestamp = latestFrame?.timestamp ?? streamState.started_at ?? '—';
  const frameHash = latestFrame?.frame_hash ?? '—';
  const previousHash = latestFrame?.previous_hash ?? '—';
  const currentChainHash = latestFrame?.chain_hash ?? streamState.latest_chain_hash ?? '—';

  const isGenesis = previousHash === '0000000000000000000000000000000000000000000000000000000000000000';

  return (
    <div className="rounded-xl bg-graphite-850 border border-graphite-750 overflow-hidden shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 bg-graphite-900 border-b border-graphite-750 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Cryptographic Information
          </h2>
        </div>
        <button
          onClick={() => setShowFormula(!showFormula)}
          className="text-xs font-mono text-graphite-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
        >
          <Code className="w-3.5 h-3.5" />
          <span>Formula</span>
        </button>
      </div>

      {/* Formula Explainer Drawer */}
      {showFormula && (
        <div className="p-3 bg-graphite-900/90 border-b border-graphite-750 text-xs font-mono space-y-2 text-graphite-300 animate-in fade-in">
          <p className="text-sky-300 font-semibold">
            Pure Deterministic SHA-256 Hash Chaining (docs/API_CONTRACT.md):
          </p>
          <div className="p-2 rounded bg-graphite-950 border border-graphite-800 text-[11px] text-slate-300 font-mono space-y-1">
            <div>1. <span className="text-sky-400">frame_hash</span> = SHA256(encoded_jpeg_bytes)</div>
            <div>2. <span className="text-sky-400">chain_hash</span> = SHA256(canonical_json({`{`}</div>
            <div className="pl-4 text-graphite-400">"frame_hash": frame_hash,</div>
            <div className="pl-4 text-graphite-400">"frame_id": frame_id,</div>
            <div className="pl-4 text-graphite-400">"previous_hash": previous_hash,</div>
            <div className="pl-4 text-graphite-400">"timestamp": timestamp</div>
            <div>{`})`}</div>
          </div>
          <p className="text-[10px] text-graphite-400">
            *Keys sorted lexicographically with zero whitespace. No blockchain, ML, or distributed ledger.
          </p>
        </div>
      )}

      {/* Cryptographic Ledger Fields */}
      <div className="p-4 space-y-3.5 flex-1">
        {/* Frame ID & Timestamp Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Latest Frame ID */}
          <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750/70">
            <div className="flex items-center gap-1.5 text-xs font-mono text-graphite-400 mb-1">
              <Binary className="w-3.5 h-3.5 text-sky-400" />
              <span>Latest Frame ID</span>
            </div>
            <div className="text-base font-bold font-mono text-slate-100">
              {frameId ? `#${String(frameId).padStart(6, '0')}` : 'NO FRAMES'}
            </div>
          </div>

          {/* Frame Timestamp */}
          <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750/70">
            <div className="flex items-center gap-1.5 text-xs font-mono text-graphite-400 mb-1">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Frame Timestamp (UTC)</span>
            </div>
            <div className="text-xs font-semibold font-mono text-slate-200 truncate" title={timestamp}>
              {timestamp}
            </div>
          </div>
        </div>

        {/* SHA-256 Frame Hash */}
        <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750/70 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-graphite-400">
              <Hash className="w-3.5 h-3.5 text-sky-400" />
              <span>SHA-256 Frame Hash</span>
            </div>
            {frameHash !== '—' && (
              <button
                onClick={() => copyToClipboard(frameHash, 'frame')}
                className="text-[10px] text-graphite-400 hover:text-sky-300 flex items-center gap-1"
                title="Copy full 64-char hex digest"
              >
                {copiedKey === 'frame' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'frame' ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
          <div className="font-mono text-xs text-sky-300 bg-graphite-950 p-2 rounded border border-graphite-800 break-all select-all">
            {frameHash}
          </div>
          <div className="text-[10px] font-mono text-graphite-500">
            Digest of raw encoded JPEG payload (SHA-256)
          </div>
        </div>

        {/* Previous Chain Hash */}
        <div className="p-3 rounded-lg bg-graphite-900 border border-graphite-750/70 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-graphite-400">
              <LinkIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>Previous Chain Hash</span>
              {isGenesis && (
                <span className="text-[9px] px-1 rounded bg-sky-950 text-sky-300 border border-sky-800">
                  GENESIS
                </span>
              )}
            </div>
            {previousHash !== '—' && (
              <button
                onClick={() => copyToClipboard(previousHash, 'prev')}
                className="text-[10px] text-graphite-400 hover:text-sky-300 flex items-center gap-1"
                title="Copy previous chain hash"
              >
                {copiedKey === 'prev' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'prev' ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
          <div className="font-mono text-xs text-graphite-300 bg-graphite-950 p-2 rounded border border-graphite-800 break-all select-all">
            {previousHash}
          </div>
          <div className="text-[10px] font-mono text-graphite-500">
            {isGenesis ? 'Fixed 64-character zero genesis pointer' : 'Cryptographic link to prior block'}
          </div>
        </div>

        {/* Current Chain Hash */}
        <div className="p-3 rounded-lg bg-graphite-900 border border-sky-500/30 shadow-cyber-sm space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
              <Key className="w-3.5 h-3.5 text-sky-400" />
              <span>Current Chain Hash (Head)</span>
            </div>
            {currentChainHash !== '—' && (
              <button
                onClick={() => copyToClipboard(currentChainHash, 'chain')}
                className="text-[10px] text-sky-300 hover:text-sky-200 flex items-center gap-1"
                title="Copy current chain head"
              >
                {copiedKey === 'chain' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey === 'chain' ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
          <div className="font-mono text-xs text-emerald-300 bg-graphite-950 p-2 rounded border border-emerald-950 break-all select-all font-medium">
            {currentChainHash}
          </div>
          <div className="text-[10px] font-mono text-graphite-400">
            SHA256(canonical_json(frame_hash, frame_id, previous_hash, timestamp))
          </div>
        </div>
      </div>
    </div>
  );
}
