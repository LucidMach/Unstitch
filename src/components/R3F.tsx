import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Rig from "./Rig";
import { OrbitControls } from "@react-three/drei";
import TexTile from "./tex-tile";

const R3F = () => {
  const [color, setColor] = useState<number>(0);
  const [w, setW] = useState<number>(0);
  const [h, setH] = useState<number>(0);

  useEffect(() => {
    setW(window.innerWidth);
    setH(window.innerHeight);

    window.addEventListener("resize", () => {
      setW(window.innerWidth);
      setH(window.innerHeight);
    });
  }, []);

  return (
    <>
      <Canvas
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: h,
          width: w,
        }}
        camera={{ position: [0, -200, 0] }}
        // onClick={() =>
        // setColor((color) => (color < colors.length - 1 ? color + 1 : 0))
        // (window.location.href = "/blog")
        // }
      >
        <directionalLight color={"blue"} position={[0, 0, 0]} intensity={10} />
        <Rig />
        <TexTile position={[0, 0, 0]} />
      </Canvas>
    </>
  );
};

export default R3F;
