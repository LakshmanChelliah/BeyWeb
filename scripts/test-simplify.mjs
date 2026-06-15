import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, dedup, quantize, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('Rock_Leone.glb');
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION');
const idx = prim.getIndices();
console.log('before verts', pos.getCount(), 'indices', idx?.getCount?.() ?? 'none', 'mode', prim.getMode());

let doc2 = await io.read('Rock_Leone.glb');
const pos0 = doc2.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getArray();
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
for (let i=0;i<pos0.length;i+=3){
  minX=Math.min(minX,pos0[i]); maxX=Math.max(maxX,pos0[i]);
  minY=Math.min(minY,pos0[i+1]); maxY=Math.max(maxY,pos0[i+1]);
  minZ=Math.min(minZ,pos0[i+2]); maxZ=Math.max(maxZ,pos0[i+2]);
}
const maxDim = Math.max(maxX-minX,maxY-minY,maxZ-minZ);
const tol = maxDim * 0.02;
console.log('weld tol', tol);

await doc2.transform(
  weld({ tolerance: tol }),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.003, error: 0.05 }),
  dedup(),
  quantize(),
  prune()
);

const prim2 = doc2.getRoot().listMeshes()[0].listPrimitives()[0];
console.log('after verts', prim2.getAttribute('POSITION').getCount(), 'indices', prim2.getIndices()?.getCount?.() ?? 'none');
