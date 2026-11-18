import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';
import { BarChart3, Activity, Cpu } from 'lucide-react';

export function MetricsCharts({ performanceHistory = [] }) {
  // If history is small, provide default points based on current performance
  const data = performanceHistory.length > 0 
    ? performanceHistory 
    : [
        { frame_id: 1, byte_size: 24100, timestamp: '10:00:00' },
        { frame_id: 2, byte_size: 24350, timestamp: '10:00:01' },
        { frame_id: 3, byte_size: 24200, timestamp: '10:00:02' },
        { frame_id: 4, byte_size: 24450, timestamp: '10:00:03' },
        { frame_id: 5, byte_size: 24300, timestamp: '10:00:04' },
      ];

  const formattedData = data.map(d => ({
    ...d,
    kb_size: Number((d.byte_size / 1024).toFixed(2)),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-graphite-900 border border-graphite-700 p-2.5 rounded-lg shadow-xl text-xs font-mono">
          <p className="text-sky-300 font-bold">Frame #{payload[0].payload.frame_id}</p>
          <p className="text-graphite-400">Time: {payload[0].payload.timestamp}</p>
          <p className="text-emerald-400 font-semibold">
            Payload: {payload[0].value} KB ({payload[0].payload.byte_size.toLocaleString()} bytes)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-xl bg-graphite-850 border border-graphite-750 overflow-hidden shadow-xl p-4 flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-graphite-750 mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Frame Ingestion & Cryptographic Throughput
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-graphite-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            JPEG Size (KB)
          </span>
        </div>
      </div>

      <div className="flex-1 w-full min-h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="cyberSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2b42" vertical={false} />
            <XAxis 
              dataKey="timestamp" 
              stroke="#7088b0" 
              fontSize={10} 
              tickLine={false}
              fontFamily="JetBrains Mono"
            />
            <YAxis 
              stroke="#7088b0" 
              fontSize={10} 
              tickLine={false}
              domain={['auto', 'auto']}
              unit=" KB"
              fontFamily="JetBrains Mono"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="kb_size" 
              stroke="#38bdf8" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#cyberSky)" 
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
