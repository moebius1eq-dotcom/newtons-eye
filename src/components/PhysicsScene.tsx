"use client";

import { memo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Grid,
  Line,
  OrbitControls,
} from "@react-three/drei";

import { AnalysisPanel } from "./AnalysisPanel";
import { usePhysicsStore } from "../stores/usePhysicsStore";

const TrajectoryLines = memo(function TrajectoryLines() {
  const originalPath = usePhysicsStore((state) => state.originalPath);
  const simulatedPath = usePhysicsStore((state) => state.simulatedPath);
  const snapshots = usePhysicsStore((state) => state.snapshots);

  const ghostPoints = originalPath.map((point) => [point.x, point.y, 0] as [number, number, number]);
  const activePoints = simulatedPath.map((point) => [point.x, point.y, 0] as [number, number, number]);
  const snapshotLines = snapshots
    .filter((snapshot) => snapshot.isVisible)
    .map((snapshot) => ({
      id: snapshot.id,
      color: snapshot.color,
      points: snapshot.simulatedPath.map((point) => [point.x, point.y, 0] as [number, number, number]),
    }))
    .filter((snapshot) => snapshot.points.length >= 2);

  return (
    <>
      {ghostPoints.length >= 2 ? (
        <Line
          points={ghostPoints}
          color="#f5f5f4"
          transparent
          opacity={0.35}
          dashed
          dashSize={0.18}
          gapSize={0.12}
          dashScale={1}
          lineWidth={1.5}
        />
      ) : null}
      {activePoints.length >= 2 ? (
        <>
          <Line
            points={activePoints}
            color="#86efac"
            transparent
            opacity={0.22}
            lineWidth={5}
          />
          <Line
            points={activePoints}
            color="#86efac"
            transparent
            opacity={0.95}
            lineWidth={2.2}
          />
        </>
      ) : null}
      {snapshotLines.map((snapshot) => (
        <Line
          key={snapshot.id}
          points={snapshot.points}
          color={snapshot.color}
          transparent
          opacity={0.82}
          lineWidth={1.5}
        />
      ))}
    </>
  );
});

const Ball = memo(function Ball() {
  const originalPath = usePhysicsStore((state) => state.originalPath);
  const simulatedPath = usePhysicsStore((state) => state.simulatedPath);
  const anchor = simulatedPath.at(-1) ?? originalPath.at(-1) ?? { x: 0, y: 0, t: 0 };

  return (
    <mesh position={[anchor.x, anchor.y, 0.08]} castShadow>
      <sphereGeometry args={[0.12, 64, 64]} />
      <meshPhysicalMaterial
        color="#86efac"
        roughness={0.24}
        metalness={0.06}
        clearcoat={1}
        clearcoatRoughness={0.08}
        reflectivity={0.9}
        sheen={0.35}
        sheenColor="#f5f5f4"
        emissive="#86efac"
        emissiveIntensity={0.12}
      />
    </mesh>
  );
});

const ImpactRing = memo(function ImpactRing() {
  const simulatedPath = usePhysicsStore((state) => state.simulatedPath);

  const impactPoint = (() => {
    for (let index = 1; index < simulatedPath.length; index += 1) {
      const previous = simulatedPath[index - 1];
      const current = simulatedPath[index];

      if (previous.y >= 0 && current.y <= 0) {
        const delta = previous.y - current.y;
        const ratio = delta === 0 ? 0 : previous.y / delta;
        return {
          x: previous.x + (current.x - previous.x) * ratio,
          y: 0,
        };
      }
    }

    return null;
  })();

  if (!impactPoint) {
    return null;
  }

  return (
    <mesh position={[impactPoint.x, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.12, 0.2, 64]} />
      <meshBasicMaterial color="#86efac" transparent opacity={0.95} />
    </mesh>
  );
});

const SceneGrid = memo(function SceneGrid() {
  return (
    <Grid
      position={[0, 0, -0.01]}
      cellColor="#2f4538"
      sectionColor="#50685a"
      fadeDistance={18}
      fadeStrength={1}
      cellThickness={0.7}
      sectionThickness={1.2}
      cellSize={1}
      sectionSize={5}
      infiniteGrid
    />
  );
});

export function PhysicsScene() {
  return (
    <div className="relative h-full min-h-[28rem] w-full overflow-hidden rounded-[2rem] border border-white/20 bg-[#1c1917]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(134,239,172,0.18),_transparent_42%),linear-gradient(180deg,rgba(245,245,244,0.05),rgba(28,25,23,0.15))]" />
      <AnalysisPanel />
      <Canvas
        camera={{ position: [5.5, 3.5, 7.5], fov: 42 }}
        shadows
        dpr={[1, 2]}
        frameloop="demand"
        className="relative z-10"
      >
        <color attach="background" args={["#1c1917"]} />
        <fog attach="fog" args={["#1c1917", 7, 16]} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[5, 8, 4]}
          intensity={2.4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <spotLight position={[-4, 6, 5]} angle={0.32} intensity={1.4} penumbra={0.8} />
        <Environment preset="sunset" />
        <SceneGrid />
        <TrajectoryLines />
        <Ball />
        <ImpactRing />
        <ContactShadows
          position={[0, -0.001, 0]}
          opacity={0.42}
          scale={18}
          blur={2.4}
          far={8}
          color="#000000"
        />
        <OrbitControls
          enablePan
          maxPolarAngle={Math.PI / 2.06}
          minDistance={3}
          maxDistance={16}
        />
      </Canvas>
    </div>
  );
}
