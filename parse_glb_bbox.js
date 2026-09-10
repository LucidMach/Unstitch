/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import fs from 'fs';
const buffer = fs.readFileSync('public/Textile-Components.glb');
const magic = buffer.readUInt32LE(0);
const chunkLength = buffer.readUInt32LE(12);
const jsonStr = buffer.toString('utf8', 20, 20 + chunkLength);
const json = JSON.parse(jsonStr);

// Binary chunk is immediately after JSON chunk
const binChunkOffset = 20 + chunkLength;
const binChunkLength = buffer.readUInt32LE(binChunkOffset);
const binBuffer = buffer.subarray(binChunkOffset + 8, binChunkOffset + 8 + binChunkLength);

const accessors = json.accessors;
const bufferViews = json.bufferViews;

const nodes = json.nodes.filter(n => ['W', 'A', 'S', 'D'].includes(n.name));
nodes.forEach(n => {
    const mesh = json.meshes[n.mesh];
    const primitive = mesh.primitives[0];
    const posAccessor = accessors[primitive.attributes.POSITION];
    console.log(`Node: ${n.name}`);
    console.log(`  min: ${posAccessor.min}`);
    console.log(`  max: ${posAccessor.max}`);
});
