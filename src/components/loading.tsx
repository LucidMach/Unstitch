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
  const [n, setN] = useState<number>(45);
  const [tiles, setTiles] = useState<[number, number, number][]>([[0, 0, 0]]);

  useEffect(() => {
    const interval = setInterval(() => {
      setN((prev) => prev - 1);
      setTiles((prev) => {
        if (prev.length === 0) return prev;
        
        const lastTile = prev[prev.length - 1];
        // Calculate a sequential direction. We spiral out.
        // Calculate a sequential direction with slight variation.
        // Change angle by a fixed amount + random variation.
        const angleStep = 0.5 + (Math.random() - 0.5) * 0.2; 
        const currentAngle = prev.length * angleStep;
        const stepSize = 45; // Must be larger than tile size (~35)
        
        const nextX = lastTile[0] + Math.cos(currentAngle) * stepSize;
        const nextZ = lastTile[2] + Math.sin(currentAngle) * stepSize;
        
        const newTile: [number, number, number] = [nextX, 0, nextZ];
        return [...prev, newTile];
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
        <Rig distance={200 * 1.2} />
        {tiles.map((pos, i) => (
          <TexTile key={i} position={pos} />
        ))}
      </Canvas>
      {/* <div className="absolute top-14 text-gray-400">
        ps: this square follows your {w > 600 ? "cursor" : "finger"}
      </div> */}
      <h1 className="absolute md:text-2xl top-20">what can you make with {n} more of these?</h1>
      <Button
        className="z-10 absolute bottom-7 cursor-pointer"
        onClick={() => setSkip(true)}
      >
        skip
      </Button>
    </div>
  );
};

export default Loading;
