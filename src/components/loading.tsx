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
  const [tiles, setTiles] = useState<[number, number, number][]>([[0, 0, 0]]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTiles((prev) => {
        let newTile: [number, number, number] | null = null;
        // Try up to 50 times to find a non-overlapping position
        for (let i = 0; i < 50; i++) {
          const candidate: [number, number, number] = [
            (Math.random() - 0.5) * 100,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 100,
          ];
          
          const hasOverlap = prev.some((p) => {
            const dx = Math.abs(p[0] - candidate[0]);
            const dy = Math.abs(p[1] - candidate[1]);
            const dz = Math.abs(p[2] - candidate[2]);
            // Bounds check: ~40 units width/depth (rotated tile), ~1 unit height
            return dx < 40 && dz < 40 && dy < 1.5;
          });

          if (!hasOverlap) {
            newTile = candidate;
            break;
          }
        }
        return newTile ? [...prev, newTile] : prev;
      });
    }, 740);
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
        <Rig />
        {tiles.map((pos, i) => (
          <TexTile key={i} position={pos} />
        ))}
      </Canvas>
      {/* <div className="absolute top-14 text-gray-400">
        ps: this square follows your {w > 600 ? "cursor" : "finger"}
      </div> */}
      <h1 className="absolute md:text-2xl top-20">what can you make with 45 more of these?</h1>
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
