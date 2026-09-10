/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

interface GhostArrowProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

export function GhostArrow({ position, rotation = [0, 0, 0], onClick }: GhostArrowProps) {
  return (
    <group 
      position={position} 
      rotation={rotation} 
      onClick={onClick}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; }}
    >
      {/* Pyramid pointing along Z axis */}
      {/* Rotation Math.PI / 2 on X aligns the cone to point along +Z (default cone points +Y) */}
      {/* Rotate Y by PI/4 to align flat sides with the cardinal directions if desired, or edges. 
          Since 4 segments, it's a square pyramid. */}
      <mesh rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <coneGeometry args={[12, 12, 6]} />
        <meshStandardMaterial color="#A36E93" transparent opacity={0.8} emissive="#A36E93" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

export default GhostArrow;
