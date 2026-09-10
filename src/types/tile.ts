/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import * as THREE from 'three';

export type TileData = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  arrowRotation?: [number, number, number];
  parentId: string | null;
  parentAnchor: string | null;
  localAnchor: string | null;
  children: Partial<Record<string, string>>;
  foldAngle: number;
};

export type WorldTransform = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type DragStartData = {
  worldTransform: { position: THREE.Vector3, quaternion: THREE.Quaternion };
  foldAngle: number;
  tileId: string;
};
