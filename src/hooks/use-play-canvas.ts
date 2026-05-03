import { useState, useRef, useEffect } from "react";
import * as THREE from 'three';
import type { ThreeEvent } from "@react-three/fiber";
import type { TileData, DragStartData } from "../types/tile";
import { getLayoutConstants } from "../constants/layout";

export const usePlayCanvas = () => {
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
  const [history, setHistory] = useState<{ tiles: TileData[], transform: typeof worldTransform, activeRootHinge: string | null, selectedTileId: string | null }[]>([]);
  const [redoStack, setRedoStack] = useState<{ tiles: TileData[], transform: typeof worldTransform, activeRootHinge: string | null, selectedTileId: string | null }[]>([]);
  const [activeRootHinge, setActiveRootHinge] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isFolding, setIsFolding] = useState(false);
  const [worldTransform, setWorldTransform] = useState({ 
      position: new THREE.Vector3(0, 0, 0), 
      quaternion: new THREE.Quaternion() 
  });
  const [overlap, setOverlap] = useState<number>(0.61);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string; timestamp: number }[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [typedAngle, setTypedAngle] = useState<string | null>(null);
  const [isTouch, setIsTouch] = useState(false);

  const dragStartData = useRef<DragStartData | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  const { OFFSET_MAJOR } = getLayoutConstants(overlap);

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const index = localStorage.getItem('unstitch_projects_index');
    if (index) {
      try { setProjects(JSON.parse(index)); } catch (e) {}
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const recordMove = () => {
    setHistory(prev => [{ 
        tiles, 
        transform: { position: worldTransform.position.clone(), quaternion: worldTransform.quaternion.clone() },
        activeRootHinge,
        selectedTileId
    }, ...prev].slice(0, 10));
    setRedoStack([]);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      dragStart.current = { x: e.clientX, y: e.clientY };
      isDragging.current = false;
  }

  const handlePointerUp = (e: React.PointerEvent) => {
      const dist = Math.sqrt(Math.pow(e.clientX - dragStart.current.x, 2) + Math.pow(e.clientY - dragStart.current.y, 2));
      if (dist > 5) isDragging.current = true;
  }

  const handleTileClick = (e: ThreeEvent<MouseEvent>, tileId: string) => {
      e.stopPropagation();
      if (isDragging.current) return;
      setSelectedTileId(tileId);

      if (tileId === "root") {
          const rootNode = tiles.find(t => t.id === "root");
          const children = Object.values(rootNode?.children || {}).filter(Boolean);
          
          if (children.length === 1) {
              setActiveRootHinge(children[0] as string);
          } else if (children.length > 1) {
              setActiveRootHinge(null);
              showToast("Select an arc to fold");
          }
      } else {
          setActiveRootHinge(null);
      }
  };

  const handleBackgroundClick = (e: ThreeEvent<MouseEvent>) => {
      if (isDragging.current) return;
      setSelectedTileId(null);
      setActiveRootHinge(null);
  };

  const updateFoldAngle = (tileId: string, angle: number) => {
      const snapPoints = [-Math.PI, -Math.PI/2, -Math.PI/4, 0, Math.PI/4, Math.PI/2, Math.PI];
      const snapThreshold = 0.1;
      let snappedAngle = angle;
      for (const snap of snapPoints) {
          if (Math.abs(angle - snap) < snapThreshold) {
              snappedAngle = snap;
              break;
          }
      }

      setTiles(prevTiles => {
          const tile = prevTiles.find(t => t.id === tileId);
          if (!tile) return prevTiles;

          if (activeRootHinge === tileId && tile.parentId === "root") {
              const rootTile = prevTiles.find(t => t.id === "root");
              if (rootTile && tile.localAnchor) {
                  const anchor = tile.localAnchor;
                  let axis = new THREE.Vector3(1, 0, 0);
                  let offset = new THREE.Vector3(0, 0, 0);
                  if (anchor === 'w') { offset.set(0, 0, -OFFSET_MAJOR / 2); axis.set(1, 0, 0); }
                  else if (anchor === 's') { offset.set(0, 0, OFFSET_MAJOR / 2); axis.set(-1, 0, 0); }
                  else if (anchor === 'a') { offset.set(-OFFSET_MAJOR / 2, 0, 0); axis.set(0, 0, -1); }
                  else if (anchor === 'd') { offset.set(OFFSET_MAJOR / 2, 0, 0); axis.set(0, 0, 1); }

                  const hingeLocalPos = new THREE.Vector3(
                      tile.position[0] - rootTile.position[0] + offset.x,
                      tile.position[1] - rootTile.position[1] + offset.y,
                      tile.position[2] - rootTile.position[2] + offset.z
                  );

                  if (dragStartData.current && dragStartData.current.tileId === tileId) {
                      const deltaAngle = snappedAngle - dragStartData.current.foldAngle;
                      const baseWt = dragStartData.current.worldTransform;
                      const hingeWorldPos = hingeLocalPos.clone().applyQuaternion(baseWt.quaternion).add(baseWt.position);
                      const worldAxis = axis.clone().applyQuaternion(baseWt.quaternion).normalize();
                      const deltaQuat = new THREE.Quaternion().setFromAxisAngle(worldAxis, -deltaAngle);
                      const newQuat = deltaQuat.clone().multiply(baseWt.quaternion);
                      const vec = baseWt.position.clone().sub(hingeWorldPos);
                      vec.applyQuaternion(deltaQuat);
                      const newPos = hingeWorldPos.clone().add(vec);
                      setWorldTransform({ position: newPos, quaternion: newQuat });
                  } else {
                      const deltaAngle = snappedAngle - tile.foldAngle;
                      if (Math.abs(deltaAngle) > 0.0001) {
                          setWorldTransform(prevWt => {
                              const hingeWorldPos = hingeLocalPos.clone().applyQuaternion(prevWt.quaternion).add(prevWt.position);
                              const worldAxis = axis.clone().applyQuaternion(prevWt.quaternion).normalize();
                              const deltaQuat = new THREE.Quaternion().setFromAxisAngle(worldAxis, -deltaAngle);
                              const newQuat = deltaQuat.clone().multiply(prevWt.quaternion);
                              const vec = prevWt.position.clone().sub(hingeWorldPos);
                              vec.applyQuaternion(deltaQuat);
                              const newPos = hingeWorldPos.clone().add(vec);
                              return { position: newPos, quaternion: newQuat };
                          });
                      }
                  }
              }
          }
          return prevTiles.map(t => t.id === tileId ? { ...t, foldAngle: snappedAngle } : t);
      });
  };

  const handleGhostClick = (e: ThreeEvent<MouseEvent>, ghost: TileData & { sourceAnchor: { id: string; anchor: string } }) => {
      e.stopPropagation();
      if (isDragging.current) return;
      const newTileId = crypto.randomUUID();
      const parentId = ghost.sourceAnchor.id;
      const parentAnchorChar = ghost.sourceAnchor.anchor;
      const reciprocalMap: Record<string, string> = { 's': 'w', 'd': 'a', 'a': 'd', 'w': 's' };
      const newTileAnchorChar = reciprocalMap[parentAnchorChar];
      
      recordMove();
      setTiles(prev => {
          const newTiles = prev.map(t => t.id === parentId ? { ...t, children: { ...t.children, [parentAnchorChar]: newTileId } } : t);
          newTiles.push({ ...ghost, id: newTileId, parentId: parentId, parentAnchor: parentAnchorChar, localAnchor: newTileAnchorChar, children: {}, foldAngle: 0 });
          return newTiles;
      });
      setSelectedTileId(newTileId);
  };

  const deleteTile = (tileId: string) => {
    if (tileId === "root") return;
    recordMove();
    setTiles(prev => {
        const toDelete = new Set<string>();
        const collectDescendants = (id: string) => {
            toDelete.add(id);
            const t = prev.find(tile => tile.id === id);
            if (t) Object.values(t.children).forEach(childId => childId && collectDescendants(childId));
        };
        collectDescendants(tileId);
        return prev.filter(t => !toDelete.has(t.id)).map(t => {
            const updatedChildren = { ...t.children };
            let changed = false;
            Object.entries(updatedChildren).forEach(([dir, childId]) => { if (childId === tileId) { delete updatedChildren[dir]; changed = true; } });
            return changed ? { ...t, children: updatedChildren } : t;
        });
    });
    setSelectedTileId(null);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[0];
    setRedoStack(prev => [{ 
        tiles, 
        transform: { position: worldTransform.position.clone(), quaternion: worldTransform.quaternion.clone() },
        activeRootHinge,
        selectedTileId
    }, ...prev].slice(0, 5));
    setHistory(prev => prev.slice(1));
    setTiles(previous.tiles);
    setWorldTransform(previous.transform);
    setActiveRootHinge(previous.activeRootHinge);
    setSelectedTileId(previous.selectedTileId);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[0];
    setHistory(prev => [{ 
        tiles, 
        transform: { position: worldTransform.position.clone(), quaternion: worldTransform.quaternion.clone() },
        activeRootHinge,
        selectedTileId
    }, ...prev].slice(0, 5));
    setRedoStack(prev => prev.slice(1));
    setTiles(next.tiles);
    setWorldTransform(next.transform);
    setActiveRootHinge(next.activeRootHinge);
    setSelectedTileId(next.selectedTileId);
  };

  const handleSaveProject = (isUpdate: boolean = false) => {
    const idToSave = isUpdate && currentProjectId ? currentProjectId : Date.now().toString();
    const finalName = isUpdate && currentProjectId ? projects.find(p => p.id === currentProjectId)?.name || projectName : projectName;
    if (!finalName.trim()) { showToast('Please enter a name'); return; }
    try {
      const data = { tiles, history, redoStack, worldTransform };
      localStorage.setItem(`unstitch_project_${idToSave}`, JSON.stringify(data));
      const newEntry = { id: idToSave, name: finalName, timestamp: Date.now() };
      const updatedIndex = [newEntry, ...projects.filter(p => p.id !== idToSave)];
      setProjects(updatedIndex);
      localStorage.setItem('unstitch_projects_index', JSON.stringify(updatedIndex));
      setCurrentProjectId(idToSave);
      setShowSaveDialog(false);
      setProjectName("");
      showToast(isUpdate ? 'Project updated successfully!' : 'Project saved successfully!');
    } catch (e) { showToast('Error saving project.'); }
  };

  const handleLoadProject = (id: string) => {
    try {
      const data = localStorage.getItem(`unstitch_project_${id}`);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.tiles) setTiles(parsed.tiles);
        if (parsed.history) setHistory(parsed.history);
        if (parsed.redoStack) setRedoStack(parsed.redoStack);
        if (parsed.worldTransform) {
            setWorldTransform({
                position: new THREE.Vector3().copy(parsed.worldTransform.position),
                quaternion: new THREE.Quaternion().copy(parsed.worldTransform.quaternion)
            });
        }
        setSelectedTileId(null);
        setCurrentProjectId(id);
        setShowLoadDialog(false);
        showToast('Project loaded successfully!');
      } else { showToast('Project data not found.'); }
    } catch (e) { showToast('Error loading project.'); }
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
    } catch (e) { showToast('Error deleting project.'); }
  };

  const handleReset = () => {
    recordMove();
    setTiles([{ id: "root", position: [0, 0, 0], rotation: [0, Math.PI / 8, 0], parentId: null, parentAnchor: null, localAnchor: null, children: {}, foldAngle: 0 }]);
    setSelectedTileId(null);
    setCurrentProjectId(null);
    setShowResetConfirm(false);
  };

  return {
    tiles, setTiles, history, redoStack, activeRootHinge, setActiveRootHinge,
    selectedTileId, setSelectedTileId, deleteConfirmId, setDeleteConfirmId,
    showResetConfirm, setShowResetConfirm, isFolding, setIsFolding,
    worldTransform, setWorldTransform, overlap, setOverlap,
    toastMessage, showSaveDialog, setShowSaveDialog, showLoadDialog, setShowLoadDialog,
    projectName, setProjectName, projects, currentProjectId,
    showHelp, setShowHelp, typedAngle, setTypedAngle, isTouch,
    dragStartData, isDragging, handlePointerDown, handlePointerUp,
    handleTileClick, handleBackgroundClick, updateFoldAngle, handleGhostClick,
    deleteTile, handleUndo, handleRedo, handleSaveProject, handleLoadProject,
    handleDeleteProject, handleReset, recordMove, showToast
  };
};
