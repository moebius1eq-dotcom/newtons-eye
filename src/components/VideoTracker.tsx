"use client";

import { ChangeEvent, MouseEvent, useEffect, useRef, useState } from "react";

import type { MotionProfile } from "../types/physics";
import { usePhysicsStore } from "../stores/usePhysicsStore";

type TrackerMode = "track" | "calibrate";

const DEFAULT_FPS = 30;

function formatTime(seconds: number) {
  return `${seconds.toFixed(3)} s`;
}

export function VideoTracker() {
  const motionProfile = usePhysicsStore((state) => state.motionProfile);
  const calibration = usePhysicsStore((state) => state.calibration);
  const setMotionData = usePhysicsStore((state) => state.setMotionData);
  const setCalibration = usePhysicsStore((state) => state.setCalibration);
  const upsertTrackedFrame = usePhysicsStore((state) => state.upsertTrackedFrame);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [trackerMode, setTrackerMode] = useState<TrackerMode>("track");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [calibrationPoints, setCalibrationPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [distanceMeters, setDistanceMeters] = useState("");

  const fps = motionProfile?.metadata.fps ?? DEFAULT_FPS;

  const getRenderedVideoRect = () => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const bounds = container.getBoundingClientRect();
    const containerAspect = bounds.width / bounds.height;
    const videoAspect = video.videoWidth / video.videoHeight;

    if (videoAspect > containerAspect) {
      const width = bounds.width;
      const height = width / videoAspect;
      return {
        left: 0,
        top: (bounds.height - height) / 2,
        width,
        height,
      };
    }

    const height = bounds.height;
    const width = height * videoAspect;
    return {
      left: (bounds.width - width) / 2,
      top: 0,
      width,
      height,
    };
  };

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!video || !canvas || !container) {
      return;
    }

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      drawOverlay();
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    resizeCanvas();

    return () => observer.disconnect();
  }, [videoUrl]);

  useEffect(() => {
    drawOverlay();
  }, [calibration, calibrationPoints, currentTime, motionProfile]);

  const initializeMotionProfile = (video: HTMLVideoElement) => {
    const profile: MotionProfile = {
      metadata: {
        fps,
        pixel_to_meter_ratio: motionProfile?.metadata.pixel_to_meter_ratio ?? 1,
        origin: {
          x: 0,
          y: video.videoHeight,
          y_axis_up: true,
        },
      },
      frames: [],
    };

    setMotionData(profile);
  };

  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    setVideoUrl(nextUrl);
    setDuration(0);
    setCurrentTime(0);
    setCalibrationPoints([]);
    setDistanceMeters("");
    setIsPlaying(false);
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setDuration(video.duration);
    initializeMotionProfile(video);
    drawOverlay();
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setCurrentTime(video.currentTime);
  };

  const drawOverlay = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const container = containerRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || !video || !container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    const rendered = getRenderedVideoRect();
    const dpr = window.devicePixelRatio || 1;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    if (!rendered) {
      return;
    }

    const mapVideoToCanvas = (x: number, y: number) => ({
      x: rendered.left + (x / video.videoWidth) * rendered.width,
      y: rendered.top + (y / video.videoHeight) * rendered.height,
    });

    context.lineCap = "round";
    context.lineJoin = "round";

    if (motionProfile?.frames.length) {
      context.strokeStyle = "rgba(134, 239, 172, 0.9)";
      context.lineWidth = 2;
      context.beginPath();

      motionProfile.frames.forEach((frame, index) => {
        const point = mapVideoToCanvas(frame.x, frame.y);
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });

      context.stroke();

      motionProfile.frames.forEach((frame) => {
        const point = mapVideoToCanvas(frame.x, frame.y);
        const isCurrentFrame = Math.abs(frame.t - currentTime) <= 1 / fps / 2;
        context.fillStyle = isCurrentFrame ? "#f5f5f4" : "#86efac";
        context.beginPath();
        context.arc(point.x, point.y, isCurrentFrame ? 5 : 3.5, 0, Math.PI * 2);
        context.fill();
      });
    }

    const activeCalibration =
      calibrationPoints.length === 2
        ? calibrationPoints
        : calibration
          ? [calibration.start, calibration.end]
          : calibrationPoints;

    if (activeCalibration.length >= 1) {
      context.fillStyle = "#f5f5f4";
      activeCalibration.forEach((point) => {
        const mapped = mapVideoToCanvas(point.x, point.y);
        context.beginPath();
        context.arc(mapped.x, mapped.y, 5, 0, Math.PI * 2);
        context.fill();
      });
    }

    if (activeCalibration.length === 2) {
      const [start, end] = activeCalibration;
      const startPoint = mapVideoToCanvas(start.x, start.y);
      const endPoint = mapVideoToCanvas(end.x, end.y);
      context.strokeStyle = "rgba(245, 245, 244, 0.85)";
      context.setLineDash([10, 8]);
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(startPoint.x, startPoint.y);
      context.lineTo(endPoint.x, endPoint.y);
      context.stroke();
      context.setLineDash([]);
    }
  };

  const getVideoCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const rendered = getRenderedVideoRect();
    if (!rendered) {
      return null;
    }

    const xInCanvas = clientX - rect.left;
    const yInCanvas = clientY - rect.top;

    if (
      xInCanvas < rendered.left ||
      xInCanvas > rendered.left + rendered.width ||
      yInCanvas < rendered.top ||
      yInCanvas > rendered.top + rendered.height
    ) {
      return null;
    }

    const normalizedX = (xInCanvas - rendered.left) / rendered.width;
    const normalizedY = (yInCanvas - rendered.top) / rendered.height;
    const x = normalizedX * video.videoWidth;
    const y = normalizedY * video.videoHeight;

    const physicsY =
      motionProfile?.metadata.origin.y !== undefined
        ? (motionProfile.metadata.origin.y - y) *
          (motionProfile.metadata.pixel_to_meter_ratio || 1)
        : 0;

    return { x, y, physicsY };
  };

  const onCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const coordinates = getVideoCoordinates(event.clientX, event.clientY);
    const video = videoRef.current;
    if (!coordinates || !video) {
      return;
    }

    if (trackerMode === "calibrate") {
      setCalibrationPoints((current) =>
        current.length === 2
          ? [{ x: coordinates.x, y: coordinates.y }]
          : [...current, { x: coordinates.x, y: coordinates.y }],
      );
      return;
    }

    const snappedTime = Math.round(video.currentTime * fps) / fps;
    upsertTrackedFrame(
      {
        t: snappedTime,
        x: coordinates.x,
        y: coordinates.y,
      },
      fps,
    );
    setCurrentTime(video.currentTime);
  };

  const applyCalibration = () => {
    if (calibrationPoints.length !== 2) {
      return;
    }

    const numericDistance = Number(distanceMeters);
    if (!Number.isFinite(numericDistance) || numericDistance <= 0) {
      return;
    }

    setCalibration({
      start: calibrationPoints[0],
      end: calibrationPoints[1],
      distanceMeters: numericDistance,
    });
    setCalibrationPoints([]);
    setDistanceMeters("");
    setTrackerMode("track");
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      await video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const stepFrame = (direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.pause();
    setIsPlaying(false);
    const nextTime = Math.min(Math.max(video.currentTime + direction / fps, 0), duration);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const onScrub = (event: ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const nextTime = Number(event.target.value);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.75rem] border border-[#1c1917]/10 bg-white/55 px-4 py-3 shadow-[0_20px_60px_rgba(28,25,23,0.08)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-full border border-[#1c1917]/10 bg-[#f5f5f4] px-4 py-2 text-sm font-medium text-[#1c1917] transition hover:border-[#86efac]/60 hover:bg-white">
            <input type="file" accept="video/*" className="hidden" onChange={onUpload} />
            Upload Video
          </label>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              trackerMode === "track"
                ? "bg-[#1c1917] text-[#f5f5f4]"
                : "border border-[#1c1917]/10 bg-white/60 text-[#1c1917]"
            }`}
            onClick={() => setTrackerMode("track")}
          >
            Track Mode
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              trackerMode === "calibrate"
                ? "bg-[#86efac] text-[#1c1917]"
                : "border border-[#1c1917]/10 bg-white/60 text-[#1c1917]"
            }`}
            onClick={() => setTrackerMode("calibrate")}
          >
            Calibrate Scale
          </button>
        </div>
        <div className="text-sm text-[#1c1917]/65">
          {motionProfile?.frames.length ?? 0} tracked frame
          {(motionProfile?.frames.length ?? 0) === 1 ? "" : "s"}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-[2rem] border border-white/30 bg-[#1c1917] shadow-[0_30px_100px_rgba(28,25,23,0.18)]"
      >
        {videoUrl ? (
          <>
            <video
              ref={videoRef}
              src={videoUrl}
              className="h-full w-full object-contain will-change-transform"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              controls={false}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full cursor-crosshair will-change-transform"
              onClick={onCanvasClick}
            />
            <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-[#1c1917]/60 px-4 py-2 text-xs uppercase tracking-[0.28em] text-[#f5f5f4]/85 backdrop-blur-md">
              {trackerMode === "calibrate" ? "Calibration Layer" : "Tracking Layer"}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(134,239,172,0.16),_transparent_35%)] px-8 text-center text-[#f5f5f4]/85">
            <div className="max-w-md space-y-3">
              <p className="font-serif text-3xl text-[#f5f5f4]">Seed the observation field</p>
              <p className="text-sm leading-6 text-[#f5f5f4]/70">
                Upload a motion clip, calibrate a known distance in meters, then mark the object frame by frame.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-[1.75rem] border border-[#1c1917]/10 bg-white/50 p-4 shadow-[0_18px_50px_rgba(28,25,23,0.08)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-full border border-[#1c1917]/10 bg-white/70 px-4 py-2 text-sm font-medium text-[#1c1917]"
            onClick={() => stepFrame(-1)}
            disabled={!videoUrl}
          >
            Prev Frame
          </button>
          <button
            type="button"
            className="rounded-full bg-[#1c1917] px-4 py-2 text-sm font-medium text-[#f5f5f4]"
            onClick={togglePlayback}
            disabled={!videoUrl}
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="rounded-full border border-[#1c1917]/10 bg-white/70 px-4 py-2 text-sm font-medium text-[#1c1917]"
            onClick={() => stepFrame(1)}
            disabled={!videoUrl}
          >
            Next Frame
          </button>
          <div className="ml-auto text-sm text-[#1c1917]/70">{formatTime(currentTime)}</div>
        </div>

        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1 / fps}
          value={Math.min(currentTime, duration || 0)}
          onChange={onScrub}
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-[#1c1917]/10 accent-[#86efac]"
          disabled={!videoUrl}
        />

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="rounded-[1.25rem] border border-[#1c1917]/10 bg-[#f5f5f4]/90 px-4 py-3 text-sm leading-6 text-[#1c1917]/80">
            {trackerMode === "calibrate"
              ? "Click two points on a known span in the video, then enter the real-world distance in meters."
              : "Click the object on the current frame to record its tracked position. The store converts video Y-down coordinates into physics Y-up coordinates using the bottom edge as ground."}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={distanceMeters}
              onChange={(event) => setDistanceMeters(event.target.value)}
              placeholder="Distance (m)"
              className="w-36 rounded-full border border-[#1c1917]/10 bg-white/80 px-4 py-2 text-sm text-[#1c1917] outline-none ring-0 placeholder:text-[#1c1917]/35"
              disabled={trackerMode !== "calibrate"}
            />
            <button
              type="button"
              onClick={applyCalibration}
              disabled={trackerMode !== "calibrate" || calibrationPoints.length !== 2}
              className="rounded-full bg-[#86efac] px-4 py-2 text-sm font-semibold text-[#1c1917] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply Scale
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#1c1917]/70">
          <div className="rounded-full border border-[#1c1917]/10 bg-white/60 px-3 py-1.5 backdrop-blur-md">
            Scale:{" "}
            {motionProfile?.metadata.pixel_to_meter_ratio
              ? `${motionProfile.metadata.pixel_to_meter_ratio.toFixed(5)} m/px`
              : "Not calibrated"}
          </div>
          <div className="rounded-full border border-[#1c1917]/10 bg-white/60 px-3 py-1.5 backdrop-blur-md">
            Origin: {motionProfile ? `(${motionProfile.metadata.origin.x.toFixed(0)}, ${motionProfile.metadata.origin.y.toFixed(0)}) px` : "Unset"}
          </div>
          <div className="rounded-full border border-[#1c1917]/10 bg-white/60 px-3 py-1.5 backdrop-blur-md">
            Pending Calibration Points: {calibrationPoints.length}/2
          </div>
        </div>
      </div>
    </div>
  );
}
