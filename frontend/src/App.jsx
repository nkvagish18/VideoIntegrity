import React from 'react';
import { Navbar } from './components/Navbar';
import { OverviewCards } from './components/OverviewCards';
import { LiveVideoMonitoring } from './components/LiveVideoMonitoring';
import { CryptographicInfo } from './components/CryptographicInfo';
import { HashChainExplorer } from './components/HashChainExplorer';
import { VerificationPanel } from './components/VerificationPanel';
import { TamperDemonstration } from './components/TamperDemonstration';
import { ActivityLogs } from './components/ActivityLogs';
import { MetricsCharts } from './components/MetricsCharts';
import { useVideoIntegrity } from './hooks/useVideoIntegrity';
import { AlertCircle, CheckCircle2, Shield } from 'lucide-react';

export default function App() {
  const {
    wsState,
    streamState,
    latestFrame,
    chainRecords,
    verificationReport,
    tamperAlert,
    dismissTamperAlert,
    activityLogs,
    clearLogs,
    performanceHistory,
    isLoading,
    errorMessage,
    clearError,
    startStream,
    stopStream,
    verifyChain,
    simulateTamper,
    resetTamper,
  } = useVideoIntegrity();

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col font-sans selection:bg-sky-500/30 selection:text-sky-200">
      {/* Top Navbar */}
      <Navbar
        streamState={streamState}
        wsState={wsState}
        onResetAll={() => resetTamper(true)}
      />

      {/* Main Dashboard Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/80 text-rose-200 text-xs font-mono flex items-center justify-between shadow-cyber-danger animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-200 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* SECTION 1: OVERVIEW */}
        <section aria-label="Overview Metrics">
          <OverviewCards
            streamState={streamState}
            verificationReport={verificationReport}
          />
        </section>

        {/* SECTIONS 2 & 3: LIVE VIDEO MONITORING & CRYPTOGRAPHIC INFORMATION */}
        <section aria-label="Monitoring and Cryptography" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section 2: Live Video Monitoring */}
          <div className="lg:col-span-7 flex flex-col">
            <LiveVideoMonitoring
              streamState={streamState}
              latestFrame={latestFrame}
              onStart={startStream}
              onStop={stopStream}
              isLoading={isLoading}
            />
          </div>

          {/* Section 3: Cryptographic Information */}
          <div className="lg:col-span-5 flex flex-col">
            <CryptographicInfo
              latestFrame={latestFrame}
              streamState={streamState}
            />
          </div>
        </section>

        {/* SECTION 4: HASH CHAIN EXPLORER */}
        <section aria-label="Hash Chain Explorer">
          <HashChainExplorer
            chainRecords={chainRecords}
            verificationReport={verificationReport}
          />
        </section>

        {/* SECTIONS 5 & 6: VERIFICATION PANEL & TAMPER DEMONSTRATION */}
        <section aria-label="Verification and Tamper Demonstration" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section 5: Verification Panel */}
          <div className="lg:col-span-6 flex flex-col">
            <VerificationPanel
              verificationReport={verificationReport}
              onVerify={verifyChain}
              isLoading={isLoading}
            />
          </div>

          {/* Section 6: Tamper Demonstration */}
          <div className="lg:col-span-6 flex flex-col">
            <TamperDemonstration
              streamState={streamState}
              tamperAlert={tamperAlert}
              dismissTamperAlert={dismissTamperAlert}
              onSimulateTamper={simulateTamper}
              onResetDemonstration={resetTamper}
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* SECTIONS 7 & TELEMETRY CHARTS: ACTIVITY LOGS & METRICS */}
        <section aria-label="Activity Logs and Telemetry" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Section 7: Activity Logs */}
          <div className="lg:col-span-7 flex flex-col">
            <ActivityLogs
              activityLogs={activityLogs}
              onClearLogs={clearLogs}
            />
          </div>

          {/* Telemetry Charts (Recharts) */}
          <div className="lg:col-span-5 flex flex-col">
            <MetricsCharts
              performanceHistory={performanceHistory}
            />
          </div>
        </section>
      </main>

      {/* Cyber Graphite Footer */}
      <footer className="mt-8 border-t border-graphite-800 bg-graphite-900/60 px-4 py-4 text-center text-xs font-mono text-graphite-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-graphite-400">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <span>VideoIntegrity Surveillance System — Frozen Contract v1.0.0</span>
          </div>
          <div>
            Pure Deterministic SHA-256 Hash Chaining • Laptop 1 Backend Ready
          </div>
        </div>
      </footer>
    </div>
  );
}
