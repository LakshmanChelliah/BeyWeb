/**
 * Simplify, color, and texture Rock Leone for BeyWeb.
 * Input:  Rock_Leone.glb + rockleonelogandFacebolt.png
 * Output: rock_leone.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, quantize, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'Rock_Leone.glb');
const FACE_PNG = resolve(ROOT, 'rockleonelogandFacebolt.png');
const OUTPUT = resolve(ROOT, 'rock_leone.glb'); // do NOT delete before write — Windows paths are case-insensitive
const TEX_SIZE = 2048;

const COLORS = {
  silver: [0.66, 0.69, 0.72],
  silverDark: [0.48, 0.51, 0.55],
  green: [0.16, 0.72, 0.42],
  greenDeep: [0.10, 0.55, 0.32],
  camoTan: [0.77, 0.65, 0.45],
  camoBrown: [0.35, 0.26, 0.18],
  camoOlive: [0.45, 0.50, 0.28],
  track: [0.17, 0.19, 0.22],
  tip: [0.91, 0.92, 0.94],
  white: [1, 1, 1],
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function hypot2(x, y) {
  return Math.hypot(x, y);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function blit(dst, dstW, dstH, src, srcW, srcH, left, top) {
  for (let sy = 0; sy < srcH; sy++) {
    const dy = top + sy;
    if (dy < 0 || dy >= dstH) continue;
    for (let sx = 0; sx < srcW; sx++) {
      const dx = left + sx;
      if (dx < 0 || dx >= dstW) continue;
      const si = (sy * srcW + sx) * 4;
      const di = (dy * dstW + dx) * 4;
      const sa = src[si + 3] / 255;
      if (sa <= 0.01) continue;
      const inv = 1 - sa;
      dst[di] = Math.round(src[si] * sa + dst[di] * inv);
      dst[di + 1] = Math.round(src[si + 1] * sa + dst[di + 1] * inv);
      dst[di + 2] = Math.round(src[si + 2] * sa + dst[di + 2] * inv);
      dst[di + 3] = Math.round(255 * sa + dst[di + 3] * inv);
    }
  }
}

function resizeNearest(src, srcW, srcH, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y / dstH) * srcH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x / dstW) * srcW));
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return out;
}

/** Radial top-down texture: facebolt, green ring + camo, silver wheel. */
function buildTopTexture() {
  const cx = TEX_SIZE / 2;
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - cx;
      const dy = y - cx;
      const r = hypot2(dx, dy) / cx;
      const ang = Math.atan2(dy, dx);
      const i = (y * TEX_SIZE + x) * 4;

      let rgb = [...COLORS.silver];

      if (r < 0.14) {
        rgb = [248, 248, 248];
      } else if (r < 0.38) {
        rgb = [45, 185, 105];
        const camo =
          (Math.abs(Math.sin(ang * 2.1 + 0.4)) > 0.55 && r > 0.2 && r < 0.34) ||
          (Math.abs(Math.cos(ang * 1.7 - 1.2)) > 0.62 && r > 0.22 && r < 0.33);
        if (camo) {
          const pick = (Math.sin(ang * 5 + r * 20) + Math.cos(r * 30)) * 0.5;
          const src = pick > 0.25 ? COLORS.camoTan : pick > -0.15 ? COLORS.camoOlive : COLORS.camoBrown;
          rgb = src.map((c) => Math.round(c * 255));
        }
      } else if (r < 0.9) {
        const bump = 0.5 + 0.5 * Math.cos(ang * 6);
        rgb = [
          Math.round(mix(COLORS.silverDark[0], COLORS.silver[0], bump) * 255),
          Math.round(mix(COLORS.silverDark[1], COLORS.silver[1], bump) * 255),
          Math.round(mix(COLORS.silverDark[2], COLORS.silver[2], bump) * 255),
        ];
      } else {
        rgb = COLORS.silverDark.map((c) => Math.round(c * 255));
      }

      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }

  const faceImg = PNG.sync.read(readFileSync(FACE_PNG));
  const faceSize = Math.round(TEX_SIZE * 0.34);
  const face = resizeNearest(faceImg.data, faceImg.width, faceImg.height, faceSize, faceSize);
  blit(data, TEX_SIZE, TEX_SIZE, face, faceSize, faceSize, Math.round(cx - faceSize / 2), Math.round(cx - faceSize / 2));

  const png = new PNG({ width: TEX_SIZE, height: TEX_SIZE });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

function vertexPaint(x, y, z, nx, ny, nz, rMax, zMin, zMax) {
  const h = clamp01((z - zMin) / (zMax - zMin));
  const r = hypot2(x, y) / rMax;
  // Baked mesh top cap faces -Z (loader uses +PI/2 X for Leone).
  const topCap = nz < -0.45;

  if (topCap) {
    return { rgb: COLORS.white, alpha: 1 };
  }

  if (h < 0.14) return { rgb: COLORS.tip, alpha: 1 };
  if (h < 0.32) return { rgb: COLORS.track, alpha: 1 };
  if (h < 0.74) return { rgb: r > 0.62 ? COLORS.silver : COLORS.silverDark, alpha: 1 };
  if (h < 0.9) return { rgb: COLORS.green, alpha: 1 };
  return { rgb: COLORS.silver, alpha: 1 };
}

