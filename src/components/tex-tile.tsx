import * as THREE from "three";
import { type JSX } from "react";
import { useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    Unit: THREE.Mesh;
  };
  materials: {
    Material: THREE.MeshStandardMaterial;
  };
};

export const ITEM_SCALE: [number, number, number] = [34.623, 0.49, 34.623];

export function TexTile({ ghost = false, ...props }: JSX.IntrinsicElements["group"] & { ghost?: boolean }) {
  const { nodes, materials } = useGLTF("/Textile.glb");

  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: "#ec4899",
    transparent: true,
    opacity: 0.5,
  });

  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow={!ghost}
        receiveShadow={!ghost}
        geometry={(nodes.Unit as THREE.Mesh).geometry}
        material={ghost ? ghostMaterial : materials.Material}
        position={[0, 0, 0]}
        rotation={[0, Math.PI / 8, Math.PI]}
        scale={[34.623, 0.49, 34.623]}
      />
    </group>
  );
}

useGLTF.preload("/Textile.glb");
export default TexTile;
