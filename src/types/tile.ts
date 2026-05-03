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
