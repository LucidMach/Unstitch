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
const version = buffer.readUInt32LE(4);
const length = buffer.readUInt32LE(8);
const chunkLength = buffer.readUInt32LE(12);
const chunkType = buffer.readUInt32LE(16);

if (chunkType === 0x4E4F534A) { // 'JSON'
    const jsonStr = buffer.toString('utf8', 20, 20 + chunkLength);
    const json = JSON.parse(jsonStr);
    
    const nodes = json.nodes;
    const meshes = json.meshes;
    nodes.forEach((n, i) => {
        if (n.name) console.log(`Node ${i}: ${n.name}`);
        if (n.mesh !== undefined) {
            const m = meshes[n.mesh];
            console.log(`  Mesh ${n.mesh}: ${m.name || 'unnamed'}`);
            console.log(`  Primitives: ${m.primitives.length}`);
        }
    });
}
