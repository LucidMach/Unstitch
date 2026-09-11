/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import React, { Suspense, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube, Html } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { Save, FolderOpen, Share2, ArrowLeft, Compass, Eye } from "lucide-react";

import { usePlayCanvas } from "../hooks/use-play-canvas";
import { ITEM_SCALE } from "../constants/layout";
import { getLayoutConstants } from "../constants/layout";
import TileNode from "./scene/TileNode";
import { SaveDialog, LoadDialog, ShareDialog, ConfirmDialog } from "./ui/Dialogs";
import { HelpGuide } from "./ui/HelpGuide";
import { AngleSlider } from "./ui/AngleSlider";
import { Button } from "./ui/button";
import ActionBar from "./action-bar";

const CanvasLoader: React.FC = () => (
  <Html center>
    <div className="flex flex-col items-center gap-2.5 bg-white/95 backdrop-blur-md px-5 py-3.5 rounded-2xl border border-neutral-200 shadow-xl pointer-events-none">
      <div className="w-5 h-5 border-2 border-[#A36E93] border-t-transparent rounded-full animate-spin" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Loading Textile Model...</span>
    </div>
  </Html>
);

function captureOptimizedCanvasSnapshot(canvasEl: HTMLCanvasElement): string | null {
  try {
    const { width, height } = canvasEl;
    if (!width || !height) return null;

    // Downscale retina/high-DPI canvas to crisp preview dimensions (max 800px)
    const maxDim = 800;
    let targetWidth = width;
    let targetHeight = height;

    if (targetWidth > maxDim || targetHeight > maxDim) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.max(1, Math.round((targetHeight * maxDim) / targetWidth));
        targetWidth = maxDim;
      } else {
        targetWidth = Math.max(1, Math.round((targetWidth * maxDim) / targetHeight));
        targetHeight = maxDim;
      }
    }

    const offscreen = document.createElement('canvas');
    offscreen.width = targetWidth;
    offscreen.height = targetHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      return canvasEl.toDataURL('image/jpeg', 0.82);
    }

    // Fill soft brand background in case WebGL canvas has transparent areas
    ctx.fillStyle = '#faf9f6';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(canvasEl, 0, 0, targetWidth, targetHeight);

    // JPEG 82% quality yields ~40KB-90KB crisp preview, well within server limits
    return offscreen.toDataURL('image/jpeg', 0.82);
  } catch (err) {
    console.warn('Could not capture optimized canvas snapshot:', err);
    return null;
  }
}

