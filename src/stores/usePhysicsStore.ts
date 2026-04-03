import { create } from "zustand";

import type {
  CalibrationSegment,
  InitialStateEstimate,
  MotionProfile,
  PathPoint,
  SavedSimulation,
  SimulationRequest,
  SimulationResponse,
  WorldParams,
} from "../types/physics";

export const GRAVITY_PRESETS = {
  earth: 9.81,
  moon: 1.62,
  mars: 3.71,
  jupiter: 24.79,
} as const;

export type GravityPreset = keyof typeof GRAVITY_PRESETS;

const SNAPSHOT_PALETTE = ["#6b7280", "#a78b6d", "#5f7a61", "#8f9779"] as const;

export interface PhysicsStoreState {
  motionProfile: MotionProfile | null;
  originalPath: PathPoint[];
  simulatedPath: PathPoint[];
  snapshots: SavedSimulation[];
  isProcessing: boolean;
  errorMessage: string | null;
  inferredStats: Pick<InitialStateEstimate, "v0" | "theta_degrees"> | null;
  calibration: CalibrationSegment | null;
  gravityPreset: GravityPreset;
  isVacuumMode: boolean;
  worldSettings: {
    gravity: number;
    airDensity: number;
    mass: number;
    dragCoefficient: number;
    crossSectionalArea: number;
  };
  setMotionData: (motionProfile: MotionProfile) => void;
  setCalibration: (segment: CalibrationSegment) => void;
  upsertTrackedFrame: (frame: { t: number; x: number; y: number }, fps?: number) => void;
  applyGravityPreset: (preset: GravityPreset) => void;
  toggleVacuumMode: () => void;
  updateWorldParam: (
    key: keyof PhysicsStoreState["worldSettings"],
    value: number,
  ) => void;
  clearError: () => void;
  takeSnapshot: (label?: string) => void;
  toggleSnapshotVisibility: (snapshotId: string) => void;
  clearSnapshots: () => void;
  exportData: (format: "json" | "csv") => void;
  runSimulation: () => Promise<SimulationResponse>;
}

const defaultWorldSettings: PhysicsStoreState["worldSettings"] = {
  gravity: 9.80665,
  airDensity: 1.225,
  mass: 0.145,
  dragCoefficient: 0.47,
  crossSectionalArea: 0.0042,
};

const toPath = (motionProfile: MotionProfile): PathPoint[] =>
  motionProfile.frames.map((frame) => {
    const { pixel_to_meter_ratio, origin } = motionProfile.metadata;
    const x = (frame.x - origin.x) * pixel_to_meter_ratio;
    const yOffset = frame.y - origin.y;
    const y = (origin.y_axis_up ? -yOffset : yOffset) * pixel_to_meter_ratio;

    return {
      t: frame.t,
      x,
      y,
    };
  });

const toWorldParams = (
  worldSettings: PhysicsStoreState["worldSettings"],
): WorldParams => ({
  g: worldSettings.gravity,
  rho: worldSettings.airDensity,
  m: worldSettings.mass,
  C_d: worldSettings.dragCoefficient,
  A: worldSettings.crossSectionalArea,
});

const API_BASE = "/api";

