import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { useState } from "react";

interface BaseControlProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

export default function BaseControl({ position, rotation, onClick }: BaseControlProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <group 
        position={position} 
        rotation={rotation || [0,0,0]}
        onClick={onClick}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'auto'; }}
    >
        <mesh position={[0, 2, 0]}>
            <sphereGeometry args={[2, 16, 16]} />
            <meshStandardMaterial color={hovered ? "#ec4899" : "#fbcfe8"} />
        </mesh>
        <Text
            position={[0, 5, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={2}
            color={hovered ? "#db2777" : "#ec4899"}
            anchorX="center"
            anchorY="middle"
        >
            SET BASE
        </Text>
    </group>
  );
}
