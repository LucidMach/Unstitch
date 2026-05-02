import fs from 'fs';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { JSDOM } from 'jsdom';
import { toArrayBuffer } from 'three/src/utils.js'; // Not needed usually
// Let's just use a simpler GLTF parser
