import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

interface RigProps {
  distance?: number;
}

export default function Rig({ distance = 200 }: RigProps) {
  const { camera, mouse } = useThree();
  const vec = new Vector3();

  return useFrame(() => {
    camera.position.lerp(vec.set(-mouse.x, -distance, mouse.y), 0.01);
    camera.lookAt(0, 0, 0);
  });
}
