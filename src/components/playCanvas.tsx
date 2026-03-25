import { useState, useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import TexTile, { ITEM_SCALE } from "./tex-tile";
import GhostArrow from "./ghost-arrow";
import FoldControl from "./fold-control";
import { Button } from "./ui/button";


const PlayCanvas: React.FC = () => {
  // Store tiles as objects with id, position, and rotation
  type Anchor = { id: string; anchor: string };

  type TileData = {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number];
    arrowRotation?: [number, number, number]; // Extra rotation for the arrow visual
    anchors: Anchor[];
    foldAngle?: number;
  };

  const [tiles, setTiles] = useState<TileData[]>([
    { id: "root", position: [0, 0, 0], rotation: [0, Math.PI / 8, 0], anchors: [] },
  ]);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  
  // Debug State
  const [overlap, setOverlap] = useState<number>(0.61);

  // Constants
  const GHOST_WIDTH = ITEM_SCALE[0] + overlap*29;  
  
  // Major offset (Primary axis direction) - almost full width (touching or small overlap)
  // Let's use 5% overlap for the "non-overlapping" side to keep it tight? Or 0?
  // User said "along X ONLY for...".
  // Let's stick effectively to touching (distance ~ width).
  // Dynamic calculation based on state
  const OFFSET_MAJOR = GHOST_WIDTH * (1 - overlap / 10); 
  // Minor offset (Secondary axis overlap) - dynamic overlap
  const OFFSET_MINOR = GHOST_WIDTH * (1 - overlap);

  // Helper to generate ghost tiles for a selected tile
  // Now returns objects that include the 'anchor' that would be created
  const getGhostTiles = (parent: TileData): (TileData & { sourceAnchor: Anchor })[] => {
    const { position: p, rotation: r } = parent;
    
    // Pinwheel / Woven Pattern
    // North/South neighbors have specific X overlap
    // East/West neighbors have specific Z overlap
    
    // For arrows: We need to point AWAY from the parent center.
    // The visual rotation of the arrow should align with the offset vector? 
    // Or just consistent cardinal directions relative to parent?
    // Let's calculate the angle of the offset.
    
    // Mapping:
    // Right (+X) -> 'd'
    // Up (-Z) -> 'w'  (Note: standard 3D "forward" is often -Z, "up" on screen logic)
    // Left (-X) -> 'a'
    // Down (+Z) -> 's'
    
    // Determine which offset corresponds to which "local" cardinal direction?
    // 4. North-ish (-Z local) -> 'w'
    //    Let's stick to the User request: "w for up", "s for down", "d for right", "a for left".
    //    In 3D (Top View, camera pos y>0, looking at 0,0,0), +X is Right, -X is Left, +Z is Down, -Z is Up.
    //    We now IGNORE parent rotation for the ghost placement (World Space).
    
    const offsets = [
        // 1. World East (+X) -> 'd'
        { x: OFFSET_MAJOR, z: 0, rot: -Math.PI / 2, anchor: 'd' }, 
        
        // 2. World South (+Z) -> 's'
        { x: 0, z: OFFSET_MAJOR, rot: Math.PI / 2, anchor: 's' },
        
        // 3. World West (-X) -> 'a'
        { x: -OFFSET_MAJOR, z: 0, rot: -Math.PI / 2, anchor: 'a' },
        
        // 4. World North (-Z) -> 'w'
        { x: 0, z: -OFFSET_MAJOR, rot: Math.PI / 2, anchor: 'w' },
    ];

    const ghosts: (TileData & { sourceAnchor: Anchor })[] = [];

    // Parent rotation around Y axis (Used for new tile rotation, but NOT for ghost position)
    const parentRotY = r[1]; 

    offsets.forEach((offset, index) => {
        // World Offset directly
        const dx = offset.x; 
        const dz = offset.z;

        const newPos: [number, number, number] = [
            p[0] + dx,
            p[1], // Keep same Y
            p[2] + dz
        ];

        // New rotation is parent rotation + offset rotation
        const newRot: [number, number, number] = [
            r[0],
            parentRotY + offset.rot,
            r[2]
        ];
        
        // Calculate Arrow Rotation
        const arrowAngle = Math.atan2(dx, dz);
        const arrowRot: [number, number, number] = [0, arrowAngle, 0];

        // Check if a tile already exists roughly at this position to avoid duplicates
        const exists = tiles.some(t => {
            const dx = t.position[0] - newPos[0];
            const dz = t.position[2] - newPos[2];
            return (dx * dx + dz * dz) < 1;
        });

        // Check if parent already has this anchor? (Optional: prevent duplicate connections)
        const parentHasAnchor = parent.anchors.some(a => a.anchor === offset.anchor);

        if (!exists && !parentHasAnchor) {
             ghosts.push({
                 id: `ghost-${parent.id}-${index}`,
                 position: newPos,
                 rotation: newRot,
                 arrowRotation: arrowRot,
                 anchors: [], // Ghost starts empty
                 sourceAnchor: { id: parent.id, anchor: offset.anchor }
             });
        }
    });

    return ghosts;
  };

  // Robust drag detection
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

  const handleTileClick = (e: ThreeEvent<MouseEvent>, tileId: string) => {
      e.stopPropagation();
      if (isDragging.current) return;
      setSelectedTileId(tileId);
  };

  const handleGhostClick = (e: ThreeEvent<MouseEvent>, ghost: TileData & { sourceAnchor: Anchor }) => {
      e.stopPropagation();
      if (isDragging.current) return;
      
      const newTileId = crypto.randomUUID();
      
      // Parse sourceAnchor: object { id, anchor }
      const parentId = ghost.sourceAnchor.id;
      const parentAnchorChar = ghost.sourceAnchor.anchor;

      // User Logic:
      // Down ('s') -> 'w'
      // Right ('d') -> 'a'
      // Left ('a') -> 'd'
      // Up ('w') -> 's'
      const reciprocalMap: Record<string, string> = { 
          's': 'w', 
          'd': 'a', 
          'a': 'd', 
          'w': 's' 
      };
      
      const newTileAnchorChar = reciprocalMap[parentAnchorChar];
      
      setTiles(prev => {
          // Update Parent
          const newTiles = prev.map(t => {
              if (t.id === parentId) { 
                  return { ...t, anchors: [...t.anchors, { id: newTileId, anchor: parentAnchorChar }] };
              }
              return t;
          });
          
          // Add New Tile
          newTiles.push({ 
              ...ghost, 
              id: newTileId,
              anchors: [{ id: parentId, anchor: newTileAnchorChar }] // Initialize with reciprocal connection
          });
          
          return newTiles;
      });
      
      setSelectedTileId(newTileId); // Auto-select the new tile
  };

  const handleBackgroundClick = (e: ThreeEvent<MouseEvent>) => {
      // e.stopPropagation(); // Don't stop propagation if we want other things to handle it, but here it's fine
      if (isDragging.current) return;
      setSelectedTileId(null);
  };

  const updateFoldAngle = (tileId: string, angle: number) => {
      setTiles(prev => prev.map(t => t.id === tileId ? { ...t, foldAngle: angle } : t));
  };

  const selectedTile = tiles.find(t => t.id === selectedTileId);
  const ghostTiles = selectedTile ? getGhostTiles(selectedTile) : [];

  return (
    <div 
      className="flex flex-col justify-center items-center h-full w-full bg-white/10 relative"
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

        {/* Ground plane mainly for deselection */}
        <mesh 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={[0, -0.01, 0]} 
            onClick={handleBackgroundClick}
        >
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        <GizmoHelper alignment="top-right" margin={[80, 80]}>
          <GizmoViewcube />
        </GizmoHelper>

        {tiles.map((tile) => {
          let hingeOffset: [number, number, number] = [0, 0, 0];
          let hingeRotationAxis: [number, number, number] = [1, 0, 0];
          const foldAngle = tile.foldAngle || 0;
          const isLeaf = tile.anchors.length === 1 && tile.id !== "root";
          
          if (isLeaf) {
              const anchor = tile.anchors[0].anchor;
              if (anchor === 'w') {
                  hingeOffset = [0, 0, -OFFSET_MAJOR / 2];
                  hingeRotationAxis = [1, 0, 0];
              } else if (anchor === 's') {
                  hingeOffset = [0, 0, OFFSET_MAJOR / 2];
                  hingeRotationAxis = [-1, 0, 0];
              } else if (anchor === 'a') {
                  hingeOffset = [-OFFSET_MAJOR / 2, 0, 0];
                  hingeRotationAxis = [0, 0, -1];
              } else if (anchor === 'd') {
                  hingeOffset = [OFFSET_MAJOR / 2, 0, 0];
                  hingeRotationAxis = [0, 0, 1];
              }
          }

          const hingeRot: [number, number, number] = [
              hingeRotationAxis[0] * foldAngle,
              hingeRotationAxis[1] * foldAngle,
              hingeRotationAxis[2] * foldAngle
          ];

          return (
            <group key={tile.id} position={tile.position}>
                <group position={hingeOffset} rotation={hingeRot}>
                    <group position={[-hingeOffset[0], -hingeOffset[1], -hingeOffset[2]]}>
                        <TexTile 
                          rotation={tile.rotation}
                          selected={tile.id === selectedTileId}
                          onClick={(e) => handleTileClick(e, tile.id)}
                        />
                    </group>
                    {isLeaf && (
                        <FoldControl 
                            axis={hingeRotationAxis} 
                            angle={foldAngle} 
                            onFold={(angle) => updateFoldAngle(tile.id, angle)} 
                        />
                    )}
                </group>
            </group>
          );
        })}

        {ghostTiles.map((ghost) => (
             <GhostArrow
                key={ghost.id}
                position={ghost.position}
                rotation={ghost.arrowRotation}
                onClick={(e) => handleGhostClick(e, ghost)}
             />
        ))}
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
            setTiles([{ id: "root", position: [0, 0, 0], rotation: [0, Math.PI / 8, 0], anchors: [] }]);
            setSelectedTileId(null);
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
              const newTiles = prev.slice(0, -1);
              // If we removed the selected tile, deselect
              if (selectedTileId && !newTiles.find(t => t.id === selectedTileId)) {
                  setSelectedTileId(null);
              }
              return newTiles;
            });
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M17.026 22.957c10.957-11.421-2.326-20.865-10.384-13.309l2.464 2.352h-9.106v-8.947l2.232 2.229c14.794-13.203 31.51 7.051 14.794 17.675z"/></svg>
        </Button>
      </div>
      
      {/* {selectedTile && (
        <div className="absolute top-4 left-4 bg-black/80 text-white p-4 rounded-lg font-mono text-xs w-64 whitespace-pre-wrap pointer-events-none">
            {JSON.stringify(selectedTile, (key, value) => {
                if (key === 'position' || key === 'rotation') {
                    return value.map((n: number) => Number(n.toFixed(2)));
                }
                return value;
            }, 2)}
        </div>
      )} */}
    </div>
  );
};

export default PlayCanvas;
