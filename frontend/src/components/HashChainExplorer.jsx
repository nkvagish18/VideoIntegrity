import React, { useState } from 'react';
import { 
  Link2, 
  ShieldCheck, 
  ShieldAlert, 
  ChevronRight, 
  ArrowRight, 
  ExternalLink,
  Layers,
  Filter,
  Search,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { FrameDetailModal } from './FrameDetailModal';

export function HashChainExplorer({ chainRecords, verificationReport }) {
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'VERIFIED' | 'TAMPERED'
  const [searchTerm, setSearchTerm] = useState('');

  // Map compromised frame IDs
  const violationMap = new Map();
  if (verificationReport && verificationReport.violations) {
    verificationReport.violations.forEach(v => {
      violationMap.set(v.frame_id, v);
    });
  }

  // Filter records
  const filteredRecords = chainRecords.filter(rec => {
    const isViolated = violationMap.has(rec.frame_id);
    if (filterMode === 'VERIFIED' && isViolated) return false;
    if (filterMode === 'TAMPERED' && !isViolated) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchId = String(rec.frame_id).includes(term);
      const matchHash = rec.chain_hash?.toLowerCase().includes(term) || rec.frame_hash?.toLowerCase().includes(term);
      return matchId || matchHash;
    }
    return true;
  });

  return (
    <div className="rounded-xl bg-graphite-850 border border-graphite-750 overflow-hidden shadow-xl flex flex-col">
      {/* Explorer Header */}
      <div className="px-4 py-3 bg-graphite-900 border-b border-graphite-750 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Hash Chain Explorer
          </h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-graphite-800 text-sky-300 border border-graphite-700">
            {chainRecords.length} Blocks
          </span>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-graphite-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search frame # or hash..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 bg-graphite-950 border border-graphite-700 rounded text-xs font-mono text-slate-200 placeholder-graphite-500 focus:outline-none focus:border-sky-500 w-44"
            />
          </div>

          <div className="flex rounded bg-graphite-950 border border-graphite-700 p-0.5 text-xs font-mono">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterMode === 'ALL' ? 'bg-sky-500/20 text-sky-300 font-semibold' : 'text-graphite-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterMode('VERIFIED')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterMode === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-graphite-400 hover:text-slate-200'
              }`}
            >
              Verified
            </button>
            <button
              onClick={() => setFilterMode('TAMPERED')}
              className={`px-2 py-0.5 rounded transition-colors ${
                filterMode === 'TAMPERED' ? 'bg-rose-500/20 text-rose-300 font-semibold' : 'text-graphite-400 hover:text-slate-200'
              }`}
            >
              Tampered
            </button>
          </div>
        </div>
      </div>

      {/* Connected Chain Visualizer Track (Horizontal Scrollable) */}
      <div className="p-4 border-b border-graphite-750 bg-graphite-900/60 overflow-x-auto">
        <div className="text-xs font-mono text-graphite-400 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            Connected Hash Chain Nodes (Click block to inspect cryptographic payload):
          </span>
          <span className="text-[11px] text-graphite-400">
            ← Genesis (Frame #1) ... Latest Head →
          </span>
        </div>

        {chainRecords.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-graphite-500">
            No frames stored in chain yet. Start stream to begin mining cryptographic blocks.
          </div>
        ) : (
          <div className="flex items-center gap-2 py-2 min-w-max">
            {chainRecords.map((rec, index) => {
              const isViolated = violationMap.has(rec.frame_id);
              const prevRec = index > 0 ? chainRecords[index - 1] : null;
              const linkBroken = prevRec && rec.previous_hash !== prevRec.chain_hash;

              return (
                <React.Fragment key={`${rec.sequence_index}-${rec.frame_id}`}>
                  {/* Cryptographic Link Connector */}
                  {index > 0 && (
                    <div className="flex items-center px-0.5">
                      <div className={`h-0.5 w-6 transition-all ${
                        linkBroken 
                          ? 'bg-rose-500 shadow-cyber-danger animate-pulse' 
                          : 'bg-emerald-500/60 shadow-cyber-success'
                      }`} />
                      <ArrowRight className={`w-3 h-3 -ml-1 ${
                        linkBroken ? 'text-rose-400' : 'text-emerald-400/80'
                      }`} />
                    </div>
                  )}

                  {/* Chain Node Block */}
                  <button
                    onClick={() => setSelectedFrame(rec)}
                    className={`relative text-left p-2.5 rounded-xl border transition-all duration-200 flex flex-col justify-between w-40 hover:-translate-y-0.5 hover:shadow-lg ${
                      isViolated || linkBroken
                        ? 'bg-rose-950/40 border-rose-500/80 hover:border-rose-400 shadow-cyber-danger'
                        : 'bg-graphite-800 border-graphite-700 hover:border-sky-500/60 hover:shadow-cyber-sm'
                    }`}
                  >
                    {/* Node Header */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold font-mono text-slate-200">
                        #{String(rec.frame_id).padStart(4, '0')}
                      </span>
                      {isViolated || linkBroken ? (
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </div>

                    {/* Hashes Preview */}
                    <div className="space-y-1 font-mono text-[9px]">
                      <div className="truncate text-graphite-400">
                        P: {rec.previous_hash ? rec.previous_hash.slice(0, 10) : '00000000'}...
                      </div>
                      <div className={`truncate font-semibold ${
                        isViolated ? 'text-rose-300' : 'text-sky-300'
                      }`}>
                        C: {rec.chain_hash ? rec.chain_hash.slice(0, 10) : '—'}...
                      </div>
                    </div>

                    {/* Timestamp footer */}
                    <div className="mt-2 text-[9px] font-mono text-graphite-400 border-t border-graphite-700/60 pt-1 flex items-center justify-between">
                      <span>{rec.timestamp ? rec.timestamp.split('T')[1].slice(0, 8) : ''}</span>
                      <span className="text-[8px] text-sky-400/80">INSPECT ↗</span>
                    </div>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Sequential Frame Records Table */}
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead className="bg-graphite-900 sticky top-0 z-10 text-graphite-400 uppercase text-[11px] border-b border-graphite-750">
            <tr>
              <th className="py-2.5 px-3">Frame ID</th>
              <th className="py-2.5 px-3">Timestamp (UTC)</th>
              <th className="py-2.5 px-3">Frame Hash</th>
              <th className="py-2.5 px-3">Previous Hash</th>
              <th className="py-2.5 px-3">Current Chain Hash</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-800">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="7" className="py-8 text-center text-graphite-500 font-mono text-xs">
                  No records match current filter criteria.
                </td>
              </tr>
            ) : (
              filteredRecords.map((rec) => {
                const isViolated = violationMap.has(rec.frame_id);
                return (
                  <tr 
                    key={`${rec.sequence_index}-${rec.frame_id}`}
                    onClick={() => setSelectedFrame(rec)}
                    className={`cursor-pointer transition-colors ${
                      isViolated 
                        ? 'bg-rose-950/20 hover:bg-rose-950/30' 
                        : 'hover:bg-graphite-800/60'
                    }`}
                  >
                    <td className="py-2 px-3 font-bold text-slate-200">
                      #{String(rec.frame_id).padStart(5, '0')}
                    </td>
                    <td className="py-2 px-3 text-graphite-300 truncate max-w-[140px]">
                      {rec.timestamp}
                    </td>
                    <td className="py-2 px-3 text-sky-300 font-mono text-[11px] truncate max-w-[130px]">
                      {rec.frame_hash}
                    </td>
                    <td className="py-2 px-3 text-graphite-400 font-mono text-[11px] truncate max-w-[130px]">
                      {rec.previous_hash}
                    </td>
                    <td className="py-2 px-3 text-emerald-300 font-mono text-[11px] truncate max-w-[130px]">
                      {rec.chain_hash}
                    </td>
                    <td className="py-2 px-3">
                      {isViolated ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                          COMPROMISED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                          <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                          VERIFIED
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center justify-end gap-1 font-mono">
                        Inspect
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Frame Inspection Modal */}
      {selectedFrame && (
        <FrameDetailModal
          frame={selectedFrame}
          onClose={() => setSelectedFrame(null)}
          isViolated={violationMap.has(selectedFrame.frame_id)}
          violation={violationMap.get(selectedFrame.frame_id)}
        />
      )}
    </div>
  );
}
