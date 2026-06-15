import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'Rock_Leone.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();

for (const mesh of root.listMeshes()) {
  const prim = mesh.listPrimitives()[0];
  const pos = prim.getAttribute('POSITION');
  if (!pos) continue;

  const arr = pos.getArray();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const radii = [];
  const ys = [];

  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    radii.push(Math.hypot(x, z));
    ys.push(y);
  }

  radii.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const pct = (p) => {
    const idx = Math.floor((p / 100) * (radii.length - 1));
    return { r: radii[idx], y: ys[idx] };
  };

  console.log(`Mesh: ${mesh.getName()} vertices=${arr.length / 3}`);
  console.log(`  bbox X:[${minX.toFixed(3)}, ${maxX.toFixed(3)}] Y:[${minY.toFixed(3)}, ${maxY.toFixed(3)}] Z:[${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]`);
  console.log(`  radius pct 10/25/50/75/90/95/99:`, [10,25,50,75,90,95,99].map(p => pct(p).r.toFixed(3)).join(', '));
  console.log(`  height pct 10/25/50/75/90/95/99:`, [10,25,50,75,90,95,99].map(p => pct(p).y.toFixed(3)).join(', '));

  // Sample top-facing verts (normal up)
  const norm = prim.getAttribute('NORMAL');
  if (norm) {
    const n = norm.getArray();
    const topBands = {};
    for (let i = 0; i < arr.length; i += 3) {
      const ny = n[i + 1];
      if (ny < 0.7) continue;
      const x = arr[i], y = arr[i + 1], z = arr[i + 2];
      const r = Math.hypot(x, z);
      const band = Math.floor(r * 20) / 20;
      topBands[band] = (topBands[band] || 0) + 1;
    }
    const bands = Object.entries(topBands).map(([r,c]) => [parseFloat(r), c]).sort((a,b)=>a[0]-b[0]);
    console.log('  top-facing verts by radius band (sample):', bands.slice(0, 20).map(([r,c]) => `${r.toFixed(2)}:${c}`).join(' | '));
  }
}
