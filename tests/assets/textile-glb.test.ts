import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function parseGlb(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const length = buffer.readUInt32LE(8);
  const chunkLength = buffer.readUInt32LE(12);
  const chunkType = buffer.readUInt32LE(16);

  expect(magic).toBe(0x46546c67); // 'glTF'
  expect(version).toBe(2);
  expect(length).toBe(buffer.length);
  expect(chunkType).toBe(0x4e4f534a); // 'JSON'

  const jsonStr = buffer.toString('utf8', 20, 20 + chunkLength);
  const json = JSON.parse(jsonStr);

  return { buffer, json, chunkLength };
}

describe('3D Asset Integrity: Textile-Components.glb', () => {
  const glbPath = path.resolve(process.cwd(), 'public/Textile-Components.glb');

  it('exists and is a valid binary glTF (GLB) file', () => {
    expect(fs.existsSync(glbPath)).toBe(true);
    const { json } = parseGlb(glbPath);
    expect(json).toBeDefined();
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(Array.isArray(json.meshes)).toBe(true);
    expect(Array.isArray(json.accessors)).toBe(true);
  });

  it('contains the essential tile nodes required by tex-tile.tsx (Unit, W, A, S, D)', () => {
    const { json } = parseGlb(glbPath);
    const nodeMap = new Map<string, any>();
    json.nodes.forEach((node: any) => {
      if (node.name) {
        nodeMap.set(node.name, node);
      }
    });

    const requiredNodes = ['Unit', 'W', 'A', 'S', 'D'];
    for (const name of requiredNodes) {
      expect(nodeMap.has(name), `Missing required node "${name}" in GLB`).toBe(true);
      const node = nodeMap.get(name);
      expect(node.mesh, `Node "${name}" has no mesh assigned`).toBeDefined();
      const mesh = json.meshes[node.mesh];
      expect(mesh, `Mesh index ${node.mesh} for node "${name}" not found`).toBeDefined();
      expect(mesh.primitives.length).toBeGreaterThan(0);
    }
  });

  it('has valid 3D bounding boxes for directional flap nodes (W, A, S, D)', () => {
    const { json } = parseGlb(glbPath);
    const flapNames = ['W', 'A', 'S', 'D'];
    const nodes = json.nodes.filter((n: any) => flapNames.includes(n.name));

    expect(nodes.length).toBe(4);

    nodes.forEach((n: any) => {
      const mesh = json.meshes[n.mesh];
      const primitive = mesh.primitives[0];
      const posAccessor = json.accessors[primitive.attributes.POSITION];

      expect(posAccessor, `Missing POSITION accessor for node ${n.name}`).toBeDefined();
      expect(posAccessor.min).toHaveLength(3);
      expect(posAccessor.max).toHaveLength(3);

      // Verify coordinate validity: min <= max
      for (let i = 0; i < 3; i++) {
        expect(posAccessor.min[i]).toBeLessThanOrEqual(posAccessor.max[i]);
        // All flap bounds are expected within normalized unit ranges [-1.5, 1.5]
        expect(posAccessor.min[i]).toBeGreaterThan(-1.5);
        expect(posAccessor.max[i]).toBeLessThan(1.5);
      }
    });
  });
});

describe('3D Asset Integrity: Textile.glb', () => {
  const glbPath = path.resolve(process.cwd(), 'public/Textile.glb');

  it('exists and is a valid binary glTF (GLB) file', () => {
    expect(fs.existsSync(glbPath)).toBe(true);
    const { json } = parseGlb(glbPath);
    expect(json).toBeDefined();
    expect(Array.isArray(json.nodes)).toBe(true);
    expect(Array.isArray(json.meshes)).toBe(true);
  });
});
