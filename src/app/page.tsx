"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { PhysicsScene } from "../components/PhysicsScene";
import { VideoTracker } from "../components/VideoTracker";
import {
  GRAVITY_PRESETS,
  usePhysicsStore,
} from "../stores/usePhysicsStore";

type ViewMode = "video" | "scene";

const sliderTheme = "h-2 w-full cursor-pointer appearance-none rounded-full bg-white/30 accent-[#86efac]";

export default function Page() {
  const [viewMode, setViewMode] = useState<ViewMode>("video");
  const [isLiveSyncEnabled, setIsLiveSyncEnabled] = useState(true);
  const autoRunTimeoutRef = useRef<any>(null);
  const previousWorldSettingsRef = useRef<string | null>(null);
  const pendingAutoRunRef = useRef(false);

  const motionProfile = usePhysicsStore((state) => state.motionProfile);
  const isProcessing = usePhysicsStore((state) => state.isProcessing);
  const errorMessage = usePhysicsStore((state) => state.errorMessage);
  const inferredStats = usePhysicsStore((state) => state.inferredStats);
  const calibration = usePhysicsStore((state) => state.calibration);
  const gravityPreset = usePhysicsStore((state) => state.gravityPreset);
  const isVacuumMode = usePhysicsStore((state) => state.isVacuumMode);
  const worldSettings = usePhysicsStore((state) => state.worldSettings);
  const updateWorldParam = usePhysicsStore((state) => state.updateWorldParam);
  const applyGravityPreset = usePhysicsStore((state) => state.applyGravityPreset);
  const toggleVacuumMode = usePhysicsStore((state) => state.toggleVacuumMode);
  const clearError = usePhysicsStore((state) => state.clearError);
  const exportData = usePhysicsStore((state) => state.exportData);
  const runSimulation = usePhysicsStore((state) => state.runSimulation);

  useEffect(() => {
    return () => {
      if (autoRunTimeoutRef.current) {
        window.clearTimeout(autoRunTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const serializedSettings = JSON.stringify(worldSettings);
    const previousSettings = previousWorldSettingsRef.current;
    previousWorldSettingsRef.current = serializedSettings;

    if (previousSettings === null || previousSettings === serializedSettings) {
      return;
    }

    if (!isLiveSyncEnabled || !motionProfile || motionProfile.frames.length < 2) {
      return;
    }

    if (autoRunTimeoutRef.current) {
      window.clearTimeout(autoRunTimeoutRef.current);
    }

    if (isProcessing) {
      pendingAutoRunRef.current = true;
      return;
    }

    autoRunTimeoutRef.current = window.setTimeout(() => {
      pendingAutoRunRef.current = false;
      void runSimulation().catch(() => {
        return undefined;
      });
    }, 1000);
  }, [isLiveSyncEnabled, isProcessing, motionProfile, runSimulation, worldSettings]);

  useEffect(() => {
    if (
      !isLiveSyncEnabled ||
      isProcessing ||
      !pendingAutoRunRef.current ||
      !motionProfile ||
      motionProfile.frames.length < 2
    ) {
      return;
    }

    if (autoRunTimeoutRef.current) {
      window.clearTimeout(autoRunTimeoutRef.current);
    }

    autoRunTimeoutRef.current = window.setTimeout(() => {
      pendingAutoRunRef.current = false;
      void runSimulation().catch(() => {
        return undefined;
      });
    }, 1000);
  }, [isLiveSyncEnabled, isProcessing, motionProfile, runSimulation]);

  return (
    <main className="min-h-screen bg-[#f5f5f4] px-5 py-6 text-[#1c1917] md:px-8 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1600px] flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.45fr)_24rem]">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-[#1c1917]/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(245,245,244,0.92)),radial-gradient(circle_at_top_left,rgba(134,239,172,0.24),transparent_36%)] p-5 shadow-[0_40px_120px_rgba(28,25,23,0.12)] md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#1c1917]/45">Newton’s Eye</p>
              <h1 className="font-serif text-4xl text-[#1c1917] md:text-5xl">Observed motion, cultivated into simulation</h1>
            </div>
            <div className="inline-flex rounded-full border border-[#1c1917]/10 bg-white/55 p-1 backdrop-blur-xl">
              {(["video", "scene"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`relative rounded-full px-4 py-2 text-sm font-medium transition ${
                    viewMode === mode ? "text-[#1c1917]" : "text-[#1c1917]/55"
                  }`}
                >
                  {viewMode === mode ? (
                    <motion.span
                      layoutId="view-tab"
                      className="absolute inset-0 rounded-full bg-[#86efac]"
                      transition={{ type: "spring", stiffness: 280, damping: 26 }}
                    />
                  ) : null}
                  <span className="relative z-10">{mode === "video" ? "Video Tracker" : "3D Physics Scene"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative min-h-[42rem]">
            <AnimatePresence mode="wait">
              <motion.div
                key={viewMode}
                initial={{ opacity: 0, y: 18, filter: "blur(12px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -12, filter: "blur(10px)" }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="h-full"
              >
                {viewMode === "video" ? <VideoTracker /> : <PhysicsScene />}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        <aside className="rounded-[2.5rem] border border-white/30 bg-[linear-gradient(180deg,rgba(28,25,23,0.82),rgba(28,25,23,0.72))] p-5 text-[#f5f5f4] shadow-[0_40px_120px_rgba(28,25,23,0.18)] backdrop-blur-2xl md:p-6">
          <div className="space-y-6">
            {errorMessage ? (
              <div className="rounded-[1.35rem] border border-[#f5f5f4]/15 bg-[#f5f5f4]/10 p-4 text-sm text-[#f5f5f4] backdrop-blur-md">
                <div className="flex items-start justify-between gap-3">
                  <p className="leading-6 text-[#f5f5f4]/88">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={clearError}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#f5f5f4]/85"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#f5f5f4]/45">World Controls</p>
              <div className="mt-4 space-y-5">
                <label className="block">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>Gravity Preset</span>
                  </div>
                  <select
                    value={gravityPreset}
                    onChange={(event) => applyGravityPreset(event.target.value as keyof typeof GRAVITY_PRESETS)}
                    className="w-full rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-[#f5f5f4] outline-none backdrop-blur-md"
                  >
                    <option value="earth" className="text-[#1c1917]">
                      Earth (9.81 m/s²)
                    </option>
                    <option value="moon" className="text-[#1c1917]">
                      Moon (1.62 m/s²)
                    </option>
                    <option value="mars" className="text-[#1c1917]">
                      Mars (3.71 m/s²)
                    </option>
                    <option value="jupiter" className="text-[#1c1917]">
                      Jupiter (24.79 m/s²)
                    </option>
                  </select>
                </label>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>Gravity</span>
                    <span>{worldSettings.gravity.toFixed(2)} m/s²</span>
                  </div>
                  <input
                    className={sliderTheme}
                    type="range"
                    min={1.62}
                    max={24.79}
                    step={0.01}
                    value={worldSettings.gravity}
                    onChange={(event) => updateWorldParam("gravity", Number(event.target.value))}
                  />
                </label>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>Air Density</span>
                    <span>{worldSettings.airDensity.toFixed(3)} kg/m³</span>
                  </div>
                  <input
                    className={sliderTheme}
                    type="range"
                    min={0}
                    max={2}
                    step={0.001}
                    value={worldSettings.airDensity}
                    onChange={(event) => updateWorldParam("airDensity", Number(event.target.value))}
                  />
                </label>

                <button
                  type="button"
                  onClick={toggleVacuumMode}
                  className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition ${
                    isVacuumMode
                      ? "bg-[#86efac] text-[#1c1917]"
                      : "border border-white/10 bg-white/6 text-[#f5f5f4]"
                  }`}
                >
                  {isVacuumMode ? "Vacuum Mode Active" : "Enable Vacuum Mode"}
                </button>

                <button
                  type="button"
                  onClick={() => setIsLiveSyncEnabled((current) => !current)}
                  className={`w-full rounded-full px-4 py-3 text-sm font-semibold transition ${
                    isLiveSyncEnabled
                      ? "bg-[#86efac] text-[#1c1917]"
                      : "border border-white/10 bg-white/6 text-[#f5f5f4]"
                  }`}
                >
                  {isLiveSyncEnabled ? "Live Sync On" : "Live Sync Off"}
                </button>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span>Object Mass</span>
                    <span>{worldSettings.mass.toFixed(3)} kg</span>
                  </div>
                  <input
                    className={sliderTheme}
                    type="range"
                    min={0.01}
                    max={5}
                    step={0.001}
                    value={worldSettings.mass}
                    onChange={(event) => updateWorldParam("mass", Number(event.target.value))}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-[#86efac]/20 bg-[#86efac]/10 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#f5f5f4]/45">Extracted Launch State</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[1.35rem] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#f5f5f4]/45">v0</p>
                  <p className="mt-2 text-3xl font-semibold text-[#86efac]">
                    {inferredStats ? inferredStats.v0.toFixed(2) : "--"}
                  </p>
                  <p className="text-sm text-[#f5f5f4]/55">m/s</p>
                </div>
                <div className="rounded-[1.35rem] border border-white/10 bg-black/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#f5f5f4]/45">θ</p>
                  <p className="mt-2 text-3xl font-semibold text-[#86efac]">
                    {inferredStats ? inferredStats.theta_degrees.toFixed(1) : "--"}
                  </p>
                  <p className="text-sm text-[#f5f5f4]/55">degrees</p>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#f5f5f4]/45">Simulation</p>
                  <p className="mt-2 text-sm leading-6 text-[#f5f5f4]/68">
                    Run the backend solver against the currently calibrated track to compare observed and simulated motion.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void runSimulation()}
                disabled={isProcessing || !motionProfile || motionProfile.frames.length < 2}
                className="mt-5 w-full rounded-full bg-[#86efac] px-4 py-3 text-sm font-semibold text-[#1c1917] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isProcessing ? "Running Simulation..." : "Run Simulation"}
              </button>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#f5f5f4]/55">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  Frames: {motionProfile?.frames.length ?? 0}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  Calibrated: {calibration ? "Yes" : "No"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  Live Sync: {isLiveSyncEnabled ? "On" : "Off"}
                </span>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-[#f5f5f4]/45">Export & Share</p>
              <p className="mt-2 text-sm leading-6 text-[#f5f5f4]/68">
                Export tracked motion and simulated trajectories for Excel, Python, or lab notebooks.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => exportData("json")}
                  disabled={!motionProfile}
                  className="rounded-full border border-white/10 bg-white/6 px-4 py-3 text-sm font-medium text-[#f5f5f4] backdrop-blur-md disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => exportData("csv")}
                  disabled={!motionProfile}
                  className="rounded-full bg-[#86efac] px-4 py-3 text-sm font-semibold text-[#1c1917] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Export CSV
                </button>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </main>
  );
}
