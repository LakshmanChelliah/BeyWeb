/**
 * Lighten Storm Pegasus fusion-wheel metal from near-black to brushed gray.
 * Material.045 uses metalness=1, which reads black without an environment map.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLB = resolve(ROOT, 'storm_pegasus.glb');

const METAL_GRAY = [0.40, 0.42, 0.46, 1];
const METALNESS = 0.35;
const ROUGHNESS = 0.55;
const METAL_MATERIAL = 'Material.045';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(GLB);
const root = doc.getRoot();

const mat = root.listMaterials().find((m) => m.getName() === METAL_MATERIAL);
if (!mat) {
  console.error(`Material ${METAL_MATERIAL} not found in storm_pegasus.glb`);
  process.exit(1);
}

mat
  .setBaseColorFactor(METAL_GRAY)
  .setMetallicFactor(METALNESS)
  .setRoughnessFactor(ROUGHNESS);
console.log(`Updated ${mat.getName()} → dark gray metal`);

await io.write(GLB, doc);
console.log(`Wrote ${GLB}`);