export const usePhysicsStore = create<PhysicsStoreState>((set, get) => ({
  motionProfile: null,
  originalPath: [],
  simulatedPath: [],
  snapshots: [],
  isProcessing: false,
  errorMessage: null,
  inferredStats: null,
  calibration: null,
  gravityPreset: "earth",
  isVacuumMode: false,
  worldSettings: defaultWorldSettings,

  setMotionData: (motionProfile) =>
    set({
      motionProfile,
      originalPath: toPath(motionProfile),
      simulatedPath: [],
      snapshots: [],
      calibration: null,
      errorMessage: null,
      inferredStats: null,
    }),

  setCalibration: (segment) =>
    set((state) => {
      const current = state.motionProfile;
      if (!current) {
        return {
          calibration: segment,
          motionProfile: {
            metadata: {
              fps: 30,
              pixel_to_meter_ratio:
                segment.distanceMeters /
                Math.hypot(
                  segment.end.x - segment.start.x,
                  segment.end.y - segment.start.y,
                ),
              origin: {
                x: 0,
                y: 0,
                y_axis_up: true,
              },
            },
            frames: [],
          },
        };
      }

      const pixelDistance = Math.hypot(
        segment.end.x - segment.start.x,
        segment.end.y - segment.start.y,
      );
      const pixelToMeterRatio = segment.distanceMeters / pixelDistance;
      const motionProfile: MotionProfile = {
        metadata: {
          ...current.metadata,
          pixel_to_meter_ratio: pixelToMeterRatio,
        },
        frames: current.frames,
      };

      return {
        calibration: segment,
        motionProfile,
        originalPath: toPath(motionProfile),
      };
    }),

  upsertTrackedFrame: (frame, fps = 30) =>
    set((state) => {
      const current = state.motionProfile;
      const nextProfile: MotionProfile = current
        ? {
            metadata: {
              ...current.metadata,
              fps,
            },
            frames: [...current.frames.filter((item) => item.t !== frame.t), frame].sort(
              (left, right) => left.t - right.t,
            ),
          }
        : {
            metadata: {
              fps,
              pixel_to_meter_ratio: 1,
              origin: {
                x: 0,
                y: 0,
                y_axis_up: true,
              },
            },
            frames: [frame],
          };

      return {
        motionProfile: nextProfile,
        originalPath: toPath(nextProfile),
        simulatedPath: state.simulatedPath.filter((point) => point.t !== frame.t),
      };
    }),

  applyGravityPreset: (preset) =>
    set((state) => ({
      gravityPreset: preset,
      worldSettings: {
        ...state.worldSettings,
        gravity: GRAVITY_PRESETS[preset],
      },
    })),

  toggleVacuumMode: () =>
    set((state) => {
      const nextVacuumMode = !state.isVacuumMode;
      return {
        isVacuumMode: nextVacuumMode,
        worldSettings: {
          ...state.worldSettings,
          airDensity: nextVacuumMode ? 0 : defaultWorldSettings.airDensity,
        },
      };
    }),

  updateWorldParam: (key, value) =>
    set((state) => ({
      gravityPreset:
        key === "gravity"
          ? (Object.entries(GRAVITY_PRESETS).find(([, presetValue]) => presetValue === value)?.[0] as GravityPreset | undefined) ??
            state.gravityPreset
          : state.gravityPreset,
      isVacuumMode:
        key === "airDensity" ? value === 0 : state.isVacuumMode,
      worldSettings: {
        ...state.worldSettings,
        [key]: value,
      },
    })),

  clearError: () => set({ errorMessage: null }),

  takeSnapshot: (label) =>
    set((state) => {
      if (state.simulatedPath.length < 2) {
        return {
          errorMessage: "Run a simulation before taking a snapshot.",
        };
      }

      const snapshotIndex = state.snapshots.length;
      const fallbackLabel = `${state.gravityPreset[0].toUpperCase()}${state.gravityPreset.slice(1)} Run ${snapshotIndex + 1}`;

      return {
        errorMessage: null,
        snapshots: [
          ...state.snapshots,
          {
            id: `snapshot-${Date.now()}-${snapshotIndex}`,
            label: label?.trim() || fallbackLabel,
            color: SNAPSHOT_PALETTE[snapshotIndex % SNAPSHOT_PALETTE.length],
            isVisible: true,
            simulatedPath: state.simulatedPath.map((point) => ({ ...point })),
            worldSettings: { ...state.worldSettings },
          },
        ],
      };
    }),

  toggleSnapshotVisibility: (snapshotId) =>
    set((state) => ({
      snapshots: state.snapshots.map((snapshot) =>
        snapshot.id === snapshotId
          ? { ...snapshot, isVisible: !snapshot.isVisible }
          : snapshot,
      ),
    })),

  clearSnapshots: () => set({ snapshots: [] }),

  exportData: (format) => {
    const { motionProfile, simulatedPath } = get();
    if (!motionProfile) {
      throw new Error("Motion profile is required before exporting data.");
    }

    const download = (filename: string, content: string, type: string) => {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    };

    if (format === "json") {
      download(
        "newtons-eye-export.json",
        JSON.stringify(
          {
            motionProfile,
            simulatedPath,
          },
          null,
          2,
        ),
        "application/json",
      );
      return;
    }

    const header = "series,t,x,y";
    const trackedRows = motionProfile.frames.map((frame) => `motion_profile,${frame.t},${frame.x},${frame.y}`);
    const simulatedRows = simulatedPath.map(
      (point) => `simulated_path,${point.t},${point.x},${point.y}`,
    );
    download(
      "newtons-eye-export.csv",
      [header, ...trackedRows, ...simulatedRows].join("\n"),
      "text/csv;charset=utf-8",
    );
  },

  runSimulation: async () => {
    const { motionProfile, worldSettings } = get();

    if (!motionProfile || motionProfile.frames.length < 2) {
      const message = "Track at least two frames before running a simulation.";
      set({ errorMessage: message });
      throw new Error(message);
    }

    set({ isProcessing: true, errorMessage: null });

    try {
      const payload: SimulationRequest = {
        motion_profile: motionProfile,
        world_params: toWorldParams(worldSettings),
      };

      const response = await fetch(`${API_BASE}/solve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Simulation request failed.");
      }

      const data = (await response.json()) as SimulationResponse;
      set({
        originalPath: data.original_path,
        simulatedPath: data.simulated_path,
        errorMessage: null,
        inferredStats: {
          v0: data.inferred_initial_state.v0,
          theta_degrees: data.inferred_initial_state.theta_degrees,
        },
      });
      return data;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Simulation failed. Please verify your track and world settings.";
      set({ errorMessage: message });
      throw error;
    } finally {
      set({ isProcessing: false });
    }
  },
}));
