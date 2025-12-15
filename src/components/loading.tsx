import { useEffect, useState, type JSX, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import Rig from "./Rig";
import TexTile from "./tex-tile";
import { Button } from "./ui/button";

interface Props {
  children: React.ReactNode;
}

// Helper to handle spawning from DOM clicks
function Spawner({ lastClick, onSpawn }: { lastClick: { x: number, y: number } | null, onSpawn: (pos: [number, number, number]) => void }) {
  const { camera, gl } = useThree();
  const prevClick = useRef<{ x: number, y: number } | null>(null);

  useEffect(() => {
    if (!lastClick || lastClick === prevClick.current) return;
    prevClick.current = lastClick;

    // Convert mouse event coords to Normalized Device Coordinates (-1 to +1)
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((lastClick.x - rect.left) / rect.width) * 2 - 1;
    const y = -((lastClick.y - rect.top) / rect.height) * 2 + 1;

    // Raycast to find intersection with Y=0 plane
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    
    // Plane: normal (0, 1, 0), constant 0
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    
    if (raycaster.ray.intersectPlane(plane, target)) {
        onSpawn([target.x, target.y, target.z]);
    }
  }, [lastClick, camera, gl, onSpawn]);

  return null;
}

const Loading: React.FC<Props> = ({ children }) => {
  const [skip, setSkip] = useState<boolean>(false);
  const [w, setW] = useState<number>(0);
  const [h, setH] = useState<number>(0);
  const [n, setN] = useState<number>(45);
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [clickEvent, setClickEvent] = useState<{ x: number; y: number } | null>(null);
  const [tiles, setTiles] = useState<[number, number, number][]>([[0, 0, 0]]);


  useEffect(() => {
    // 15s Countdown
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setW(window.innerWidth);
    setH(window.innerHeight);

    const onResize = () => {
      setW(window.innerWidth);
      setH(window.innerHeight);
    };

    window.addEventListener("resize", onResize);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return skip ? (
    <>{children}</>
  ) : (
    <div 
      className="flex flex-col justify-center items-center w-full h-full"
      onClick={(e) => {
        setClickEvent({ x: e.clientX, y: e.clientY });
      }}
    >
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
        <Spawner 
          lastClick={clickEvent} 
          onSpawn={(pos) => {
            setTiles((prev) => [...prev, pos]);
            setN((prev) => prev - 1);
          }} 
        />
        {tiles.map((pos, i) => (
          <TexTile key={i} position={pos} />
        ))}
      </Canvas>
      {/* <div className="absolute top-14 text-gray-400">
        ps: this square follows your {w > 600 ? "cursor" : "finger"}
      </div> */}
      <h1 className="absolute text-sm md:text-2xl top-14">what can you make with {n} more of these in <span className="text-pink-400">{timeLeft}</span>s?</h1>
      <h1 className="absolute text-xs md:text-xl top-21 text-gray-400">click anywhere on the screen to spawn another tile</h1>
      <div className="z-10 absolute bottom-7 flex gap-4">
        <Button
          variant="secondary"
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setTiles((prev) => {
              if (prev.length <= 1) return prev;
              return prev.slice(0, -1);
            });
            setN((prev) => (prev < 45 ? prev + 1 : prev));
          }}
        >
          undo
        </Button>
        <Button
          variant="secondary"
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setTiles([[0, 0, 0]]);
            setN(45);
          }}
        >
          reset
        </Button>
        <Button
          className="cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setSkip(true);
          }}
        >
          skip
        </Button>
      </div>
    </div>
  );
};

export default Loading;
