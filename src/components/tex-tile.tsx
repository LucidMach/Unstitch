import * as THREE from "three";
import React, { useRef, type JSX } from "react";
import { useGLTF } from "@react-three/drei";
import type { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    Unit: THREE.Mesh;
    Plane001: THREE.Mesh;
    Plane002: THREE.Mesh;
    Plane003: THREE.Mesh;
    Plane004: THREE.Mesh;
    Plane005: THREE.Mesh;
    Plane006: THREE.Mesh;
  };
  materials: {};
};

export function TexTile(props: JSX.IntrinsicElements["group"]) {
  const { nodes, materials } = useGLTF("/Textile.glb") as unknown as GLTFResult;
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Unit.geometry}
        material={nodes.Unit.material}
        position={[0, -14, 0]}
        scale={[34.623, 0.49, 34.623]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Plane001.geometry}
        material={nodes.Plane001.material}
        position={[6.411, -13.573, 28.688]}
        rotation={[-Math.PI / 2, 0, 0.802]}
        scale={[8.898, 1, 1]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Plane002.geometry}
        material={nodes.Plane002.material}
        position={[-28.688, -13.573, -6.571]}
        rotation={[-Math.PI / 2, 0, 0.802]}
        scale={[8.898, 1, 1]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Plane003.geometry}
        material={nodes.Plane003.material}
        position={[-6.411, -13.573, -28.688]}
        rotation={[-Math.PI / 2, 0, 0.802]}
        scale={[8.898, 1, 1]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Plane004.geometry}
        material={nodes.Plane004.material}
        position={[-17.343, -13.573, 17.811]}
        rotation={[-Math.PI / 2, 0, -0.8]}
        scale={[8.898, 1, 1]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Plane005.geometry}
        material={nodes.Plane005.material}
        position={[17.448, -13.573, -17.381]}
        rotation={[-Math.PI / 2, 0, -0.8]}
        scale={[8.898, 1, 1]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Plane006.geometry}
        material={nodes.Plane006.material}
        position={[28.688, -13.573, 6.571]}
        rotation={[-Math.PI / 2, 0, 0.802]}
        scale={[8.898, 1, 1]}
      />
    </group>
  );
}

useGLTF.preload("/Textile.glb");
export default TexTile;
