"use client";

import { useMemo, useState } from "react";

import { usePhysicsStore } from "../stores/usePhysicsStore";

type EnergyDatum = {
  t: number;
  kinetic: number;
  potential: number;
};

function buildPath(values: number[], width: number, height: number, maxValue: number) {
  if (!values.length || maxValue <= 0) {
    return "";
  }

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function AnalysisPanel() {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);

  const originalPath = usePhysicsStore((state) => state.originalPath);
  const simulatedPath = usePhysicsStore((state) => state.simulatedPath);
  const snapshots = usePhysicsStore((state) => state.snapshots);
  const takeSnapshot = usePhysicsStore((state) => state.takeSnapshot);
  const toggleSnapshotVisibility = usePhysicsStore((state) => state.toggleSnapshotVisibility);
  const clearSnapshots = usePhysicsStore((state) => state.clearSnapshots);
  const worldSettings = usePhysicsStore((state) => state.worldSettings);
  const isProcessing = usePhysicsStore((state) => state.isProcessing);

  const residualError = useMemo(() => {
    const sampleCount = Math.min(originalPath.length, simulatedPath.length);
    if (sampleCount < 2) {
      return null;
    }

    const totalDistance = Array.from({ length: sampleCount }).reduce((sum, _, index) => {
      const original = originalPath[index];
      const simulated = simulatedPath[index];
      return sum + Math.hypot(simulated.x - original.x, simulated.y - original.y);
    }, 0);

    return totalDistance / sampleCount;
  }, [originalPath, simulatedPath]);

  const energySeries = useMemo<EnergyDatum[]>(() => {
    if (simulatedPath.length < 2) {
      return [];
    }

    return simulatedPath.map((point, index) => {
      const previous = simulatedPath[Math.max(index - 1, 0)];
      const next = simulatedPath[Math.min(index + 1, simulatedPath.length - 1)];
      const dt = Math.max(next.t - previous.t, 1e-6);
      const vx = (next.x - previous.x) / dt;
      const vy = (next.y - previous.y) / dt;
      const speedSquared = vx * vx + vy * vy;

      return {
        t: point.t,
        kinetic: 0.5 * worldSettings.mass * speedSquared,
        potential: worldSettings.mass * worldSettings.gravity * Math.max(point.y, 0),
      };
    });
  }, [simulatedPath, worldSettings.gravity, worldSettings.mass]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? snapshots[0] ?? null,
    [selectedSnapshotId, snapshots],
  );

  const snapshotEnergySeries = useMemo<EnergyDatum[]>(() => {
    if (!selectedSnapshot || selectedSnapshot.simulatedPath.length < 2) {
      return [];
    }

    return selectedSnapshot.simulatedPath.map((point, index) => {
      const previous = selectedSnapshot.simulatedPath[Math.max(index - 1, 0)];
      const next = selectedSnapshot.simulatedPath[
        Math.min(index + 1, selectedSnapshot.simulatedPath.length - 1)
      ];
      const dt = Math.max(next.t - previous.t, 1e-6);
      const vx = (next.x - previous.x) / dt;
      const vy = (next.y - previous.y) / dt;
      const speedSquared = vx * vx + vy * vy;

      return {
        t: point.t,
        kinetic: 0.5 * selectedSnapshot.worldSettings.mass * speedSquared,
        potential: selectedSnapshot.worldSettings.mass * selectedSnapshot.worldSettings.gravity * Math.max(point.y, 0),
      };
    });
  }, [selectedSnapshot]);

  const maxEnergy = useMemo(() => {
    return [...energySeries, ...snapshotEnergySeries].reduce(
      (maxValue, point) => Math.max(maxValue, point.kinetic, point.potential),
      0,
    );
  }, [energySeries, snapshotEnergySeries]);

  const kineticPath = useMemo(
    () => buildPath(energySeries.map((point) => point.kinetic), 280, 124, maxEnergy || 1),
    [energySeries, maxEnergy],
  );
  const snapshotKineticPath = useMemo(
    () => buildPath(snapshotEnergySeries.map((point) => point.kinetic), 280, 124, maxEnergy || 1),
    [maxEnergy, snapshotEnergySeries],
  );
  const potentialPath = useMemo(
    () => buildPath(energySeries.map((point) => point.potential), 280, 124, maxEnergy || 1),
    [energySeries, maxEnergy],
  );

  return (
    <div className="absolute right-4 top-4 z-20 w-[min(22rem,calc(100%-2rem))]">
      <div
        className={`rounded-[1.6rem] border border-white/15 bg-[#1c1917]/62 p-3 text-[#f5f5f4] shadow-[0_24px_80px_rgba(28,25,23,0.32)] backdrop-blur-md ${
          isProcessing ? "animate-pulse ring-1 ring-[#f5f5f4]/30" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-[#f5f5f4]/45">Analysis</p>
            <p className="mt-1 text-sm text-[#f5f5f4]/72">Fit quality and energy profile</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#f5f5f4]"
          >
            {isOpen ? "Hide" : "Show"}
          </button>
        </div>

        {isOpen ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-[1.2rem] border border-[#86efac]/20 bg-[#86efac]/10 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#f5f5f4]/45">Residual Error</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-3xl font-semibold text-[#86efac]">
                  {residualError !== null ? residualError.toFixed(3) : "--"}
                </p>
                <p className="pb-1 text-xs uppercase tracking-[0.2em] text-[#f5f5f4]/45">meters avg</p>
              </div>
            </div>

            <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#f5f5f4]/45">Energy Plot</p>
                <div className="flex items-center gap-3 text-[11px] text-[#f5f5f4]/60">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#86efac]" />
                    Kinetic
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#f5f5f4]" />
                    Potential
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: selectedSnapshot?.color ?? "#6b7280" }}
                    />
                    Snapshot
                  </span>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-[1rem] border border-white/8 bg-black/10 p-3">
                {energySeries.length >= 2 ? (
                  <svg viewBox="0 0 280 124" className="h-32 w-full">
                    <line x1="0" y1="123" x2="280" y2="123" stroke="rgba(245,245,244,0.15)" />
                    <line x1="0" y1="1" x2="280" y2="1" stroke="rgba(245,245,244,0.08)" />
                    <path
                      d={potentialPath}
                      fill="none"
                      stroke="#f5f5f4"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.72"
                    />
                    <path
                      d={kineticPath}
                      fill="none"
                      stroke="#86efac"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {snapshotEnergySeries.length >= 2 ? (
                      <path
                        d={snapshotKineticPath}
                        fill="none"
                        stroke={selectedSnapshot?.color ?? "#6b7280"}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.95"
                      />
                    ) : null}
                  </svg>
                ) : (
                  <div className="flex h-32 items-center justify-center text-sm text-[#f5f5f4]/45">
                    Run a simulation to render the energy curves.
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-[#f5f5f4]/45">
                <span>0 s</span>
                <span>
                  {energySeries.length ? `${energySeries[energySeries.length - 1]?.t.toFixed(2)} s` : "--"}
                </span>
              </div>
            </div>

            <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#f5f5f4]/45">Compare</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => takeSnapshot()}
                    className="rounded-full bg-[#86efac] px-3 py-1.5 text-xs font-semibold text-[#1c1917]"
                  >
                    Save Snapshot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearSnapshots();
                      setSelectedSnapshotId(null);
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-[#f5f5f4]"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {snapshots.length ? (
                  snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-white/8 bg-black/10 px-3 py-2"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedSnapshotId(snapshot.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: snapshot.color }}
                        />
                        <span className="truncate text-sm text-[#f5f5f4]">{snapshot.label}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSnapshotVisibility(snapshot.id)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                          snapshot.isVisible
                            ? "bg-[#86efac] text-[#1c1917]"
                            : "border border-white/10 bg-white/5 text-[#f5f5f4]"
                        }`}
                      >
                        {snapshot.isVisible ? "Visible" : "Hidden"}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[0.95rem] border border-white/8 bg-black/10 px-3 py-4 text-sm text-[#f5f5f4]/45">
                    Save a run to compare trajectories and energy signatures across environments.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
