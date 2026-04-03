export interface Origin {
  x: number;
  y: number;
  y_axis_up: boolean;
}

export interface MotionMetadata {
  fps: number;
  pixel_to_meter_ratio: number;
  origin: Origin;
}

export interface MotionFrame {
  t: number;
  x: number;
  y: number;
}

export interface MotionProfile {
  metadata: MotionMetadata;
  frames: MotionFrame[];
}

export interface WorldParams {
  g: number;
  rho: number;
  m: number;
  C_d: number;
  A: number;
}

export interface PathPoint {
  t: number;
  x: number;
  y: number;
}

export interface InitialStateEstimate {
  x0: number;
  y0: number;
  vx0: number;
  vy0: number;
  v0: number;
  theta_radians: number;
  theta_degrees: number;
}

export interface SimulationRequest {
  motion_profile: MotionProfile;
  world_params: WorldParams;
}

export interface SimulationResponse {
  original_path: PathPoint[];
  smoothed_path: PathPoint[];
  simulated_path: PathPoint[];
  inferred_initial_state: InitialStateEstimate;
}

export interface CalibrationSegment {
  start: {
    x: number;
    y: number;
  };
  end: {
    x: number;
    y: number;
  };
  distanceMeters: number;
}

export interface SavedSimulation {
  id: string;
  label: string;
  color: string;
  isVisible: boolean;
  simulatedPath: PathPoint[];
  worldSettings: {
    gravity: number;
    airDensity: number;
    mass: number;
    dragCoefficient: number;
    crossSectionalArea: number;
  };
}
