import React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { Save, FolderOpen } from "lucide-react";

import { usePlayCanvas } from "../hooks/use-play-canvas";
import { ITEM_SCALE } from "../constants/layout";
import { getLayoutConstants } from "../constants/layout";
import TileNode from "./scene/TileNode";
import { SaveDialog, LoadDialog, ConfirmDialog } from "./ui/Dialogs";
import { HelpGuide } from "./ui/HelpGuide";
import { AngleSlider } from "./ui/AngleSlider";
import { Button } from "./ui/button";
import ActionBar from "./action-bar";

const PlayCanvas: React.FC = () => {
  const pc = usePlayCanvas();
  const { OFFSET_MAJOR } = getLayoutConstants(pc.overlap);

  const selectedTile = pc.tiles.find(t => t.id === pc.selectedTileId);
  
  // Ghost tiles generation moved to local for easy access to state
  const getGhostTiles = (parent: any) => {
    const { position: p, rotation: r } = parent;
    const offsets = [
        { x: OFFSET_MAJOR, z: 0, rot: -Math.PI / 2, anchor: 'd' }, 
        { x: 0, z: OFFSET_MAJOR, rot: Math.PI / 2, anchor: 's' },
        { x: -OFFSET_MAJOR, z: 0, rot: -Math.PI / 2, anchor: 'a' },
        { x: 0, z: -OFFSET_MAJOR, rot: Math.PI / 2, anchor: 'w' },
    ];
    const ghosts: any[] = [];
    offsets.forEach((offset, index) => {
        const newPos: [number, number, number] = [p[0] + offset.x, p[1], p[2] + offset.z];
        const exists = pc.tiles.some(t => Math.pow(t.position[0] - newPos[0], 2) + Math.pow(t.position[2] - newPos[2], 2) < 1);
        if (!exists && !parent.children[offset.anchor]) {
             ghosts.push({
                 id: `ghost-${parent.id}-${index}`,
                 position: newPos,
                 rotation: [r[0], r[1] + offset.rot, r[2]],
                 arrowRotation: [0, Math.atan2(offset.x, offset.z), 0],
                 sourceAnchor: { id: parent.id, anchor: offset.anchor }
             });
        }
    });
    return ghosts;
  };

  const ghostTiles = selectedTile ? getGhostTiles(selectedTile) : [];

  const renderRecursive = (tile: any, localPos: [number, number, number]) => (
    <TileNode 
      key={tile.id}
      tile={tile}
      tiles={pc.tiles}
      localPos={localPos}
      selectedTileId={pc.selectedTileId}
      activeRootHinge={pc.activeRootHinge}
      overlap={pc.overlap}
      ghostTiles={ghostTiles}
      onTileClick={pc.handleTileClick}
      onGhostClick={pc.handleGhostClick}
      onFold={pc.updateFoldAngle}
      onFoldStart={(t) => {
        pc.recordMove();
        pc.setIsFolding(true);
        pc.dragStartData.current = {
          worldTransform: { position: pc.worldTransform.position.clone(), quaternion: pc.worldTransform.quaternion.clone() },
          foldAngle: t.foldAngle,
          tileId: t.id
        };
      }}
      onFoldEnd={() => { pc.setIsFolding(false); pc.dragStartData.current = null; }}
      onHingeSelect={(id) => pc.setActiveRootHinge(id === pc.activeRootHinge ? null : id)}
      renderTileNode={renderRecursive}
    />
  );

  const rootTile = pc.tiles.find(t => t.id === "root");

  return (
    <div className="flex flex-col justify-center items-center h-full w-full bg-white/10 relative" onPointerDown={pc.handlePointerDown} onPointerUp={pc.handlePointerUp}>
      <Canvas shadows camera={{ position: [0, 300, 0], fov: 45 }} className="w-full h-full bg-zinc-50">
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.1} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[50, 100, 50]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
        <Grid infiniteGrid cellSize={ITEM_SCALE[0]/10} sectionSize={ITEM_SCALE[0]} fadeDistance={1000} sectionColor="#d1d5db" cellColor="#e5e7eb" />
        {/* empty mess to hangle unselection */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onPointerDown={pc.handleBackgroundClick}>
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        <GizmoHelper alignment="top-right" margin={[80, 80]}><GizmoViewcube /></GizmoHelper>
        {rootTile && (
          <group position={pc.worldTransform.position} quaternion={pc.worldTransform.quaternion}>
            {renderRecursive(rootTile, [0, 0, 0])}
          </group>
        )}
      </Canvas>

      {/* Top Bar Actions */}
      <div className="absolute top-5 sm:top-7 left-4 sm:left-7 flex flex-wrap items-center gap-3 z-50 pointer-events-auto">
          <Button onClick={()=>window.history.back()} className="hover:bg-pink-100 bg-white/50 backdrop-blur-md shadow-lg border border-zinc-200/50 w-10 h-10 p-0 text-zinc-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.67 0l2.83 2.829-9.339 9.175 9.339 9.167-2.83 2.829-12.17-11.996z"/></svg>
          </Button>
          <div className="flex bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-zinc-200 overflow-hidden">
              <Button variant="ghost" className="h-10 px-3 sm:px-4 rounded-none border-r border-zinc-200 text-zinc-600 hover:text-pink-600 hover:bg-pink-50 transition-colors gap-1.5 sm:gap-2" onClick={() => pc.setShowSaveDialog(true)}>
                  <Save size={16} /><span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Save</span>
              </Button>
              <Button variant="ghost" className="h-10 px-3 sm:px-4 rounded-none text-zinc-600 hover:text-pink-600 hover:bg-pink-50 transition-colors gap-1.5 sm:gap-2" onClick={() => pc.setShowLoadDialog(true)}>
                  <FolderOpen size={16} /><span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Load</span>
              </Button>
          </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
          {pc.toastMessage && (
              <motion.div initial={{ opacity: 0, y: -20, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: -20, x: "-50%" }} className="absolute top-24 sm:top-28 left-1/2 z-[100] bg-pink-500 text-white px-5 py-2.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-widest shadow-[0_4px_20px_rgba(236,72,153,0.4)] pointer-events-none">
                  {pc.toastMessage}
              </motion.div>
          )}
      </AnimatePresence>

      {/* Angle Slider Overlay */}
      {(() => {
        const sliderTile = pc.selectedTileId === "root" && pc.activeRootHinge ? pc.tiles.find(t => t.id === pc.activeRootHinge) : (pc.selectedTileId !== "root" ? selectedTile : null);
        if (!sliderTile) return null;
        return <AngleSlider foldAngle={sliderTile.foldAngle} typedAngle={pc.typedAngle} setTypedAngle={pc.setTypedAngle} updateFoldAngle={(a) => pc.updateFoldAngle(sliderTile.id, a)} recordMove={pc.recordMove} />;
      })()}

      <ActionBar historyCount={pc.history.length} redoCount={pc.redoStack.length} canDelete={!!selectedTile && selectedTile.id !== "root"} onReset={() => pc.setShowResetConfirm(true)} onUndo={pc.handleUndo} onRedo={pc.handleRedo} onDelete={() => selectedTile && pc.setDeleteConfirmId(selectedTile.id)} />

      <HelpGuide show={pc.showHelp} setShow={pc.setShowHelp} isTouch={pc.isTouch} />

      <SaveDialog show={pc.showSaveDialog} onClose={() => pc.setShowSaveDialog(false)} projectName={pc.projectName} setProjectName={pc.setProjectName} onSave={pc.handleSaveProject} currentProjectId={pc.currentProjectId} projects={pc.projects} />
      
      <LoadDialog show={pc.showLoadDialog} onClose={() => pc.setShowLoadDialog(false)} projects={pc.projects} onLoad={pc.handleLoadProject} onDelete={pc.handleDeleteProject} />

      <ConfirmDialog show={!!pc.deleteConfirmId} title="delete tile?" message={pc.deleteConfirmId && Object.keys(pc.tiles.find(t => t.id === pc.deleteConfirmId)?.children || {}).length > 0 ? "This tile has others attached. Deleting it will remove the entire branch." : "Are you sure you want to delete this tile?"} confirmLabel="delete" onConfirm={() => { pc.deleteTile(pc.deleteConfirmId!); pc.setDeleteConfirmId(null); }} onCancel={() => pc.setDeleteConfirmId(null)} />

      <ConfirmDialog show={pc.showResetConfirm} title="Reset Canvas?" message="This will remove all tiles and clear your entire undo/redo history. This action cannot be undone." confirmLabel="Reset" confirmVariant="destructive" onConfirm={pc.handleReset} onCancel={() => pc.setShowResetConfirm(false)} icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>} />
    </div>
  );
};

export default PlayCanvas;
