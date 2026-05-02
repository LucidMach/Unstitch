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
    
    const nodes = json.nodes.filter(n => ['W', 'A', 'S', 'D'].includes(n.name));
    nodes.forEach(n => {
        console.log(`Node: ${n.name}`);
        if (n.translation) console.log(`  translation: ${n.translation}`);
        if (n.rotation) console.log(`  rotation: ${n.rotation}`);
    });
}
