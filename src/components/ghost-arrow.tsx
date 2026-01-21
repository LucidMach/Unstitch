import * as THREE from "three";
import { type ThreeEvent } from "@react-three/fiber";

interface GhostArrowProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

export function GhostArrow({ position, rotation = [0, 0, 0], onClick }: GhostArrowProps) {
  return (
    <group position={position} rotation={rotation} onClick={onClick}>
      {/* Pyramid pointing along Z axis */}
      {/* Rotation Math.PI / 2 on X aligns the cone to point along +Z (default cone points +Y) */}
      {/* Rotate Y by PI/4 to align flat sides with the cardinal directions if desired, or edges. 
          Since 4 segments, it's a square pyramid. */}
      <mesh rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <coneGeometry args={[8, 8, 4]} />
        <meshStandardMaterial color="#ec4899" transparent opacity={0.6} emissive="#ec4899" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

export default GhostArrow;
