/**
 * Color Ray Striker / Ray Unicorno — same mesh layout as Storm Pegasus.
 * Preserves all 16 sub-meshes (no merge/decimate) so size and spin axis match pegasus.
 *
 * Input:  beystoadd/rayStriker.glb
 *         beystoadd/raystrikercolour.jpeg
 * Output: ray_striker.glb (+ ray_striker_texture.png)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'beystoadd/rayStriker.glb');
const REF_JPG = resolve(ROOT, 'beystoadd/raystrikercolour.jpeg');
const OUTPUT = resolve(ROOT, 'ray_striker.glb');
const TEX_DEBUG = resolve(ROOT, 'ray_striker_texture.png');
const TEX_SIZE = 2048;
const FACEBOLT_TEX_DEBUG = resolve(ROOT, 'ray_striker_facebolt.png');
const FACEBOLT_TEX_SIZE = 512;

const COLORS = {
  silver: [0.80, 0.84, 0.84, 1],
  silverDark: [0.48, 0.52, 0.54, 1],
  teal: [0.04, 0.78, 0.65, 1],
  tealDeep: [0.02, 0.47, 0.44, 1],
  orange: [1.0, 0.38, 0.08, 1],
  navy: [0.04, 0.12, 0.46, 1],
  navyDeep: [0.02, 0.05, 0.22, 1],
  purple: [0.31, 0.24, 0.78, 1],
  gold: [1.0, 0.88, 0.02, 1],
  lime: [0.70, 0.95, 0.05, 1],
  track: [0.13, 0.12, 0.15, 1],
  cream: [1.0, 0.96, 0.78, 1],
  white: [1, 1, 1, 1],
};

/** Per-material palette (same material names as storm_pegasus.glb). */
const MATERIAL_COLORS = {
  'Material.045': { color: COLORS.white, metal: 0.35, rough: 0.55, texture: true },
  'Material.025': { color: COLORS.track, metal: 0, rough: 0.7 },
  'Material.028': { color: COLORS.gold, metal: 0, rough: 0.45 },
  'Material.027': { color: COLORS.orange, metal: 0, rough: 0.5 },
  'Material.026': { color: COLORS.cream, metal: 0, rough: 0.55 },
  'Material.031': { color: COLORS.teal, metal: 0, rough: 0.5 },
  'Material.032': { color: COLORS.orange, metal: 0, rough: 0.5 },
  'Material.030': { color: COLORS.tealDeep, metal: 0, rough: 0.5 },
  'Material.033': { color: COLORS.teal, metal: 0, rough: 0.48 },
  'Material.043': { color: COLORS.gold, metal: 0, rough: 0.45 },
  'Material.041': { color: COLORS.lime, metal: 0, rough: 0.5 },
  'Material.040': { color: COLORS.navy, metal: 0, rough: 0.5 },
  'Material.042': { color: COLORS.gold, metal: 0, rough: 0.45 },
  'Material.044': { color: COLORS.orange, metal: 0, rough: 0.5 },
};

function hypot2(x, y) {
  return Math.hypot(x, y);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function rgb255(c) {
  return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
}

const FACE_RADIUS = 0.24;
const RING_OUTER = 0.66;

function sampleRef(ref, refW, refH, refCx, refCy, refR, u, v) {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2;
  const r = hypot2(dx, dy);
  if (r > 1) return rgb255(COLORS.silverDark);
  const sx = Math.round(refCx + dx * refR);
  const sy = Math.round(refCy + dy * refR);
  if (sx < 0 || sx >= refW || sy < 0 || sy >= refH) return rgb255(COLORS.silverDark);
  const i = (sy * refW + sx) * 4;
  return [ref[i], ref[i + 1], ref[i + 2]];
}

function cleanReferencePixel(rgb, r) {
  const [red, green, blue] = rgb;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lum = (red + green + blue) / 3;

  const isSpace = r > 0.72 && blue > red * 1.15 && blue > green * 1.4 && lum < 100;
  if (isSpace) return rgb255(COLORS.silver);

  const isOuterMetal = r > RING_OUTER && max - min < 55 && lum > 80;
  if (isOuterMetal) {
    return [
      Math.round(mix(red, 228, 0.42)),
      Math.round(mix(green, 232, 0.42)),
      Math.round(mix(blue, 236, 0.42)),
    ];
  }

  return rgb;
}

function buildTopTexture() {
  const refImg = jpeg.decode(readFileSync(REF_JPG), { useTArray: true });
  const refW = refImg.width;
  const refH = refImg.height;
  const refCx = refW / 2;
  const refCy = refH / 2;
  const refR = Math.min(refW, refH) * 0.465;
  const cx = TEX_SIZE / 2;
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - cx;
      const dy = y - cx;
      const r = hypot2(dx, dy) / cx;
      const i = (y * TEX_SIZE + x) * 4;
      const rgb = cleanReferencePixel(
        sampleRef(refImg.data, refW, refH, refCx, refCy, refR, x / TEX_SIZE, y / TEX_SIZE),
        r
      );
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }

  const png = new PNG({ width: TEX_SIZE, height: TEX_SIZE });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

function insideFlatTopHex(x, y) {
  const qx = Math.abs(x);
  const qy = Math.abs(y);
  return qx <= 1 && qy <= 0.866 && qx + qy / 1.732 <= 1;
}

function buildFaceboltTexture() {
  const refImg = jpeg.decode(readFileSync(REF_JPG), { useTArray: true });
  const refW = refImg.width;
  const refH = refImg.height;
  const refCx = refW / 2;
  const refCy = refH / 2;
  const refHalf = Math.min(refW, refH) * 0.205;
  const data = new Uint8Array(FACEBOLT_TEX_SIZE * FACEBOLT_TEX_SIZE * 4);

  for (let y = 0; y < FACEBOLT_TEX_SIZE; y++) {
    for (let x = 0; x < FACEBOLT_TEX_SIZE; x++) {
      const nx = (x / (FACEBOLT_TEX_SIZE - 1)) * 2 - 1;
      const ny = (y / (FACEBOLT_TEX_SIZE - 1)) * 2 - 1;
      const i = (y * FACEBOLT_TEX_SIZE + x) * 4;
      if (!insideFlatTopHex(nx * 1.05, ny * 1.05)) {
        data[i + 3] = 0;
        continue;
      }

      const sx = Math.max(0, Math.min(refW - 1, Math.round(refCx + nx * refHalf)));
      const sy = Math.max(0, Math.min(refH - 1, Math.round(refCy + ny * refHalf)));
      const si = (sy * refW + sx) * 4;
      data[i] = refImg.data[si];
      data[i + 1] = refImg.data[si + 1];
      data[i + 2] = refImg.data[si + 2];
      data[i + 3] = 255;
    }
  }

  const png = new PNG({ width: FACEBOLT_TEX_SIZE, height: FACEBOLT_TEX_SIZE });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

function getBounds(root) {
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')?.getArray();
      if (!pos) continue;
      for (let i = 0; i < pos.length; i += 3) {
        bounds.minX = Math.min(bounds.minX, pos[i]);
        bounds.maxX = Math.max(bounds.maxX, pos[i]);
        bounds.minY = Math.min(bounds.minY, pos[i + 1]);
        bounds.maxY = Math.max(bounds.maxY, pos[i + 1]);
        bounds.minZ = Math.min(bounds.minZ, pos[i + 2]);
        bounds.maxZ = Math.max(bounds.maxZ, pos[i + 2]);
      }
    }
  }

  return bounds;
}

