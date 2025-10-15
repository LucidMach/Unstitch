import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import Rig from "./Rig";
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

    setInterval(() => {
      setColor((prev) => (prev >= 360 ? 0 : prev + 1));
    }, 3000);
  }, []);

  return (
    <div className="flex flex-col justify-center items-center">
      <Canvas
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: h,
          width: w,
        }}
        camera={{ position: [0, -200, 0] }}
      >
        <directionalLight color={"blue"} position={[0, 0, 0]} intensity={10} />
        <Rig />
        <TexTile position={[0, 0, 0]} />
      </Canvas>
      <h1 className="absolute bottom-14">assets loading...</h1>
      <button className="absolute bottom-10 text-gray-400">
        ps: this square follows your mouse
      </button>
    </div>
  );
};

export default R3F;
