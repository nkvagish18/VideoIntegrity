import React, { useState } from 'react';
import { 
  Play, 
  Square, 
  Video, 
  VideoOff, 
  Cpu, 
  Radio, 
  Sliders, 
  RefreshCw,
  Maximize2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

export function LiveVideoMonitoring({ 
  streamState, 
  latestFrame, 
  onStart, 
  onStop, 
  isLoading 
}) {
  const [source, setSource] = useState(streamState.source || 'synthetic');
  const [fps, setFps] = useState(streamState.fps || 2.0);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [resetExisting, setResetExisting] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const isRunning = streamState.status === 'RUNNING';

  const handleStart = () => {
    onStart({
      source,
      fps: Number(fps),
      device_index: Number(deviceIndex),
      reset_existing: resetExisting,
      jpeg_quality: 85,
    });
  };

  return (
    <div className="rounded-xl bg-graphite-850 border border-graphite-750 overflow-hidden shadow-xl flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-4 py-3 bg-graphite-900 border-b border-graphite-750 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-sky-400" />
          <h2 className="text-sm font-semibold font-mono tracking-wide text-slate-100 uppercase">
            Live Video Monitoring
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Frame Processing Indicator */}
          <div className="flex items-center gap-2 text-xs font-mono text-graphite-300">
            <span className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-sky-400 animate-ping' : 'bg-graphite-600'
            }`} />
            <span className="hidden sm:inline">Processing:</span>
            <span className={isRunning ? 'text-sky-300 font-semibold' : 'text-graphite-500'}>
              {isRunning ? 'ACTIVE HASHING' : 'IDLE'}
            </span>
          </div>

          <button
            onClick={() => setShowConfig(!showConfig)}
            disabled={isRunning}
            className={`p-1.5 rounded text-xs font-mono border transition-colors ${
              isRunning
                ? 'opacity-40 cursor-not-allowed border-graphite-700 text-graphite-500'
                : 'bg-graphite-800 border-graphite-700 text-graphite-300 hover:text-sky-300 hover:border-sky-500/40'
            }`}
            title="Stream Capture Parameters"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stream Config Drawer (When Idle) */}
      {showConfig && !isRunning && (
        <div className="p-3 bg-graphite-900/90 border-b border-graphite-750 text-xs font-mono grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in">
          <div>
            <label className="text-graphite-400 block mb-1">Source (StreamSource)</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-graphite-800 border border-graphite-700 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="synthetic">synthetic (Simulated HUD)</option>
              <option value="webcam">webcam (Local Camera)</option>
              <option value="file">file (Local Video File)</option>
            </select>
          </div>

          <div>
            <label className="text-graphite-400 block mb-1">Capture Rate: {fps} FPS</label>
            <input
              type="range"
              min="0.5"
              max="10.0"
              step="0.5"
              value={fps}
              onChange={(e) => setFps(parseFloat(e.target.value))}
              className="w-full accent-sky-400"
            />
          </div>

          <div className="flex items-center gap-2 pt-4">
            <label className="flex items-center gap-2 cursor-pointer text-graphite-300">
              <input
                type="checkbox"
                checked={resetExisting}
                onChange={(e) => setResetExisting(e.target.checked)}
                className="rounded accent-sky-500 bg-graphite-800"
              />
              <span>Reset chain on start</span>
            </label>
          </div>
        </div>
      )}

      {/* Live Video Preview Box */}
      <div className="relative flex-1 min-h-[300px] bg-graphite-950 flex items-center justify-center overflow-hidden border-b border-graphite-750 group">
        {/* Actual Video Frame or Standby HUD */}
        {latestFrame && latestFrame.image_base64 ? (
          <img
            src={`data:image/jpeg;base64,${latestFrame.image_base64}`}
            alt="Live Stream Feed"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center p-6 space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-graphite-900 border border-graphite-750 flex items-center justify-center text-graphite-500">
              <VideoOff className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-mono text-graphite-300 font-medium">
                Camera Feed Standby
              </p>
              <p className="text-xs font-mono text-graphite-500 max-w-sm">
                Press "Start Monitoring" below to begin video ingestion and deterministic SHA-256 chain construction.
              </p>
            </div>
          </div>
        )}

        {/* Cyber HUD Overlay */}
        <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
          {/* Top telemetry bar */}
          <div className="flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded font-semibold flex items-center gap-1.5 ${
                isRunning 
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40 backdrop-blur-sm animate-pulse'
                  : 'bg-graphite-900/80 text-graphite-400 border border-graphite-700'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-rose-500' : 'bg-graphite-500'}`} />
                {isRunning ? 'REC ● LIVE' : 'STANDBY'}
              </span>

              <span className="bg-graphite-900/80 text-graphite-300 px-2 py-0.5 rounded border border-graphite-700/60 backdrop-blur-sm">
                CAM: {streamState.source || source}
              </span>
            </div>

            {latestFrame && (
              <span className="bg-graphite-900/80 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30 backdrop-blur-sm">
                FRAME #{String(latestFrame.frame_id).padStart(5, '0')}
              </span>
            )}
          </div>

          {/* Bottom telemetry overlay */}
          {latestFrame && (
            <div className="flex flex-wrap items-center justify-between text-[10px] font-mono text-graphite-400 bg-graphite-900/70 backdrop-blur-sm px-2.5 py-1 rounded border border-graphite-700/50">
              <span>UTC: {latestFrame.timestamp}</span>
              <span>{(latestFrame.byte_size / 1024).toFixed(1)} KB JPEG</span>
            </div>
          )}
        </div>
      </div>

      {/* Control Action Buttons */}
      <div className="p-3 bg-graphite-900 flex items-center justify-between gap-3">
        {/* Camera Status Badge */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-graphite-400">Camera Status:</span>
          <span className={`font-semibold ${
            isRunning ? 'text-emerald-400' : 'text-graphite-400'
          }`}>
            {isRunning ? 'STREAMING ACTIVE' : 'STOPPED'}
          </span>
        </div>

        {/* Start / Stop Buttons */}
        <div className="flex items-center gap-2">
          {!isRunning ? (
            <button
              onClick={handleStart}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-mono font-medium shadow-cyber-sm transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Monitoring</span>
            </button>
          ) : (
            <button
              onClick={onStop}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-mono font-medium shadow-cyber-danger transition-all disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop Monitoring</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
