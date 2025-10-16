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

export function TexTile(props: JSX.IntrinsicElements["group"]) {
  const { nodes, materials } = useGLTF("/Textile.glb");

  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={(nodes.Unit as THREE.Mesh).geometry}
        material={materials.Material}
        position={[0, 0, 0]}
        rotation={[0, Math.PI / 8, Math.PI]}
        scale={[34.623, 0.49, 34.623]}
      />
    </group>
  );
}

useGLTF.preload("/Textile.glb");
export default TexTile;