const PlayCanvas: React.FC = () => {
  const pc = usePlayCanvas();
  const { OFFSET_MAJOR } = getLayoutConstants(pc.overlap);
  const controlsRef = useRef<any>(null);
  const modelGroupRef = useRef<THREE.Group>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<string | null>(null);

  const handleOpenShare = () => {
    try {
      const canvasEl = document.querySelector('.playground-root canvas') as HTMLCanvasElement;
      if (canvasEl) {
        const dataUrl = captureOptimizedCanvasSnapshot(canvasEl);
        if (dataUrl) {
          setPreviewSnapshot(dataUrl);
        }
      }
    } catch (err) {
      console.warn('Could not capture canvas snapshot:', err);
    }
    pc.setShowShareDialog(true);
  };

  const selectedTile = pc.tiles.find(t => t.id === pc.selectedTileId);
  
  // Ghost tiles generation
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

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const cameraPosition: [number, number, number] = isMobile ? [240, 320, 240] : [160, 220, 160];

  const setView2D = () => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(0, 350, 0.001);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
    pc.showToast("2D Top View");
  };

  const setView3D = () => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(cameraPosition[0], cameraPosition[1], cameraPosition[2]);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
    pc.showToast("3D Isometric View");
  };

  return (
    <div className="flex flex-col justify-center items-center h-full w-full bg-white/10 relative" onPointerDown={pc.handlePointerDown} onPointerUp={pc.handlePointerUp}>
      <Canvas shadows gl={{ preserveDrawingBuffer: true }} camera={{ position: cameraPosition, fov: 45 }} className="w-full h-full bg-zinc-50">
        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          enabled={!pc.isFolding}
          minPolarAngle={0} 
          maxPolarAngle={Math.PI / 2.05} 
        />
        <ambientLight intensity={0.7} />
        <directionalLight position={[50, 100, 50]} intensity={1.2} castShadow shadow-mapSize={[1024, 1024]} />
        <Grid infiniteGrid cellSize={ITEM_SCALE[0]/10} sectionSize={ITEM_SCALE[0]} fadeDistance={1000} sectionColor="#d1d5db" cellColor="#e5e7eb" />
        
        {/* Transparent backdrop plane to handle deselection */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} onPointerDown={pc.handleBackgroundClick}>
          <planeGeometry args={[1000, 1000]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        
        <GizmoHelper alignment="top-right" margin={[80, 80]}><GizmoViewcube /></GizmoHelper>
        
        <Suspense fallback={<CanvasLoader />}>
          {rootTile && (
            <group ref={modelGroupRef} position={pc.worldTransform.position} quaternion={pc.worldTransform.quaternion}>
              {renderRecursive(rootTile, [0, 0, 0])}
            </group>
          )}
        </Suspense>
      </Canvas>

      {/* Unified Top Navigation & Studio Actions */}
      <div className="absolute top-4 sm:top-6 left-4 sm:left-6 flex flex-wrap items-center gap-2 sm:gap-2.5 z-50 pointer-events-auto max-w-[calc(100vw-140px)] sm:max-w-none">
        {/* Back to Studio Link Pill */}
        <a
          href="/"
          className="flex items-center gap-2 bg-white/95 backdrop-blur-md border border-neutral-200 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-neutral-800 shadow-md hover:bg-neutral-100 hover:border-neutral-400 transition-all group shrink-0"
        >
          <ArrowLeft size={16} className="text-neutral-500 group-hover:text-neutral-900 group-hover:-translate-x-0.5 transition-all" />
          <span>Studio</span>
        </a>

        {/* Project Management Actions Pill */}
        <div className="flex bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-neutral-200 overflow-hidden shrink-0">
          <Button 
            variant="ghost" 
            className="h-9 sm:h-10 px-3 sm:px-4 rounded-none border-r border-neutral-200 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors gap-1.5" 
            onClick={() => pc.setShowSaveDialog(true)}
          >
            <Save size={15} />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Save</span>
          </Button>

          <Button 
            variant="ghost" 
            className="h-9 sm:h-10 px-3 sm:px-4 rounded-none border-r border-neutral-200 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors gap-1.5" 
            onClick={() => pc.setShowLoadDialog(true)}
          >
            <FolderOpen size={15} />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Load</span>
          </Button>

          <Button 
            variant="ghost" 
            className="h-9 sm:h-10 px-3 sm:px-4 rounded-none text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors gap-1.5" 
            onClick={handleOpenShare}
          >
            <Share2 size={15} />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider">Share</span>
          </Button>
        </div>

        {/* Viewport Camera Mode Pill (3D / 2D) */}
        <div className="hidden md:flex bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-neutral-200 overflow-hidden shrink-0">
          <button 
            title="Switch to 3D View"
            onClick={setView3D}
            className="h-9 sm:h-10 px-3.5 border-r border-neutral-200 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
          >
            <Compass size={14} />
            <span>3D</span>
          </button>
          <button 
            title="Switch to 2D Top View"
            onClick={setView2D}
            className="h-9 sm:h-10 px-3.5 text-neutral-700 hover:text-neutral-950 hover:bg-neutral-100 transition-colors flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
          >
            <Eye size={14} />
            <span>2D</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {pc.toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: "-50%" }} 
            animate={{ opacity: 1, y: 0, x: "-50%" }} 
            exit={{ opacity: 0, y: -20, x: "-50%" }} 
            className="absolute top-5 sm:top-6 left-1/2 z-[100] bg-neutral-900/95 text-white px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest shadow-2xl border border-neutral-800 pointer-events-none"
          >
            {pc.toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Angle Slider Overlay */}
      <AnimatePresence>
        {(() => {
          const sliderTile = pc.selectedTileId === "root" && pc.activeRootHinge ? pc.tiles.find(t => t.id === pc.activeRootHinge) : (pc.selectedTileId !== "root" ? selectedTile : null);
          if (!sliderTile) return null;
          return (
            <AngleSlider 
              key={sliderTile.id}
              foldAngle={sliderTile.foldAngle} 
              typedAngle={pc.typedAngle} 
              setTypedAngle={pc.setTypedAngle} 
              updateFoldAngle={(a) => pc.updateFoldAngle(sliderTile.id, a)} 
              recordMove={pc.recordMove} 
            />
          );
        })()}
      </AnimatePresence>

      <ActionBar historyCount={pc.history.length} redoCount={pc.redoStack.length} canDelete={!!selectedTile && selectedTile.id !== "root"} onReset={() => pc.setShowResetConfirm(true)} onUndo={pc.handleUndo} onRedo={pc.handleRedo} onDelete={() => selectedTile && pc.setDeleteConfirmId(selectedTile.id)} />

      <HelpGuide show={pc.showHelp} setShow={pc.setShowHelp} isTouch={pc.isTouch} />

      <SaveDialog 
        show={pc.showSaveDialog} 
        onClose={() => pc.setShowSaveDialog(false)} 
        projectName={pc.projectName} 
        setProjectName={pc.setProjectName} 
        onSave={pc.handleSaveProject} 
        currentProjectId={pc.currentProjectId} 
        projects={pc.projects}
        onExportJSON={pc.exportJSON}
        onExportGLTF={() => pc.exportGLTF(modelGroupRef.current)}
      />
      
      <LoadDialog 
        show={pc.showLoadDialog} 
        onClose={() => pc.setShowLoadDialog(false)} 
        projects={pc.projects} 
        onLoad={pc.handleLoadProject} 
        onDelete={pc.handleDeleteProject} 
        onImportJSON={pc.importJSON} 
      />

      <ShareDialog
        show={pc.showShareDialog}
        onClose={() => pc.setShowShareDialog(false)}
        projectName={pc.projectName}
        setProjectName={pc.setProjectName}
        designData={pc.getDesignData()}
        previewImage={previewSnapshot}
        onShareSuccess={() => pc.showToast("Design sent to your email!")}
      />

      <ConfirmDialog show={!!pc.deleteConfirmId} title="delete tile?" message={pc.deleteConfirmId && Object.keys(pc.tiles.find(t => t.id === pc.deleteConfirmId)?.children || {}).length > 0 ? "This tile has others attached. Deleting it will remove the entire branch." : "Are you sure you want to delete this tile?"} confirmLabel="delete" onConfirm={() => { pc.deleteTile(pc.deleteConfirmId!); pc.setDeleteConfirmId(null); }} onCancel={() => pc.setDeleteConfirmId(null)} />

      <ConfirmDialog show={pc.showResetConfirm} title="Reset Canvas?" message="This will remove all tiles and clear your entire undo/redo history. This action cannot be undone." confirmLabel="Reset" confirmVariant="destructive" onConfirm={pc.handleReset} onCancel={() => pc.setShowResetConfirm(false)} icon={<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>} />
    </div>
  );
};

export default PlayCanvas;
