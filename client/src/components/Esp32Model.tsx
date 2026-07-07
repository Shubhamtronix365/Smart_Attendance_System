"use client";

import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ─── ESP32 Board ────────────────────────────────────────────────────────────
function Esp32Board() {
  const boardRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (boardRef.current) boardRef.current.rotation.y += delta * 0.3;
    if (wireRef.current) wireRef.current.rotation.y += delta * 0.3;
  });

  return (
    <group>
      {/* Solid board */}
      <mesh ref={boardRef}>
        <boxGeometry args={[1.8, 1.2, 0.15]} />
        <meshStandardMaterial
          color="#0a1628"
          metalness={0.8}
          roughness={0.2}
          emissive="#0a1628"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Wireframe overlay */}
      <mesh ref={wireRef}>
        <boxGeometry args={[1.8, 1.2, 0.15]} />
        <meshBasicMaterial
          color="#00f5ff"
          wireframe
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* USB port */}
      <mesh position={[0, -0.7, 0.08]}>
        <boxGeometry args={[0.25, 0.08, 0.05]} />
        <meshStandardMaterial color="#888" metalness={1} roughness={0.3} />
      </mesh>

      {/* Antenna stub */}
      <mesh position={[0.82, 0.45, 0]}>
        <boxGeometry args={[0.06, 0.4, 0.05]} />
        <meshStandardMaterial
          color="#00f5ff"
          emissive="#00f5ff"
          emissiveIntensity={1.5}
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* GPIO pins left */}
      {[-0.4, -0.2, 0, 0.2, 0.4].map((y, i) => (
        <mesh key={`l${i}`} position={[-0.98, y, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.12, 8]} />
          <meshStandardMaterial color="#c0a060" metalness={1} roughness={0.2} />
        </mesh>
      ))}

      {/* GPIO pins right */}
      {[-0.4, -0.2, 0, 0.2, 0.4].map((y, i) => (
        <mesh key={`r${i}`} position={[0.98, y, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.12, 8]} />
          <meshStandardMaterial color="#c0a060" metalness={1} roughness={0.2} />
        </mesh>
      ))}

      {/* Chip on board */}
      <mesh position={[0, 0.1, 0.09]}>
        <boxGeometry args={[0.5, 0.5, 0.06]} />
        <meshStandardMaterial
          color="#1a1a2e"
          metalness={0.9}
          roughness={0.1}
          emissive="#7c3aed"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
}

// ─── Fingerprint Ring ─────────────────────────────────────────────────────────
function FingerprintRing() {
  const torusRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (torusRef.current) {
      torusRef.current.rotation.x = Math.sin(t * 0.4) * 0.15;
      torusRef.current.rotation.z = t * 0.25;
    }
    if (innerRef.current) {
      innerRef.current.rotation.z = -t * 0.4;
    }
    if (outerRef.current) {
      outerRef.current.rotation.z = t * 0.15;
    }
  });

  return (
    <group>
      {/* Outer scan ring */}
      <mesh ref={torusRef}>
        <torusGeometry args={[1.55, 0.025, 16, 100]} />
        <meshStandardMaterial
          color="#00f5ff"
          emissive="#00f5ff"
          emissiveIntensity={2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Inner ring */}
      <mesh ref={innerRef}>
        <torusGeometry args={[1.2, 0.015, 16, 100]} />
        <meshStandardMaterial
          color="#7c3aed"
          emissive="#7c3aed"
          emissiveIntensity={2}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Outer slow ring */}
      <mesh ref={outerRef}>
        <torusGeometry args={[1.9, 0.01, 16, 60]} />
        <meshStandardMaterial
          color="#00f5ff"
          emissive="#00f5ff"
          emissiveIntensity={1}
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
}

// ─── Orbiting Data Nodes ──────────────────────────────────────────────────────
function OrbitingNodes() {
  const group = useRef<THREE.Group>(null);
  const colors = ["#22c55e", "#7c3aed", "#f59e0b"];

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      group.current.children.forEach((child, i) => {
        const offset = (i * Math.PI * 2) / 3;
        const radius = 2.2;
        child.position.x = Math.cos(t * 0.6 + offset) * radius;
        child.position.y = Math.sin(t * 0.6 + offset) * radius * 0.4;
        child.position.z = Math.sin(t * 0.6 + offset) * 0.8;
      });
    }
  });

  return (
    <group ref={group}>
      {colors.map((color, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={3}
            roughness={0}
            metalness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Particle Field ────────────────────────────────────────────────────────────
function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 200;

  const positions = React.useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.getElapsedTime() * 0.04;
      pointsRef.current.rotation.x = state.clock.getElapsedTime() * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color="#7c3aed"
        transparent
        opacity={0.7}
        sizeAttenuation
      />
    </points>
  );
}

// ─── Connecting Lines (data flow) ─────────────────────────────────────────────
function DataFlowLines() {
  const lineRef = useRef<THREE.LineSegments>(null);

  const linePositions = new Float32Array([
    // ESP32 → server node
    0, 0, 0,
    2.5, 1.5, 0,
    // server → DB node
    2.5, 1.5, 0,
    -2.0, 1.2, 0.5,
    // DB → ESP32
    -2.0, 1.2, 0.5,
    0, 0, 0,
  ]);

  useFrame((state) => {
    if (lineRef.current) {
      const mat = lineRef.current.material as THREE.LineDashedMaterial;
      mat.dashOffset = -state.clock.getElapsedTime() * 0.5;
    }
  });

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={6}
          array={linePositions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineDashedMaterial
        color="#00f5ff"
        dashSize={0.2}
        gapSize={0.15}
        transparent
        opacity={0.4}
        linewidth={1}
      />
    </lineSegments>
  );
}

// ─── Main 3D Canvas Export ────────────────────────────────────────────────────
export default function Esp32Model() {
  return (
    <Canvas
      camera={{ fov: 50, position: [0, 0, 5] }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.3} color="#1a1a2e" />
      <pointLight position={[2, 3, 3]} intensity={1.5} color="#00f5ff" />
      <pointLight position={[-2, -1, 2]} intensity={1.0} color="#7c3aed" />
      <pointLight position={[0, -2, 1]} intensity={0.5} color="#0a0f1e" />

      {/* Scene Objects */}
      <Esp32Board />
      <FingerprintRing />
      <OrbitingNodes />
      <ParticleField />
      <DataFlowLines />

      {/* Subtle orbit controls — damped, no zoom */}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        dampingFactor={0.05}
        maxPolarAngle={Math.PI / 1.8}
        minPolarAngle={Math.PI / 3}
      />
    </Canvas>
  );
}
