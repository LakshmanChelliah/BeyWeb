import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'Rock_Leone.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const arr = prim.getAttribute('POSITION').getArray();
const norm = prim.getAttribute('NORMAL')?.getArray();

const cx = (23.085);
const cy = (-13.7565);

function analyze(axis) {
  const heights = [];
  const topByR = {};
  for (let i = 0; i < arr.length; i += 3) {
    const x = arr[i], y = arr[i + 1], z = arr[i + 2];
    let h, r, nh;
    if (axis === 'z') {
      h = z; r = Math.hypot(x - cx, y - cy); nh = norm ? norm[i + 2] : 0;
    } else if (axis === 'y') {
      h = y; r = Math.hypot(x - cx, z - (-13.7565)); nh = norm ? norm[i + 1] : 0;
    } else {
      h = x; r = Math.hypot(y - cy, z - (-13.7565)); nh = norm ? norm[i] : 0;
    }
    heights.push(h);
    if (norm && nh > 0.75) {
      const band = Math.floor(r);
      topByR[band] = (topByR[band] || 0) + 1;
    }
  }
  heights.sort((a, b) => a - b);
  const p = (pct) => heights[Math.floor((pct / 100) * (heights.length - 1))];
  console.log(`\nAxis ${axis}: h min=${heights[0].toFixed(2)} max=${heights.at(-1).toFixed(2)}`);
  console.log(`  height percentiles 5/15/30/50/70/85/95:`, [5,15,30,50,70,85,95].map(p).map(v => v.toFixed(2)).join(', '));
  const bands = Object.entries(topByR).map(([r,c]) => [+r,c]).sort((a,b)=>a[0]-b[0]);
  console.log('  top caps by radius:', bands.map(([r,c]) => `${r}:${c}`).join(' '));
}

analyze('z');
analyze('y');
analyze('x');
