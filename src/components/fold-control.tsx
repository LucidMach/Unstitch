/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

interface FoldControlProps {
  axis: [number, number, number];
  angle: number;
  onFold: (newAngle: number) => void;
  onFoldStart?: () => void;
  onFoldEnd?: () => void;
  isGhost?: boolean;
  isSelected?: boolean;
  onClick?: (e: any) => void;
}

export default function FoldControl({ axis, angle, onFold, onFoldStart, onFoldEnd, isGhost, isSelected, onClick }: FoldControlProps) {
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dragStartY = useRef(0);
  const initialAngle = useRef(0);

  useEffect(() => {
    if (active) {
      document.body.style.cursor = 'grabbing';
    } else if (hovered) {
      document.body.style.cursor = 'grab';
    } else {
      document.body.style.cursor = 'auto';
    }
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hovered, active]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if ((e.target as any).setPointerCapture) {
      (e.target as any).setPointerCapture(e.pointerId);
    }
    setActive(true);
    onClick?.(e);
    onFoldStart?.();
    dragStartY.current = e.clientY;
    initialAngle.current = angle;
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (active) {
      e.stopPropagation();
      const deltaY = dragStartY.current - e.clientY;
      // 100 pixels = 90 degrees (Math.PI / 2)
      let newAngle = initialAngle.current + deltaY * (Math.PI / 2 / 100);
      // Clamp fold angle between -100 and 100 degrees
      const MAX_ANGLE = (99 * Math.PI) / 180;
      newAngle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, newAngle));
      onFold(newAngle);
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if ((e.target as any).releasePointerCapture) {
      (e.target as any).releasePointerCapture(e.pointerId);
    }
    setActive(false);
    onFoldEnd?.();
  };

  // Align Torus Z axis with the hinge axis.
  const dir = new THREE.Vector3(...axis).normalize();
  const up = new THREE.Vector3(0, 1, 0); // world up
  // We want local Z to be `dir`, and local Y to be roughly `up`
  const ex = new THREE.Vector3().crossVectors(up, dir).normalize();
  const ey = new THREE.Vector3().crossVectors(dir, ex).normalize();
  const m = new THREE.Matrix4().makeBasis(ex, ey, dir);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  const euler = new THREE.Euler().setFromQuaternion(q);

  const radius = 6;
  const tube = 0.5;

  const baseColor = isGhost && !isSelected ? "#9ca3af" : "#A36E93"; 
  const activeColor = isGhost && !isSelected ? "#6b7280" : "#8e5c80"; 
  const opacity = (isGhost && !isSelected) ? (hovered ? 0.7 : 0.3) : (hovered ? 0.95 : 0.7);

  return (
    <group rotation={euler} position={[0, 0, 0]}>
      <group
          onPointerDown={handlePointerDown} 
          onPointerMove={handlePointerMove} 
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
      >
          {/* Invisible much larger hit area for easier grabbing */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[radius * 2 + 4, radius * 2 + 4, 30]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          
          {/* Curved Arrow Path (Semi-circle) */}
          <mesh rotation={[0, 0, 0]}>
            <torusGeometry args={[radius, tube, 8, 32, Math.PI]} />
            <meshStandardMaterial color={active ? activeColor : baseColor} transparent opacity={opacity} />
          </mesh>

          {/* Arrow Head at the end of the arc (x = -radius, y = 0) */}
          <mesh position={[-radius, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[tube * 2.5, tube * 5, 8]} />
            <meshStandardMaterial color={active ? activeColor : baseColor} transparent opacity={opacity} />
          </mesh>

          {/* Arrow Head at start (x = radius, y = 0) */}
          <mesh position={[radius, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[tube * 2.5, tube * 5, 8]} />
            <meshStandardMaterial color={active ? activeColor : baseColor} transparent opacity={opacity} />
          </mesh>
      </group>
    </group>
  );
}
