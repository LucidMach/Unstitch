import * as THREE from "three";
import { type JSX } from "react";
import { useGLTF, Outlines, Edges } from "@react-three/drei";
import type { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    Unit: THREE.Mesh;
    S: THREE.Mesh;
    W: THREE.Mesh;
    D: THREE.Mesh;
    A: THREE.Mesh;
  };
  materials: {
    Material: THREE.MeshStandardMaterial;
  };
};

export const ITEM_SCALE: [number, number, number] = [34.623, 0.49, 34.623];

export function TexTile({ ghost = false, selected = false, ...props }: JSX.IntrinsicElements["group"] & { ghost?: boolean; selected?: boolean }) {
  // Cast to unknown first because GLTF & ObjectMap (implicit return) doesn't suffiently overlap with the strict GLTFResult type
  const { nodes, materials } = useGLTF("/Textile-Components.glb") as unknown as GLTFResult;

  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: "#ec4899",
    transparent: true,
    opacity: 0.5,
  });

  const components = [nodes.Unit, nodes.S, nodes.W, nodes.D, nodes.A];

  return (
    <group {...props} dispose={null}>
      {components.map((node, index) => (
        <mesh
          key={index}
          castShadow={!ghost}
          receiveShadow={!ghost}
          geometry={node.geometry}
          material={ghost ? ghostMaterial : materials.Material}
          position={[0, 0, 0]}
          rotation={[0, Math.PI / 8, Math.PI]}
          scale={[34.623, 0.49, 34.623]}
        />
      ))}
      {selected && (
        <mesh
          position={[0, 0, 0]}
          rotation={[0, Math.PI / 8, Math.PI]}
          scale={[34.623, 0.49, 34.623]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <Edges color="hotpink" scale={2.1} />
        </mesh>
      )}
    </group>
  );
}

useGLTF.preload("/Textile-Components.glb");
export default TexTile;
