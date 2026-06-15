import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('rock_leone.glb');
const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getArray();
const norm = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('NORMAL').getArray();
const count = pos.length / 3;

const top = [];
for (let i = 0; i < count; i++) {
  const nz = norm[i * 3 + 2];
  if (nz >= -0.45) continue;
  const x = pos[i * 3], y = pos[i * 3 + 1];
  top.push(Math.hypot(x, y));
}
top.sort((a, b) => a - b);
const pct = (p) => top[Math.floor((p / 100) * (top.length - 1))];
console.log('top cap verts', top.length, 'rMax', top.at(-1).toFixed(3));
for (const p of [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]) {
  console.log(`  r pct ${p}:`, pct(p).toFixed(3), 'norm', (pct(p) / top.at(-1)).toFixed(3));
}

// histogram bands
const rMax = top.at(-1);
const bands = {};
for (const r of top) {
  const b = Math.floor((r / rMax) * 20) / 20;
  bands[b] = (bands[b] || 0) + 1;
}
console.log('bands:', Object.entries(bands).sort((a,b)=>+a[0]-+b[0]).map(([b,c])=>`${b}:${c}`).join(' '));
