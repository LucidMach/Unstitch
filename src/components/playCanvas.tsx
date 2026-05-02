import { useState, useRef } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import TexTile, { ITEM_SCALE } from "./tex-tile";
import GhostArrow from "./ghost-arrow";
import FoldControl from "./fold-control";
import { Button } from "./ui/button";


const PlayCanvas: React.FC = () => {
  type TileData = {
    id: string;
    position: [number, number, number];
    rotation: [number, number, number];
    arrowRotation?: [number, number, number]; // Extra rotation for the arrow visual
    
    parentId: string | null;
    parentAnchor: string | null;
    localAnchor: string | null;
    children: Partial<Record<string, string>>;
    foldAngle: number;
  };

  const [tiles, setTiles] = useState<TileData[]>([
    { 
      id: "root", 
      position: [0, 0, 0], 
      rotation: [0, Math.PI / 8, 0], 
      parentId: null,
      parentAnchor: null,
      localAnchor: null,
      children: {},
      foldAngle: 0 
    },
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
  const getGhostTiles = (parent: TileData): (TileData & { sourceAnchor: { id: string; anchor: string } })[] => {
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

    const ghosts: (TileData & { sourceAnchor: { id: string; anchor: string } })[] = [];

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
        const parentHasAnchor = !!parent.children[offset.anchor];

        if (!exists && !parentHasAnchor) {
             ghosts.push({
                 id: `ghost-${parent.id}-${index}`,
                 position: newPos,
                 rotation: newRot,
                 arrowRotation: arrowRot,
                 parentId: null,
                 parentAnchor: null,
                 localAnchor: null,
                 children: {},
                 foldAngle: 0,
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

  const handleGhostClick = (e: ThreeEvent<MouseEvent>, ghost: TileData & { sourceAnchor: { id: string; anchor: string } }) => {
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
                  return { ...t, children: { ...t.children, [parentAnchorChar]: newTileId } };
              }
              return t;
          });
          
          // Add New Tile
          newTiles.push({ 
              ...ghost, 
              id: newTileId,
              parentId: parentId,
              parentAnchor: parentAnchorChar,
              localAnchor: newTileAnchorChar,
              children: {},
              foldAngle: 0
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
      const snapPoints = [-Math.PI, -Math.PI/2, -Math.PI/4, 0, Math.PI/4, Math.PI/2, Math.PI];
      const snapThreshold = 0.1; // ~5.7 degrees
      let snappedAngle = angle;
      for (const snap of snapPoints) {
          if (Math.abs(angle - snap) < snapThreshold) {
              snappedAngle = snap;
              break;
          }
      }
      setTiles(prev => prev.map(t => t.id === tileId ? { ...t, foldAngle: snappedAngle } : t));
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

        {(() => {
          const renderTileNode = (tile: TileData, localPos: [number, number, number]) => {
              const childrenNodes = Object.values(tile.children)
                  .map(childId => tiles.find(t => t.id === childId))
                  .filter((t): t is TileData => t !== undefined);
                  
              let hingeOffset: [number, number, number] = [0, 0, 0];
              let hingeRotationAxis: [number, number, number] = [1, 0, 0];
              const foldAngle = tile.foldAngle;
              const isRoot = tile.id === "root";
              const isLeaf = childrenNodes.length === 0 && !isRoot;
              
              if (!isRoot && tile.localAnchor) {
                  const anchor = tile.localAnchor;
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

              const hiddenWorldAnchors: string[] = [];
              // If this tile is folding relative to its parent
              if (Math.abs(foldAngle) > 0.01 && tile.localAnchor) {
                  hiddenWorldAnchors.push(tile.localAnchor);
              }
              // If any children are folding relative to this tile
              for (const child of childrenNodes) {
                  if (Math.abs(child.foldAngle) > 0.01 && child.parentAnchor) {
                      hiddenWorldAnchors.push(child.parentAnchor);
                  }
              }

              const hiddenMeshes: string[] = [];
              if (hiddenWorldAnchors.length > 0) {
                  const relativeRot = tile.rotation[1] - Math.PI / 8;
                  let k = Math.round(relativeRot / (Math.PI / 2)) % 4;
                  if (k < 0) k += 4;
                  const map: Record<number, Record<string, string>> = {
                      0: { 'w': 'A', 's': 'D', 'a': 'W', 'd': 'S' },
                      1: { 'w': 'S', 's': 'W', 'a': 'A', 'd': 'D' },
                      2: { 'w': 'D', 's': 'A', 'a': 'S', 'd': 'W' },
                      3: { 'w': 'W', 's': 'S', 'a': 'D', 'd': 'A' }
                  };
                  hiddenWorldAnchors.forEach(wa => {
                      const localMesh = map[k][wa];
                      if (localMesh) hiddenMeshes.push(localMesh);
                  });
              }

              return (
                <group key={tile.id} position={localPos}>
                    <group position={hingeOffset} rotation={hingeRot}>
                        <group position={[-hingeOffset[0], -hingeOffset[1], -hingeOffset[2]]}>
                            <TexTile 
                              rotation={tile.rotation}
                              selected={tile.id === selectedTileId}
                              hiddenMeshes={hiddenMeshes}
                              onClick={(e) => handleTileClick(e, tile.id)}
                            />
                            {childrenNodes.map(child => {
                                const childLocalPos: [number, number, number] = [
                                    child.position[0] - tile.position[0],
                                    child.position[1] - tile.position[1],
                                    child.position[2] - tile.position[2],
                                ];
                                return renderTileNode(child, childLocalPos);
                            })}
                            {tile.id === selectedTileId && ghostTiles.map(ghost => (
                                 <GhostArrow 
                                     key={ghost.id}
                                     position={[ghost.position[0] - tile.position[0], 0, ghost.position[2] - tile.position[2]]}
                                     rotation={ghost.arrowRotation}
                                     onClick={(e) => handleGhostClick(e, ghost)}
                                 />
                            ))}
                        </group>
                        {isLeaf && tile.id === selectedTileId && (
                            <FoldControl 
                                axis={hingeRotationAxis} 
                                angle={foldAngle} 
                                onFold={(angle) => updateFoldAngle(tile.id, angle)} 
                            />
                        )}
                    </group>
                </group>
              );
          };
          const rootTile = tiles.find(t => t.id === "root");
          return rootTile ? renderTileNode(rootTile, [0, 0, 0]) : null;
        })()}

 
      </Canvas>

      
      <Button onClick={
        ()=>window.history.back()
      } className="absolute top-7 hover:bg-pink-100 left-7 bg-white/10"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M16.67 0l2.83 2.829-9.339 9.175 9.339 9.167-2.83 2.829-12.17-11.996z"/></svg></Button>
      
      {/* Fold Angle Slider Overlay */}
      {selectedTile && Object.keys(selectedTile.children).length === 0 && selectedTile.id !== "root" && (
        <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-white/90 shadow-lg backdrop-blur-sm px-6 pb-6 pt-4 rounded-2xl flex items-start gap-4 border border-zinc-200 z-10 pointer-events-auto">
          <span className="text-sm font-medium text-zinc-700 w-20 pt-1">
            Angle: {Math.round(((selectedTile.foldAngle || 0) * 180) / Math.PI)}°
          </span>
          <div className="relative w-64 flex flex-col">
            <input
              type="range"
              min={-(99 * Math.PI) / 180}
              max={(99 * Math.PI) / 180}
              step={0.01}
              value={selectedTile.foldAngle || 0}
              onChange={(e) => updateFoldAngle(selectedTile.id, parseFloat(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer relative z-10"
            />
            <div className="absolute top-5 left-0 right-0 h-6 mx-[6px]">
              {[
                { label: '-90', val: -Math.PI / 2 },
                { label: '-45', val: -Math.PI / 4 },
                { label: '0', val: 0 },
                { label: '45', val: Math.PI / 4 },
                { label: '90', val: Math.PI / 2 },
              ].map(pt => {
                const MAX_ANGLE = (100 * Math.PI) / 180;
                const percent = ((pt.val + MAX_ANGLE) / (2 * MAX_ANGLE)) * 100;
                return (
                  <div
                    key={pt.label}
                    className="absolute flex flex-col items-center cursor-pointer -translate-x-1/2 group"
                    style={{ left: `${percent}%` }}
                    onClick={() => updateFoldAngle(selectedTile.id, pt.val)}
                  >
                    <div className="w-[2px] h-2 bg-zinc-300 rounded mb-1 group-hover:bg-blue-500 transition-colors"></div>
                    <span className="text-[10px] text-zinc-500 font-medium select-none group-hover:text-blue-600 transition-colors">
                      {pt.label}°
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-7 flex gap-4">
        <Button
          variant="secondary"
          className="cursor-pointer hover:bg-pink-100"
          onClick={(e) => {
            e.stopPropagation();
            setTiles([{ 
              id: "root", 
              position: [0, 0, 0], 
              rotation: [0, Math.PI / 8, 0], 
              parentId: null,
              parentAnchor: null,
              localAnchor: null,
              children: {},
              foldAngle: 0 
            }]);
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
