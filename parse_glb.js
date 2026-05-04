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
