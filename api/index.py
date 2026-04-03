from __future__ import annotations

from dataclasses import dataclass
from math import atan2, degrees, hypot
from typing import Iterable, List

import numpy as np
from fastapi import FastAPI
from scipy.interpolate import CubicSpline
from scipy.ndimage import gaussian_filter1d
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Origin(BaseModel):
    x: float = Field(..., description="Horizontal origin in source video pixels.")
    y: float = Field(..., description="Vertical origin in source video pixels.")
    y_axis_up: bool = Field(
        default=True,
        description="Whether positive y points upward from the origin.",
    )

    model_config = ConfigDict(extra="forbid")


class MotionFrame(BaseModel):
    t: float = Field(..., ge=0.0, description="Timestamp in seconds.")
    x: float = Field(..., description="Tracked x coordinate in source video pixels.")
    y: float = Field(..., description="Tracked y coordinate in source video pixels.")

    model_config = ConfigDict(extra="forbid")


class MotionMetadata(BaseModel):
    fps: float = Field(..., gt=0.0, description="Video frame rate (fps).")
    pixel_to_meter_ratio: float = Field(
        ...,
        gt=0.0,
        description="Meters per pixel ratio.",
    )
    origin: Origin

    model_config = ConfigDict(extra="forbid")


class MotionProfile(BaseModel):
    metadata: MotionMetadata
    frames: List[MotionFrame] = Field(..., min_length=2)

    model_config = ConfigDict(extra="forbid")

    @field_validator("frames")
    @classmethod
    def validate_monotonic_time(cls, frames: List[MotionFrame]) -> List[MotionFrame]:
        times = [frame.t for frame in frames]
        if times != sorted(times):
            raise ValueError("MotionProfile frames must be sorted by ascending time.")
        if len(set(times)) != len(times):
            raise ValueError("MotionProfile frames must have unique timestamps.")
        return frames


class WorldParams(BaseModel):
    g: float = Field(..., gt=0.0, description="Gravity magnitude in m/s^2.")
    rho: float = Field(..., ge=0.0, description="Fluid density in kg/m^3.")
    m: float = Field(..., gt=0.0, description="Body mass in kilograms.")
    C_d: float = Field(..., ge=0.0, description="Drag coefficient.")
    A: float = Field(..., ge=0.0, description="Reference area in m^2.")

    model_config = ConfigDict(extra="forbid")


class SimulationRequest(BaseModel):
    motion_profile: MotionProfile
    world_params: WorldParams

    model_config = ConfigDict(extra="forbid")


class PathPoint(BaseModel):
    t: float
    x: float
    y: float

    model_config = ConfigDict(extra="forbid")


class InitialStateEstimate(BaseModel):
    x0: float
    y0: float
    vx0: float
    vy0: float
    v0: float
    theta_radians: float
    theta_degrees: float

    model_config = ConfigDict(extra="forbid")


class SimulationResponse(BaseModel):
    original_path: List[PathPoint]
    smoothed_path: List[PathPoint]
    simulated_path: List[PathPoint]
    inferred_initial_state: InitialStateEstimate

    model_config = ConfigDict(extra="forbid")


@dataclass(frozen=True)
class InitialState:
    x0: float
    y0: float
    vx0: float
    vy0: float

    @property
    def speed(self) -> float:
        return hypot(self.vx0, self.vy0)

    @property
    def theta_radians(self) -> float:
        return atan2(self.vy0, self.vx0)

    @property
    def theta_degrees(self) -> float:
        return degrees(self.theta_radians)