function addFaceboltDecal(doc, faceboltTexture) {
  const root = doc.getRoot();
  const bounds = getBounds(root);
  const buffer = root.listBuffers()[0] || doc.createBuffer();
  const sizeX = bounds.maxX - bounds.minX;
  const sizeZ = bounds.maxZ - bounds.minZ;
  const side = Math.min(sizeX, sizeZ) * 0.235;
  const half = side / 2;
  const y = bounds.maxY + 0.002;

  const material = doc.createMaterial('RayStrikerFaceboltDecal')
    .setBaseColorTexture(faceboltTexture)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.42)
    .setAlphaMode('BLEND')
    .setDoubleSided(true);

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([
        -half, y, -half,
        half, y, -half,
        half, y, half,
        -half, y, half,
      ]))
      .setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor()
      .setType('VEC3')
      .setArray(new Float32Array([
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
      ]))
      .setBuffer(buffer))
    .setAttribute('TEXCOORD_0', doc.createAccessor()
      .setType('VEC2')
      .setArray(new Float32Array([
        0, 1,
        1, 1,
        1, 0,
        0, 0,
      ]))
      .setBuffer(buffer))
    .setIndices(doc.createAccessor()
      .setType('SCALAR')
      .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
      .setBuffer(buffer))
    .setMaterial(material);

  const mesh = doc.createMesh('RayStrikerFaceboltDecal').addPrimitive(prim);
  const node = doc.createNode('RayStrikerFaceboltDecal').setMesh(mesh);
  const scene = root.listScenes()[0] || doc.createScene('Scene');
  scene.addChild(node);
}

async function main() {
  console.log('Loading', INPUT);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(INPUT);
  const root = doc.getRoot();

  console.log('Building top texture...');
  const texBytes = buildTopTexture();
  writeFileSync(TEX_DEBUG, texBytes);
  const texture = doc.createTexture('ray-striker-top')
    .setMimeType('image/png')
    .setImage(texBytes);

  console.log('Building facebolt decal...');
  const faceboltBytes = buildFaceboltTexture();
  writeFileSync(FACEBOLT_TEX_DEBUG, faceboltBytes);
  const faceboltTexture = doc.createTexture('ray-striker-facebolt')
    .setMimeType('image/png')
    .setImage(faceboltBytes);

  for (const mat of root.listMaterials()) {
    const name = mat.getName();
    const spec = MATERIAL_COLORS[name];
    if (!spec) {
      console.warn('Unknown material:', name);
      continue;
    }
    mat
      .setBaseColorFactor(spec.color)
      .setMetallicFactor(spec.metal ?? 0)
      .setRoughnessFactor(spec.rough ?? 0.5);
    if (spec.texture) {
      mat.setBaseColorTexture(texture);
    }
    console.log('Updated', name);
  }

  console.log('Meshes preserved:', root.listMeshes().length);
  console.log('Writing', OUTPUT);
  await io.write(OUTPUT, doc);

  const outStat = readFileSync(OUTPUT);
  console.log(`Done. Output size: ${(outStat.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
