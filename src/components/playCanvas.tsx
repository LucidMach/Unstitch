import { useState, useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import * as THREE from "three";
import TexTile, { ITEM_SCALE } from "./tex-tile";
import { Button } from "./ui/button";

const PlayCanvas: React.FC = () => {
  const [n, setN] = useState<number>(45);
  const [tiles, setTiles] = useState<[number, number, number][]>([[0, 0, 0]]);
  const [hoverPos, setHoverPos] = useState<[number, number, number] | null>(null);

  // Helper to calculate snapped position from an intersection
  const getSnappedPosition = (
    point: THREE.Vector3,
    face: THREE.Face | null,
    object: THREE.Object3D | null
  ): [number, number, number] | null => {
    const [w, h, d] = ITEM_SCALE;

    // Case 1: Intersecting existing tile (needs face normal logic)
    if (object && face) {
        const normal = face.normal.clone();
        // Transform normal to world space
        const worldNormal = normal.transformDirection(object.matrixWorld).round();
        
        const position = object.parent?.position || new THREE.Vector3(0,0,0);
        let newPos: [number, number, number] = [position.x, position.y, position.z];
        
        if (Math.abs(worldNormal.y) > 0.5) {
           newPos[1] += Math.sign(worldNormal.y) * h;
        } else if (Math.abs(worldNormal.x) > 0.5) {
           newPos[0] += Math.sign(worldNormal.x) * w;
        } else if (Math.abs(worldNormal.z) > 0.5) {
           newPos[2] += Math.sign(worldNormal.z) * d;
        }
        return newPos;
    }

    // Case 2: Ground plane (finer snap)
    // Snap X and Z to nearest multiple of W/1000
    const snapW = w / 1000;
    const snapD = d / 1000;
    const x = Math.round(point.x / snapW) * snapW;
    const z = Math.round(point.z / snapD) * snapD;
    return [x, 0, z];
  };

  // Robust drag detection using refs to avoid async state issues
  const dragStart = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
      dragStart.current = { x: e.clientX, y: e.clientY };
      isDragging.current = false;
  }

  const handlePointerUp = (e: React.PointerEvent) => {
      const dist = Math.sqrt(Math.pow(e.clientX - dragStart.current.x, 2) + Math.pow(e.clientY - dragStart.current.y, 2));
      if (dist > 5) {
          isDragging.current = true;
      }
  }

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (n <= 0) {
          setHoverPos(null);
          return;
      }
      
      // Determine if we hit a tile or ground
      // "e.object" will be the mesh.
      // We can differentiate by checking if it has a parent that is a TexTile?
      // Or just check if the click handler was passed?
      // Actually, R3F events bubble. We can put the handler on the helper components or locally.
      // Let's rely on the arguments passed to this function or check the event target.
      // But wait, "e" in onPointerMove is the intersction.
      
      const pos = getSnappedPosition(e.point, e.face || null, e.object.userData.isGround ? null : e.object);
      setHoverPos(pos);
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (isDragging.current || n <= 0 || !hoverPos) return;
    
    // We can just use the already calculated hoverPos if it's valid and matches the cursor
    // But to be safe and atomic, we can recalculate or just trust hoverPos which updates on move.
    // However, on mobile or fast clicks, hoverPos might lag? 
    // Let's recalculate based on the click event to be robust.
    const pos = getSnappedPosition(e.point, e.face || null, e.object.userData.isGround ? null : e.object);
    
    if (pos) {
        setTiles((prev) => [...prev, pos]);
        setN((prev) => prev - 1);
        // Determine next hover pos immediately? It might be the same spot (stacked) or inside.
        // The mouse hasn't moved, but the geometry changed. 
        // We might want to force an update or wait for next move.
    }
  };

  return (
    <div 
      className="flex flex-col justify-center items-center h-full w-full bg-white/10"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <Canvas
        shadows
        camera={{ position: [0, 300, 0], fov: 45 }}
        className="w-full h-full bg-zinc-50"
      >
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.1} />
        
        <ambientLight intensity={0.7} />
        <directionalLight 
          position={[50, 100, 50]} 
          intensity={1.2} 
          castShadow 
          shadow-mapSize={[1024, 1024]} 
        />
        
        <Grid 
          infiniteGrid 
          cellSize={ITEM_SCALE[0]/10} 
          sectionSize={ITEM_SCALE[0]} 
          fadeDistance={1000} 
          sectionColor="#d1d5db" 
          cellColor="#e5e7eb"
        />

        {/* Invisible ground plane for raycasting */}
        <mesh 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={[0, -0.01, 0]} 
            onClick={handleClick}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverPos(null)}
            userData={{ isGround: true }}
        >
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        <GizmoHelper alignment="top-right" margin={[80, 80]}>
          <GizmoViewcube />
        </GizmoHelper>

        {tiles.map((pos, i) => (
          <TexTile 
            key={i} 
            position={pos} 
            onClick={handleClick}
            onPointerMove={handlePointerMove}
          />
        ))}

        {hoverPos && n > 0 && (
             <TexTile position={hoverPos} ghost />
        )}
      </Canvas>

      
      <Button onClick={
        ()=>window.history.back()
      } className="absolute top-7 hover:bg-pink-100 left-7 bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M16.67 0l2.83 2.829-9.339 9.175 9.339 9.167-2.83 2.829-12.17-11.996z"/></svg></Button>
      <div className="absolute bottom-7 flex gap-4">
        <Button
          variant="secondary"
          className="cursor-pointer hover:bg-pink-100"
          onClick={(e) => {
            e.stopPropagation();
            setTiles([[0, 0, 0]]);
            setN(45);
          }}
        >
          reset
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10-10-4.486-10-10 4.486-10 10-10zm0-2c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm6 16.538l-4.592-4.548 4.546-4.587-1.416-1.403-4.545 4.589-4.588-4.543-1.405 1.405 4.593 4.552-4.547 4.592 1.405 1.405 4.555-4.596 4.591 4.55 1.403-1.416z"/></svg>
        </Button>
        <Button
          variant="secondary"
          className="cursor-pointer hover:bg-pink-100"
          onClick={(e) => {
            e.stopPropagation();
            setTiles((prev) => {
              if (prev.length <= 1) return prev;
              return prev.slice(0, -1);
            });
            setN((prev) => (prev < 45 ? prev + 1 : prev));
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M17.026 22.957c10.957-11.421-2.326-20.865-10.384-13.309l2.464 2.352h-9.106v-8.947l2.232 2.229c14.794-13.203 31.51 7.051 14.794 17.675z"/></svg>
        </Button>
      </div>
    </div>
  );
};

export default PlayCanvas;