class PhysicsSolver:
    def __init__(self, motion_profile: MotionProfile):
        self.motion_profile = motion_profile
        self._time = self._extract_time()
        self._original_xy = self._extract_metric_coordinates()
        self._spline_x, self._spline_y = self._build_smoothed_splines()

    def _extract_time(self) -> np.ndarray:
        return np.asarray([frame.t for frame in self.motion_profile.frames], dtype=np.float64)

    def _extract_metric_coordinates(self) -> np.ndarray:
        ratio = self.motion_profile.metadata.pixel_to_meter_ratio
        origin = self.motion_profile.metadata.origin
        xy = np.zeros((len(self.motion_profile.frames), 2), dtype=np.float64)
        for index, frame in enumerate(self.motion_profile.frames):
            xy[index, 0] = (frame.x - origin.x) * ratio
            y_offset = frame.y - origin.y
            xy[index, 1] = (-y_offset if origin.y_axis_up else y_offset) * ratio
        return xy

    def _build_smoothed_splines(self) -> tuple[CubicSpline, CubicSpline]:
        if len(self._time) < 4:
            smoothed_xy = self._original_xy
        else:
            sigma = max(len(self._time) / 18.0, 1.0)
            smoothed_xy = np.column_stack(
                [
                    gaussian_filter1d(self._original_xy[:, axis], sigma=sigma, mode="nearest")
                    for axis in range(2)
                ]
            )
        return (
            CubicSpline(self._time, smoothed_xy[:, 0], bc_type="natural"),
            CubicSpline(self._time, smoothed_xy[:, 1], bc_type="natural"),
        )

    def original_path(self) -> List[PathPoint]:
        return self._to_path_points(self._time, self._original_xy)

    def smoothed_path(self, sample_count: int | None = None) -> List[PathPoint]:
        dense_time = self._sample_time(sample_count)
        dense_xy = np.column_stack([self._spline_x(dense_time), self._spline_y(dense_time)])
        return self._to_path_points(dense_time, dense_xy)

    def infer_initial_state(self) -> InitialState:
        t0 = float(self._time[0])
        x0 = float(self._spline_x(t0))
        y0 = float(self._spline_y(t0))
        vx0 = float(self._spline_x(t0, 1))
        vy0 = float(self._spline_y(t0, 1))
        return InitialState(x0=x0, y0=y0, vx0=vx0, vy0=vy0)

    def simulate(
        self,
        initial_state: InitialState,
        world_params: WorldParams,
        sample_times: Iterable[float] | None = None,
    ) -> List[PathPoint]:
        times = (
            np.asarray(list(sample_times), dtype=np.float64)
            if sample_times is not None
            else self._sample_time()
        )
        if times.ndim != 1 or len(times) < 2:
            raise ValueError("Simulation requires at least two sample times.")

        state = np.array(
            [initial_state.x0, initial_state.y0, initial_state.vx0, initial_state.vy0],
            dtype=np.float64,
        )
        points = [PathPoint(t=float(times[0]), x=float(state[0]), y=float(state[1]))]

        for current_time, next_time in zip(times[:-1], times[1:]):
            dt = float(next_time - current_time)
            if dt <= 0.0:
                raise ValueError("Simulation times must be strictly increasing.")
            state = self._rk4_step(state, dt, world_params)
            points.append(PathPoint(t=float(next_time), x=float(state[0]), y=float(state[1])))
        return points

    def _rk4_step(self, state: np.ndarray, dt: float, world_params: WorldParams) -> np.ndarray:
        def derivatives(vector: np.ndarray) -> np.ndarray:
            x, y, vx, vy = vector
            del x, y
            speed = hypot(vx, vy)
            drag_scale = 0.5 * world_params.rho * world_params.C_d * world_params.A / world_params.m
            ax = -drag_scale * speed * vx
            ay = -world_params.g - drag_scale * speed * vy
            return np.array([vx, vy, ax, ay], dtype=np.float64)

        k1 = derivatives(state)
        k2 = derivatives(state + 0.5 * dt * k1)
        k3 = derivatives(state + 0.5 * dt * k2)
        k4 = derivatives(state + dt * k3)
        return state + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)

    def _sample_time(self, sample_count: int | None = None) -> np.ndarray:
        if sample_count is None:
            return self._time.copy()
        return np.linspace(float(self._time[0]), float(self._time[-1]), sample_count)

    @staticmethod
    def _to_path_points(time: np.ndarray, xy: np.ndarray) -> List[PathPoint]:
        return [
            PathPoint(t=float(t), x=float(x), y=float(y))
            for t, (x, y) in zip(time, xy, strict=True)
        ]


app = FastAPI(title="Newton's Eye API", version="1.0.0")


@app.get("/api/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/solve", response_model=SimulationResponse)
def solve(request: SimulationRequest) -> SimulationResponse:
    solver = PhysicsSolver(request.motion_profile)
    inferred_state = solver.infer_initial_state()
    simulated_path = solver.simulate(
        initial_state=inferred_state,
        world_params=request.world_params,
        sample_times=[frame.t for frame in request.motion_profile.frames],
    )

    return SimulationResponse(
        original_path=solver.original_path(),
        smoothed_path=solver.smoothed_path(sample_count=max(len(request.motion_profile.frames) * 4, 32)),
        simulated_path=simulated_path,
        inferred_initial_state=InitialStateEstimate(
            x0=inferred_state.x0,
            y0=inferred_state.y0,
            vx0=inferred_state.vx0,
            vy0=inferred_state.vy0,
            v0=inferred_state.speed,
            theta_radians=inferred_state.theta_radians,
            theta_degrees=inferred_state.theta_degrees,
        ),
    )
