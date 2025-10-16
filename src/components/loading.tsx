import { useEffect, useState, type JSX } from "react";
import { Canvas } from "@react-three/fiber";
import Rig from "./Rig";
import TexTile from "./tex-tile";
import { Button } from "./ui/button";

interface Props {
  children: React.ReactNode;
}

const Loading: React.FC<Props> = ({ children }) => {
  const [skip, setSkip] = useState<boolean>(false);
  const [w, setW] = useState<number>(0);
  const [h, setH] = useState<number>(0);

  useEffect(() => {
    setTimeout(() => setSkip(true), 5000);
    setW(window.innerWidth);
    setH(window.innerHeight);

    window.addEventListener("resize", () => {
      setW(window.innerWidth);
      setH(window.innerHeight);
    });
  }, []);

  return skip ? (
    <>{children}</>
  ) : (
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
        <Rig />
        <TexTile position={[0, 0, 0]} />
      </Canvas>
      <h1 className="absolute bottom-14">assets loading...</h1>
      <div className="absolute bottom-10 text-gray-400">
        ps: this square follows your mouse
      </div>
      <Button
        className="mt-4 z-10 cursor-pointer"
        onClick={() => setSkip(true)}
      >
        skip
      </Button>
    </div>
  );
};

export default Loading;
