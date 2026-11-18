import React, { useState } from 'react';
import { 
  Terminal, 
  Trash2, 
  Download, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight,
  Film,
  Hash,
  Link2,
  ShieldCheck,
  AlertOctagon,
  Radio
} from 'lucide-react';

export function ActivityLogs({ activityLogs, onClearLogs }) {
  const [filterType, setFilterType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogId, setExpandedLogId] = useState(null);

  const categories = [
    { id: 'ALL', label: 'All Logs' },
    { id: 'FRAME_CAPTURED', label: 'Frame Captured' },
    { id: 'HASH_GENERATED', label: 'Hash Generated' },
    { id: 'CHAIN_EXTENDED', label: 'Chain Extended' },
    { id: 'VERIFICATION', label: 'Verification' },
    { id: 'TAMPER_DETECTED', label: 'Tamper Detected' },
  ];

  const filteredLogs = activityLogs.filter(log => {
    if (filterType !== 'ALL' && log.type !== filterType) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(term);
      const matchType = log.type.toLowerCase().includes(term);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(term) : false;
      return matchMsg || matchType || matchDetails;
    }
    return true;
  });

  const getLogBadge = (type) => {
    switch (type) {
      case 'FRAME_CAPTURED':
        return {
          icon: Film,
          bg: 'bg-sky-950/60 text-sky-400 border-sky-800/60',
          label: 'FRAME',
        };
      case 'HASH_GENERATED':
        return {
          icon: Hash,
          bg: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/60',
          label: 'HASH',
        };
      case 'CHAIN_EXTENDED':
        return {
          icon: Link2,
          bg: 'bg-indigo-950/60 text-indigo-400 border-indigo-800/60',
          label: 'CHAIN',
        };
      case 'VERIFICATION':
        return {
          icon: ShieldCheck,
          bg: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
          label: 'VERIFY',
        };
      case 'TAMPER_DETECTED':
        return {
          icon: AlertOctagon,
          bg: 'bg-rose-950/80 text-rose-300 border-rose-800',
          label: 'ALERT',
        };
      default:
        return {
          icon: Radio,
          bg: 'bg-graphite-800 text-graphite-300 border-graphite-700',
          label: 'SYSTEM',
        };
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activityLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `videointegrity-audit-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="rounded-xl bg-graphite-850 border border-graphite-750 overflow-hidden shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 bg-graphite-900 border-b border-graphite-750 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Real-Time Activity & Forensic Logs
          </h2>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-graphite-800 text-graphite-300 border border-graphite-700">
            {activityLogs.length} Events
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJson}
            disabled={activityLogs.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-graphite-800 hover:bg-graphite-750 border border-graphite-750 text-xs font-mono text-graphite-300 hover:text-sky-300 transition-colors disabled:opacity-40"
            title="Export forensic audit trail as JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export JSON</span>
          </button>

          <button
            onClick={onClearLogs}
            disabled={activityLogs.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-graphite-800 hover:bg-graphite-750 border border-graphite-750 text-xs font-mono text-graphite-400 hover:text-rose-400 transition-colors disabled:opacity-40"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="px-4 py-2.5 bg-graphite-900/60 border-b border-graphite-750 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-1">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterType(c.id)}
              className={`px-2.5 py-1 rounded transition-colors ${
                filterType === c.id
                  ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30'
                  : 'text-graphite-400 hover:text-slate-200 hover:bg-graphite-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-graphite-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1 bg-graphite-950 border border-graphite-700 rounded text-xs font-mono text-slate-200 placeholder-graphite-600 focus:outline-none focus:border-sky-500 w-44"
          />
        </div>
      </div>

      {/* Log Entries Stream */}
      <div className="p-3 space-y-1.5 flex-1 overflow-y-auto max-h-96">
        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center text-xs font-mono text-graphite-500">
            No activity log entries match the current filter.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const badge = getLogBadge(log.type);
            const Icon = badge.icon;
            const isExpanded = expandedLogId === log.id;

            return (
              <div
                key={log.id}
                className="rounded-lg bg-graphite-900 border border-graphite-750/70 p-2 text-xs font-mono transition-colors hover:border-graphite-650"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 uppercase ${badge.bg}`}>
                      <Icon className="w-3 h-3" />
                      {badge.label}
                    </span>
                    <span className="text-[11px] text-graphite-400">
                      {log.timestamp.split('T')[1].slice(0, 12)}
                    </span>
                  </div>

                  {log.details && (
                    <button
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="text-[10px] text-graphite-400 hover:text-sky-300 flex items-center gap-0.5"
                    >
                      <span>{isExpanded ? 'Hide' : 'Details'}</span>
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  )}
                </div>

                <div className="mt-1 text-slate-200 text-xs">
                  {log.message}
                </div>

                {isExpanded && log.details && (
                  <pre className="mt-2 p-2 rounded bg-graphite-950 border border-graphite-800 text-[10px] text-sky-200/90 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
