import * as THREE from "three";
import { useEffect, useRef, type JSX } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import type { GLTF } from "three-stdlib";

type GLTFResult = GLTF & {
  nodes: {
    Bag: THREE.Mesh;
  };
  materials: {};
};

export function Showcase(props: JSX.IntrinsicElements["group"]) {
  const { nodes, animations, scene } = useGLTF(
    "/Bag.glb"
  ) as unknown as GLTFResult;
  const { actions, names } = useAnimations(animations, scene);

  //   Use a useEffect hook to play the animation when the component mounts
  useEffect(() => {
    //   Play the first animation in the list
    if (actions) {
      console.log("Playing animation:", names);
      //   actions[names[0]]?.play();
    }
  }, [actions]);

  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={(nodes.Bag as THREE.Mesh).geometry}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

useGLTF.preload("/Bag.glb");
