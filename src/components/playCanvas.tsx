import { useState, useRef, useEffect } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import TexTile, { ITEM_SCALE } from "./tex-tile";
import GhostArrow from "./ghost-arrow";
import FoldControl from "./fold-control";
import { Button } from "./ui/button";
import ActionBar from "./action-bar";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, Save, FolderOpen, Trash2, X, Plus } from "lucide-react";

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
  const [history, setHistory] = useState<TileData[][]>([]);
  const [redoStack, setRedoStack] = useState<TileData[][]>([]);
  const [activeRootHinge, setActiveRootHinge] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
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

  const recordMove = () => {
    setHistory(prev => [tiles, ...prev].slice(0, 10));
    setRedoStack([]);
  };

  const handleTileClick = (e: ThreeEvent<MouseEvent>, tileId: string) => {
      e.stopPropagation();
      if (isDragging.current) return;
      setSelectedTileId(tileId);
      if (tileId !== "root") {
          setActiveRootHinge(null);
      }
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
      
      recordMove();
      
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
      setActiveRootHinge(null);
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

  const deleteTile = (tileId: string) => {
    if (tileId === "root") return; // Cannot delete root
    
    recordMove();

    setTiles(prev => {
        const toDelete = new Set<string>();
        const collectDescendants = (id: string) => {
            toDelete.add(id);
            const t = prev.find(tile => tile.id === id);
            if (t) {
                Object.values(t.children).forEach(childId => {
                    if (childId) collectDescendants(childId);
                });
            }
        };
        collectDescendants(tileId);

        return prev
            .filter(t => !toDelete.has(t.id))
            .map(t => {
                // If this tile was the parent of the deleted tile, remove it from children
                const updatedChildren = { ...t.children };
                let changed = false;
                Object.entries(updatedChildren).forEach(([dir, childId]) => {
                    if (childId === tileId) {
                        delete updatedChildren[dir];
                        changed = true;
                    }
                });
                return changed ? { ...t, children: updatedChildren } : t;
            });
    });
    setSelectedTileId(null);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[0];
    setRedoStack(prev => [tiles, ...prev].slice(0, 5));
    setHistory(prev => prev.slice(1));
    setTiles(previous);
    setSelectedTileId(null);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory(prev => [tiles, ...prev].slice(0, 5));
    setRedoStack(prev => prev.slice(1));
    setTiles(next);
    setSelectedTileId(null);
  };

  const [showHelp, setShowHelp] = useState(false);
  const [typedAngle, setTypedAngle] = useState<string | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string; timestamp: number }[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    
    // Load projects index
    const index = localStorage.getItem('unstitch_projects_index');
    if (index) {
      try {
        setProjects(JSON.parse(index));
      } catch (e) {
        console.error("Failed to parse projects index", e);
      }
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveProject = (isUpdate: boolean = false) => {
    const idToSave = isUpdate && currentProjectId ? currentProjectId : Date.now().toString();
    const finalName = isUpdate && currentProjectId 
      ? projects.find(p => p.id === currentProjectId)?.name || projectName 
      : projectName;

    if (!finalName.trim()) {
      showToast('Please enter a name');
      return;
    }
    try {
      const data = { tiles, history, redoStack };
      localStorage.setItem(`unstitch_project_${idToSave}`, JSON.stringify(data));
      
      const newEntry = { id: idToSave, name: finalName, timestamp: Date.now() };
      const updatedIndex = [newEntry, ...projects.filter(p => p.id !== idToSave)];
      setProjects(updatedIndex);
      localStorage.setItem('unstitch_projects_index', JSON.stringify(updatedIndex));
      
      setCurrentProjectId(idToSave);
      setShowSaveDialog(false);
      setProjectName("");
      showToast(isUpdate ? 'Project updated successfully!' : 'Project saved successfully!');
    } catch (e) {
      showToast('Error saving project.');
    }
  };

  const handleLoadProject = (id: string) => {
    try {
      const data = localStorage.getItem(`unstitch_project_${id}`);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.tiles) setTiles(parsed.tiles);
        if (parsed.history) setHistory(parsed.history);
        if (parsed.redoStack) setRedoStack(parsed.redoStack);
        setSelectedTileId(null);
        setCurrentProjectId(id);
        setShowLoadDialog(false);
        showToast('Project loaded successfully!');
      } else {
        showToast('Project data not found.');
      }
    } catch (e) {
      showToast('Error loading project.');
    }
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedIndex = projects.filter(p => p.id !== id);
      setProjects(updatedIndex);
      localStorage.setItem('unstitch_projects_index', JSON.stringify(updatedIndex));
      localStorage.removeItem(`unstitch_project_${id}`);
      if (currentProjectId === id) setCurrentProjectId(null);
      showToast('Project deleted.');
    } catch (e) {
      showToast('Error deleting project.');
    }
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
              let foldAngle = tile.foldAngle;
              let localAnchor = tile.localAnchor;
              const isRoot = tile.id === "root";

              if (isRoot && activeRootHinge) {
                  const activeChild = tiles.find(t => t.id === activeRootHinge);
                  if (activeChild && activeChild.parentAnchor) {
                      localAnchor = activeChild.parentAnchor;
                      foldAngle = activeChild.foldAngle;
                  }
              }
              
              if (localAnchor) {
                  const anchor = localAnchor;
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
                        {!isRoot && tile.id === selectedTileId && (
                            <FoldControl 
                                axis={hingeRotationAxis} 
                                angle={foldAngle} 
                                onFold={(angle) => updateFoldAngle(tile.id, angle)} 
                                onFoldStart={recordMove}
                            />
                        )}
                        {!isRoot && tile.parentId === selectedTileId && selectedTileId === "root" && (
                            <FoldControl 
                                axis={hingeRotationAxis} 
                                angle={foldAngle} 
                                isGhost={activeRootHinge !== tile.id}
                                isSelected={activeRootHinge === tile.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveRootHinge(tile.id);
                                }}
                                onFold={(angle) => {
                                    setActiveRootHinge(tile.id);
                                    updateFoldAngle(tile.id, angle);
                                }} 
                                onFoldStart={recordMove}
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

      <div className="absolute top-5 sm:top-7 left-4 sm:left-7 flex flex-wrap items-center gap-3 z-50 pointer-events-auto">
          <Button onClick={
            ()=>window.history.back()
          } className="hover:bg-pink-100 bg-white/50 backdrop-blur-md shadow-lg border border-zinc-200/50 w-10 h-10 p-0 text-zinc-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.67 0l2.83 2.829-9.339 9.175 9.339 9.167-2.83 2.829-12.17-11.996z"/></svg></Button>
          
          <div className="flex bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
              <Button 
                variant="ghost" 
                className="h-10 px-3 sm:px-4 rounded-none border-r border-zinc-200 text-zinc-600 hover:text-pink-600 hover:bg-pink-50 transition-colors gap-1.5 sm:gap-2"
                onClick={() => setShowSaveDialog(true)}
              >
                  <Save size={16} />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Save</span>
              </Button>
              <Button 
                variant="ghost" 
                className="h-10 px-3 sm:px-4 rounded-none text-zinc-600 hover:text-pink-600 hover:bg-pink-50 transition-colors gap-1.5 sm:gap-2"
                onClick={() => setShowLoadDialog(true)}
              >
                  <FolderOpen size={16} />
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Load</span>
              </Button>
          </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
          {toastMessage && (
              <motion.div 
                  initial={{ opacity: 0, y: -20, x: "-50%" }}
                  animate={{ opacity: 1, y: 0, x: "-50%" }}
                  exit={{ opacity: 0, y: -20, x: "-50%" }}
                  className="absolute top-24 sm:top-28 left-1/2 z-[100] bg-pink-500 text-white px-5 py-2.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest shadow-[0_4px_20px_rgba(236,72,153,0.4)] pointer-events-none"
              >
                  {toastMessage}
              </motion.div>
          )}
      </AnimatePresence>
      {/* Fold Angle Slider Overlay */}
      {(() => {
        const sliderTile = selectedTileId === "root" && activeRootHinge 
          ? tiles.find(t => t.id === activeRootHinge) 
          : (selectedTile?.id !== "root" ? selectedTile : null);
          
        if (!sliderTile) return null;
        
        return (
          <div className="absolute sm:top-7 bottom-24 sm:bottom-auto left-1/2 -translate-x-1/2 bg-white/90 shadow-lg backdrop-blur-sm px-6 pb-6 pt-4 rounded-2xl flex items-center gap-3 sm:gap-6 border border-zinc-200 z-10 pointer-events-auto max-w-[95vw]">
            <div className="flex items-center gap-1 sm:gap-1.5 bg-zinc-50 px-2.5 py-1.5 rounded-xl border border-zinc-200 focus-within:border-pink-400 focus-within:ring-2 focus-within:ring-pink-100 transition-all shrink-0">
              <span className="text-[9px] sm:text-[10px] uppercase tracking-tighter font-black text-zinc-400 select-none">Deg</span>
              <input 
                  type="number"
                  value={typedAngle !== null ? typedAngle : Math.round(((sliderTile.foldAngle || 0) * 180) / Math.PI)}
                  onChange={(e) => {
                      setTypedAngle(e.target.value);
                      const deg = parseFloat(e.target.value);
                      if (!isNaN(deg)) {
                          updateFoldAngle(sliderTile.id, (deg * Math.PI) / 180);
                      }
                  }}
                  onFocus={() => {
                      recordMove();
                      setTypedAngle("");
                  }}
                  onBlur={() => setTypedAngle(null)}
                  className="w-8 sm:w-10 bg-transparent text-center font-mono text-pink-600 font-bold outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-xs sm:text-sm pt-0.5"
              />
              <span className="text-zinc-400 font-bold text-xs sm:text-sm">°</span>
            </div>
            <div className="relative w-32 sm:w-64 flex flex-col">
              <input
                type="range"
                min={-(99 * Math.PI) / 180}
                max={(99 * Math.PI) / 180}
                step={0.01}
                value={sliderTile.foldAngle || 0}
                onPointerDown={recordMove}
                onChange={(e) => updateFoldAngle(sliderTile.id, parseFloat(e.target.value))}
                className="w-full accent-pink-500 cursor-pointer relative z-10"
              />
              <div className="absolute top-5 left-0 right-0 h-6 mx-[6px]">
                {[
                  { label: '-90', val: -Math.PI / 2 },
                  { label: '-45', val: -Math.PI / 4, hideOnMobile: true },
                  { label: '0', val: 0 },
                  { label: '45', val: Math.PI / 4, hideOnMobile: true },
                  { label: '90', val: Math.PI / 2 },
                ].map(pt => {
                  const MAX_ANGLE = (100 * Math.PI) / 180;
                  const percent = ((pt.val + MAX_ANGLE) / (2 * MAX_ANGLE)) * 100;
                  return (
                    <div
                      key={pt.label}
                      className={`absolute flex-col items-center cursor-pointer -translate-x-1/2 group ${pt.hideOnMobile ? 'hidden sm:flex' : 'flex'}`}
                      style={{ left: `${percent}%` }}
                      onClick={() => updateFoldAngle(sliderTile.id, pt.val)}
                    >
                      <div className="w-[2px] h-2 bg-zinc-300 rounded mb-1 group-hover:bg-pink-500 transition-colors"></div>
                      <span className="text-[10px] text-zinc-500 font-medium select-none group-hover:text-pink-600 transition-colors">
                        {pt.label}°
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      <ActionBar 
        historyCount={history.length}
        redoCount={redoStack.length}
        canDelete={!!selectedTile && selectedTile.id !== "root"}
        onReset={() => setShowResetConfirm(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDelete={() => selectedTile && setDeleteConfirmId(selectedTile.id)}
      />
      
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
      {/* Custom Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/10 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-zinc-200 p-7 max-w-96 w-full animate-in zoom-in-95 duration-200">
                <div className="flex flex-col gap-5">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center text-red-500 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </div>
                        <h3 className="text-lg font-bold text-zinc-900 leading-tight">delete tile?</h3>
                    </div>
                    
                    <p className="text-sm text-zinc-600 leading-relaxed px-1">
                        {(() => {
                            const tile = tiles.find(t => t.id === deleteConfirmId);
                            const hasChildren = tile && Object.keys(tile.children).length > 0;
                            return hasChildren 
                                ? "This tile has others attached. Deleting it will remove the entire branch."
                                : "Are you sure you want to delete this tile?";
                        })()}
                    </p>

                    <div className="flex gap-2.5 pt-1">
                        <Button 
                            variant="secondary" 
                            className="flex-1 h-11 rounded-xl text-sm font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-none transition-all"
                            onClick={() => setDeleteConfirmId(null)}
                        >
                            cancel
                        </Button>
                        <Button 
                            variant="destructive" 
                            className="flex-1 h-11 rounded-xl text-sm font-semibold bg-red-500 hover:bg-red-600 text-white border-none transition-all shadow-sm"
                            onClick={() => {
                                deleteTile(deleteConfirmId);
                                setDeleteConfirmId(null);
                            }}
                        >
                            delete
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      )}
      {/* Custom Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/10 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-zinc-200 p-7 max-w-[340px] w-full animate-in zoom-in-95 duration-200">
                <div className="flex flex-col gap-5">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-600 shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        </div>
                        <h3 className="text-lg font-bold text-zinc-900 leading-tight">Reset Canvas?</h3>
                    </div>
                    
                    <p className="text-[14px] text-zinc-600 leading-relaxed px-1">
                        This will remove all tiles and return to the starting root tile. This move will be added to your undo history.
                    </p>

                    <div className="flex gap-2.5 pt-1">
                        <Button 
                            variant="secondary" 
                            className="flex-1 h-11 rounded-xl text-sm font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-none transition-all"
                            onClick={() => setShowResetConfirm(false)}
                        >
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive" 
                            className="flex-1 h-11 rounded-xl text-sm font-semibold bg-pink-500 hover:bg-pink-600 text-white border-none transition-all shadow-sm"
                            onClick={() => {
                                setHistory(prev => [tiles, ...prev].slice(0, 5));
                                setRedoStack([]);
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
                                setCurrentProjectId(null);
                                setShowResetConfirm(false);
                            }}
                        >
                            Reset
                        </Button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Interaction Help Toggle */}
      {/* Laptop Version: Floating Button */}
      <div className="hidden sm:flex absolute bottom-7 right-7 pointer-events-auto flex-col items-end gap-3 z-50">
          <AnimatePresence>
            {showHelp && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="bg-white/95 backdrop-blur-xl p-6 rounded-3xl shadow-2xl border border-zinc-200 w-64 mb-2 origin-bottom-right"
              >
                  <div className="flex flex-col gap-5">
                      <div className="space-y-1">
                          <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-zinc-400">Interaction Guide</h4>
                          <div className="h-[1px] w-8 bg-pink-500" />
                      </div>
                      
                      <div className="flex flex-col gap-4">
                          {[
                              isTouch ? { text: "Swipe to rotate view" } : { text: "Drag to rotate view" },
                              isTouch ? { text: "Two fingers to pan" } : { text: "Shift + Drag to pan" },
                              isTouch ? { text: "Pinch to zoom view" } : { text: "Scroll to zoom view" },
                              isTouch ? { text: "Tap tile to modify" } : { text: "Click tile to modify" },
                              { text: "Manage moves in bottom bar" }
                          ].map((item, i) => (
                              <div key={i} className="flex items-center gap-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/30" />
                                  <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-tight leading-tight">
                                      {item.text}
                                  </p>
                              </div>
                          ))}
                      </div>
                  </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button
            variant="secondary"
            size="icon"
            className={`w-12 h-12 rounded-full shadow-lg border border-zinc-200 transition-all duration-300 ${
                showHelp 
                ? "bg-pink-500 text-white border-pink-600 scale-110 rotate-12" 
                : "bg-white/90 text-zinc-500 hover:text-pink-500 hover:scale-105"
            }`}
            onClick={() => setShowHelp(!showHelp)}
          >
            <HelpCircle size={24} />
          </Button>
      </div>

      {/* Mobile Version: Full-width Bottom Bar */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-auto">
          <AnimatePresence>
            {showHelp && (
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="bg-white/95 backdrop-blur-xl p-8 rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-zinc-200 w-full"
              >
                  <div className="flex flex-col gap-6">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                            <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-zinc-400">Interaction Guide</h4>
                            <div className="h-[1px] w-8 bg-pink-500" />
                        </div>
                        <button 
                            onClick={() => setShowHelp(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-400"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-5">
                          {[
                              { text: "Swipe to rotate view" },
                              { text: "Two fingers to pan" },
                              { text: "Pinch to zoom view" },
                              { text: "Tap tile to modify" },
                              { text: "Undo/Redo in bottom bar" }
                          ].map((item, i) => (
                              <div key={i} className="flex items-center gap-4">
                                  <div className="w-2 h-2 rounded-full bg-pink-500" />
                                  <p className="text-[13px] font-bold text-zinc-600 uppercase tracking-tight">
                                      {item.text}
                                  </p>
                              </div>
                          ))}
                      </div>
                      <div className="h-4" /> {/* Spacer for safe area */}
                  </div>
              </motion.div>
            )}
          </AnimatePresence>

          <button 
            onClick={() => setShowHelp(!showHelp)}
            className="w-full h-4 bg-pink-500 text-white flex items-center justify-center gap-2 active:bg-pink-600 transition-colors]"
          >
              <HelpCircle size={16} />
              <span className="text-xs">
                  {showHelp ? "Close Guide" : "How to Interact"}
              </span>
          </button>
      </div>
      {/* Save Project Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-sm overflow-hidden"
            >
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800">Save Project</h3>
                  <button onClick={() => setShowSaveDialog(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-4">
                  {currentProjectId && (
                    <Button 
                      onClick={() => handleSaveProject(true)}
                      className="w-full bg-zinc-800 hover:bg-black text-white rounded-xl py-6 font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                    >
                      <Save size={16} />
                      Update "{projects.find(p => p.id === currentProjectId)?.name}"
                    </Button>
                  )}
                  
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                      {currentProjectId ? "Or Save as New Project" : "Project Name"}
                    </label>
                    <div className="flex gap-2">
                      <input 
                        autoFocus={!currentProjectId}
                        type="text" 
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveProject(false)}
                        placeholder="Enter name..."
                        className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 transition-all"
                      />
                      <Button 
                        onClick={() => handleSaveProject(false)}
                        className="bg-pink-500 hover:bg-pink-600 text-white rounded-xl px-4 font-bold"
                      >
                        <Plus size={20} />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Load Project Dialog */}
      <AnimatePresence>
        {showLoadDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800">Your Projects</h3>
                <button onClick={() => setShowLoadDialog(false)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                  <X size={20} />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {projects.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-300">
                      <FolderOpen size={24} />
                    </div>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">No saved projects</p>
                  </div>
                ) : (
                  projects.map((p) => (
                    <div 
                      key={p.id}
                      onClick={() => handleLoadProject(p.id)}
                      className="group flex items-center justify-between p-4 bg-zinc-50 hover:bg-pink-50 rounded-2xl border border-zinc-100 hover:border-pink-200 cursor-pointer transition-all"
                    >
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-zinc-800 group-hover:text-pink-600 transition-colors">{p.name}</h4>
                        <p className="text-[10px] text-zinc-400 font-medium">
                          {new Date(p.timestamp).toLocaleDateString()} at {new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteProject(p.id, e)}
                        className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-100 sm:opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PlayCanvas;
