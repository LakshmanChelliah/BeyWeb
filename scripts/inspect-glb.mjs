import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] || 'storm_pegasus.glb');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
const root = doc.getRoot();

console.log(`\n=== ${file} ===\n`);

for (const mesh of root.listMeshes()) {
  console.log(`Mesh: ${mesh.getName() || '(unnamed)'}`);
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    const base = mat?.getBaseColorFactor?.() ?? null;
    const metallic = mat?.getMetallicFactor?.() ?? null;
    const rough = mat?.getRoughnessFactor?.() ?? null;
    console.log(
      `  prim material: ${mat?.getName() || '(none)'} base=${base ? base.map((v) => v.toFixed(2)).join(',') : 'n/a'} metal=${metallic} rough=${rough}`
    );
  }
}

for (const mat of root.listMaterials()) {
  const base = mat.getBaseColorFactor();
  console.log(
    `Material: ${mat.getName() || '(unnamed)'} base=[${base.map((v) => v.toFixed(2)).join(', ')}] metal=${mat.getMetallicFactor()} rough=${mat.getRoughnessFactor()}`
  );
}
