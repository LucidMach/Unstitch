/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import React from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import TexTile from '../tex-tile';
import GhostArrow from '../ghost-arrow';
import FoldControl from '../fold-control';
import type { TileData } from '../../types/tile';
import { getLayoutConstants } from '../../constants/layout';

interface TileNodeProps {
  tile: TileData;
  tiles: TileData[];
  localPos: [number, number, number];
  selectedTileId: string | null;
  activeRootHinge: string | null;
  overlap: number;
  ghostTiles: any[];
  onTileClick: (e: ThreeEvent<MouseEvent>, id: string) => void;
  onGhostClick: (e: ThreeEvent<MouseEvent>, ghost: any) => void;
  onFold: (id: string, angle: number) => void;
  onFoldStart: (tile: TileData) => void;
  onFoldEnd: () => void;
  onHingeSelect: (id: string) => void;
  renderTileNode: (tile: TileData, localPos: [number, number, number]) => React.ReactNode;
}

const TileNode: React.FC<TileNodeProps> = ({
  tile, tiles, localPos, selectedTileId, activeRootHinge, overlap, ghostTiles,
  onTileClick, onGhostClick, onFold, onFoldStart, onFoldEnd, onHingeSelect, renderTileNode
}) => {
  const { OFFSET_MAJOR } = getLayoutConstants(overlap);
  
  const childrenNodes = Object.values(tile.children)
    .map(childId => tiles.find(t => t.id === childId))
    .filter((t): t is TileData => t !== undefined);
      
  let hingeOffset: [number, number, number] = [0, 0, 0];
  let hingeRotationAxis: [number, number, number] = [1, 0, 0];
  let foldAngle = tile.foldAngle;
  let localAnchor = tile.localAnchor;
  const isRoot = tile.id === "root";

  if (localAnchor) {
      const anchor = localAnchor;
      if (anchor === 'w') { hingeOffset = [0, 0, -OFFSET_MAJOR / 2]; hingeRotationAxis = [1, 0, 0]; }
      else if (anchor === 's') { hingeOffset = [0, 0, OFFSET_MAJOR / 2]; hingeRotationAxis = [-1, 0, 0]; }
      else if (anchor === 'a') { hingeOffset = [-OFFSET_MAJOR / 2, 0, 0]; hingeRotationAxis = [0, 0, -1]; }
      else if (anchor === 'd') { hingeOffset = [OFFSET_MAJOR / 2, 0, 0]; hingeRotationAxis = [0, 0, 1]; }
  }

  const hingeRot: [number, number, number] = [
      hingeRotationAxis[0] * foldAngle,
      hingeRotationAxis[1] * foldAngle,
      hingeRotationAxis[2] * foldAngle
  ];

  const hiddenWorldAnchors: string[] = [];
  if (Math.abs(foldAngle) > 0.01 && tile.localAnchor) hiddenWorldAnchors.push(tile.localAnchor);
  for (const child of childrenNodes) {
      if (Math.abs(child.foldAngle) > 0.01 && child.parentAnchor) hiddenWorldAnchors.push(child.parentAnchor);
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
    <group position={localPos}>
        <group position={hingeOffset} rotation={hingeRot}>
            <group position={[-hingeOffset[0], -hingeOffset[1], -hingeOffset[2]]}>
                <TexTile 
                  rotation={tile.rotation}
                  selected={tile.id === selectedTileId}
                  hiddenMeshes={hiddenMeshes}
                  onPointerDown={(e) => onTileClick(e as any, tile.id)}
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
                         onClick={(e) => onGhostClick(e, ghost)}
                     />
                ))}
            </group>
            {!isRoot && tile.id === selectedTileId && (
                <FoldControl 
                    axis={hingeRotationAxis} 
                    angle={foldAngle} 
                    onFold={(angle) => onFold(tile.id, angle)} 
                    onFoldStart={() => onFoldStart(tile)}
                    onFoldEnd={onFoldEnd}
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
                        onHingeSelect(tile.id);
                    }}
                    onFold={(angle) => onFold(tile.id, angle)} 
                    onFoldStart={() => onFoldStart(tile)}
                    onFoldEnd={onFoldEnd}
                />
            )}
        </group>
    </group>
  );
};

export default TileNode;