function computeNormals(pos, indices) {
  const normals = new Float32Array(pos.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const ax = pos[ib] - pos[ia], ay = pos[ib + 1] - pos[ia + 1], az = pos[ib + 2] - pos[ia + 2];
    const bx = pos[ic] - pos[ia], by = pos[ic + 1] - pos[ia + 1], bz = pos[ic + 2] - pos[ia + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    for (const k of [ia, ib, ic]) {
      normals[k] += nx;
      normals[k + 1] += ny;
      normals[k + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
}

function remapMesh(pos, indices) {
  const map = new Map();
  const outPos = [];
  const outIdx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    const old = indices[i];
    if (!map.has(old)) {
      map.set(old, map.size);
      outPos.push(pos[old * 3], pos[old * 3 + 1], pos[old * 3 + 2]);
    }
    outIdx[i] = map.get(old);
  }
  return { positions: new Float32Array(outPos), indices: outIdx };
}

async function decimatePrimitive(prim, targetIndexCount) {
  await MeshoptSimplifier.ready;
  const posAttr = prim.getAttribute('POSITION');
  const srcPos = new Float32Array(posAttr.getArray());
  const srcIdx = new Uint32Array(prim.getIndices().getArray());
  const stride = 3;

  const [simpIdx] = MeshoptSimplifier.simplifySloppy(
    srcIdx,
    srcPos,
    stride,
    null,
    targetIndexCount,
    0.06
  );
  const compact = remapMesh(srcPos, simpIdx);
  const normals = computeNormals(compact.positions, compact.indices);
  return [compact.positions.length / 3, compact.positions, normals, compact.indices];
}

async function main() {
  console.log('Loading', INPUT);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(INPUT);
  const root = doc.getRoot();
  const mesh = root.listMeshes()[0];
  const prim = mesh.listPrimitives()[0];

  const srcIdx = prim.getIndices()?.getCount?.() ?? 0;
  const targetIndices = Math.max(12000, Math.floor((srcIdx * 0.012) / 3) * 3);
  console.log(`Decimating ${srcIdx} indices -> ~${targetIndices}...`);

  const [vCount, positions, normals, indices] = await decimatePrimitive(prim, targetIndices);
  console.log('Vertices after decimate:', vCount, 'indices:', indices.length);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const zMin = minZ;
  const zMax = maxZ;

  let rMax = 0;
  for (let i = 0; i < vCount; i++) {
    const x = positions[i * 3] - cx;
    const y = positions[i * 3 + 1] - cy;
    rMax = Math.max(rMax, hypot2(x, y));
  }

  const centered = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 4);
  const uvs = new Float32Array(vCount * 2);
  const centeredNormals = new Float32Array(vCount * 3);

  for (let i = 0; i < vCount; i++) {
    const x = positions[i * 3] - cx;
    const y = positions[i * 3 + 1] - cy;
    const z = positions[i * 3 + 2] - zMin;
    centered[i * 3] = x;
    centered[i * 3 + 1] = y;
    centered[i * 3 + 2] = z;

    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    centeredNormals[i * 3] = nx;
    centeredNormals[i * 3 + 1] = ny;
    centeredNormals[i * 3 + 2] = nz;

    const paint = vertexPaint(x, y, z, nx, ny, nz, rMax, 0, zMax - zMin);
    colors[i * 4] = paint.rgb[0];
    colors[i * 4 + 1] = paint.rgb[1];
    colors[i * 4 + 2] = paint.rgb[2];
    colors[i * 4 + 3] = paint.alpha;

    uvs[i * 2] = x / (2 * rMax) + 0.5;
    uvs[i * 2 + 1] = y / (2 * rMax) + 0.5;
  }

  const buffer = root.listBuffers()[0] || doc.createBuffer();
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(centered).setBuffer(buffer));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(centeredNormals).setBuffer(buffer));
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(colors).setBuffer(buffer));
  prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer));
  const count = vCount;

  console.log('Building top texture...');
  const texBytes = buildTopTexture();
  writeFileSync(resolve(ROOT, 'rock_leone_texture.png'), texBytes);

  const texture = doc.createTexture('leone-top')
    .setMimeType('image/png')
    .setImage(texBytes);
  const material = doc.createMaterial('RockLeone')
    .setBaseColorTexture(texture)
    .setMetallicFactor(0.5)
    .setRoughnessFactor(0.38)
    .setAlphaMode('OPAQUE')
    .setDoubleSided(true);

  prim.setMaterial(material);
  mesh.setName('RockLeone');

  await doc.transform(dedup(), quantize(), prune());

  console.log('Writing', OUTPUT);
  await io.write(OUTPUT, doc);

  const outStat = readFileSync(OUTPUT);
  console.log(`Done. Output size: ${(outStat.length / 1024 / 1024).toFixed(2)} MB, vertices: ${count}`);

  if (outStat.length < 15 * 1024 * 1024) {
    const beysPath = resolve(ROOT, 'js/game/beys.js');
    let beys = readFileSync(beysPath, 'utf8');
    beys = beys.replace(
      /id: 'leone',[\s\S]*?available: false,/,
      (block) => block.replace('available: false,', 'available: true,')
    );
    writeFileSync(beysPath, beys);
    console.log('Enabled Rock Leone in js/game/beys.js');
  } else {
    console.warn('Output still large — keeping Rock Leone locked until size is under 15 MB.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
