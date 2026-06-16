/**
 * Simplify, color, and texture Flame Libra for BeyWeb.
 * Input:  Flame_Libra.glb + flame_libralogo.png
 * Output: flame_libra.glb
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, quantize, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, existsSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_INPUT = resolve(ROOT, 'Flame_Libra_RAW.glb');
const BAKED_OUTPUT = resolve(ROOT, 'flame_libra.glb');
const FACE_PNG = resolve(ROOT, 'flame_libralogo.png');
const TEX_SIZE = 2048;

// Sampled from flameLibraReferenceLook.png (product photo reference)
const REFERENCE_METAL = [0.635, 0.627, 0.636];
const REFERENCE_METAL_DARK = [0.545, 0.538, 0.545];
const REFERENCE_ENERGY = [0x88 / 255, 0xff / 255, 0x42 / 255];
const REFERENCE_ENERGY_DEEP = [0x72 / 255, 0xdb / 255, 0x38 / 255];

const COLORS = {
  silver: REFERENCE_METAL,
  silverDark: REFERENCE_METAL_DARK,
  energy: REFERENCE_ENERGY,
  energyDeep: REFERENCE_ENERGY_DEEP,
  navy: [0.08, 0.12, 0.38],
  faceBoltBg: [0xf5 / 255, 0xc0 / 255, 0x18 / 255], // flameLibraReferenceLook.jpg
  track: [0.15, 0.16, 0.18],
  tip: [0.90, 0.91, 0.93],
  white: [1, 1, 1],
};

// Facebolt hex ends ~r 0.26 on the baked mesh; energy ring starts outside that.
const RING_INNER = 0.26;
const RING_OUTER = 0.76;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function hypot2(x, y) {
  return Math.hypot(x, y);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function blit(dst, dstW, dstH, src, srcW, srcH, left, top, opaque = false) {
  for (let sy = 0; sy < srcH; sy++) {
    const dy = top + sy;
    if (dy < 0 || dy >= dstH) continue;
    for (let sx = 0; sx < srcW; sx++) {
      const dx = left + sx;
      if (dx < 0 || dx >= dstW) continue;
      const si = (sy * srcW + sx) * 4;
      const di = (dy * dstW + dx) * 4;
      const sr = src[si];
      const sg = src[si + 1];
      const sb = src[si + 2];
      const sa = src[si + 3] / 255;
      if (sa <= 0.01) continue;
      if (opaque) {
        dst[di] = sr;
        dst[di + 1] = sg;
        dst[di + 2] = sb;
        dst[di + 3] = 255;
        continue;
      }
      let blendA = sa;
      // Logo PNG ships with a solid black matte — treat as transparent.
      if (sr + sg + sb < 48) continue;
      if (blendA <= 0.01) blendA = 1;
      const inv = 1 - blendA;
      dst[di] = Math.round(sr * blendA + dst[di] * inv);
      dst[di + 1] = Math.round(sg * blendA + dst[di + 1] * inv);
      dst[di + 2] = Math.round(sb * blendA + dst[di + 2] * inv);
      dst[di + 3] = 255;
    }
  }
}

/** Libra logo has blue/gray art on black — remap to navy and skip yellow so it doesn't green-tint the disc. */
function prepareFaceLogo(src) {
  const out = new Uint8Array(src.length);
  const navy = COLORS.navy.map((c) => Math.round(c * 255));
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const a = src[i + 3];
    if (a < 10 || r + g + b < 48) continue;
    // Yellow border in the PNG — keep the baked golden disc underneath.
    if (r > 175 && g > 150 && b < 130) continue;
    out[i] = navy[0];
    out[i + 1] = navy[1];
    out[i + 2] = navy[2];
    out[i + 3] = 255;
  }
  return out;
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

// Top-down texture radius matches mesh UV: rim maps to r=1.
function textureRadius(dx, dy, cx) {
  return Math.min(1, hypot2(dx, dy) / cx * 2);
}

/** Radial top-down texture: facebolt, chartreuse energy ring, Pegasus-gray wheel. */
function buildTopTexture() {
  const cx = TEX_SIZE / 2;
  const data = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);

  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dx = x - cx;
      const dy = y - cx;
      const r = textureRadius(dx, dy, cx);
      const ang = Math.atan2(dy, dx);
      const i = (y * TEX_SIZE + x) * 4;

      let rgb;

      if (r < RING_INNER) {
        rgb = COLORS.faceBoltBg.map((c) => Math.round(c * 255));
      } else if (r < RING_OUTER) {
        // White here — vertex colors on the top cap supply the chartreuse ring.
        rgb = [255, 255, 255];
        const navyWedge =
          Math.abs(Math.sin(ang)) < 0.32 && r > RING_INNER + 0.02 && r < RING_OUTER - 0.04;
        if (navyWedge) {
          rgb = COLORS.navy.map((c) => Math.round(c * 255));
        }
      } else if (r < 0.96) {
        const bump = 0.5 + 0.5 * Math.cos(ang * 4);
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
  // Logo must fit inside the yellow facebolt disc (r < RING_INNER in texture space).
  const faceRadiusPx = (RING_INNER / 2) * cx;
  const faceSize = Math.round(faceRadiusPx * 2 * 0.88);
  const face = resizeNearest(faceImg.data, faceImg.width, faceImg.height, faceSize, faceSize);
  const facePrepared = prepareFaceLogo(face);
  blit(data, TEX_SIZE, TEX_SIZE, facePrepared, faceSize, faceSize, Math.round(cx - faceSize / 2), Math.round(cx - faceSize / 2), true);

  const png = new PNG({ width: TEX_SIZE, height: TEX_SIZE });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

/** Top cap points toward -Z in the baked mesh (game loader applies +PI/2 X). */
function isTopCap(nx, ny, nz) {
  return nz < -0.28;
}

function topCapPaint(rNorm) {
  // White vertex × yellow texture = reference golden yellow on the bolt face.
  if (rNorm < RING_INNER) return { rgb: COLORS.white, alpha: 1 };
  if (rNorm < RING_OUTER) return { rgb: COLORS.energy, alpha: 1 };
  return { rgb: COLORS.white, alpha: 1 };
}

function sidePaint(h, r) {
  if (h < 0.14) return { rgb: COLORS.tip, alpha: 1 };
  if (h < 0.32) return { rgb: COLORS.track, alpha: 1 };
  // Facebolt hex sidewalls — vertex color only (no top-down UV on sides).
  if (r < RING_INNER && h >= 0.35) return { rgb: COLORS.faceBoltBg, alpha: 1 };
  // Clear-wheel sidewalls
  if (r >= RING_INNER && r < RING_OUTER && h >= 0.10 && h < 0.58) {
    return { rgb: COLORS.energy, alpha: 1 };
  }
  if (h < 0.74) return { rgb: r > 0.62 ? COLORS.silver : COLORS.silverDark, alpha: 1 };
  return { rgb: COLORS.silver, alpha: 1 };
}

function vertexPaint(x, y, z, nx, ny, nz, rMax, zMin, zMax) {
  const h = clamp01((z - zMin) / (zMax - zMin));
  const r = hypot2(x, y) / rMax;

  if (isTopCap(nx, ny, nz)) {
    return topCapPaint(r);
  }
  return sidePaint(h, r);
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
  const hasRaw = existsSync(RAW_INPUT) && statSync(RAW_INPUT).size > 5_000_000;
  const inputPath = hasRaw ? RAW_INPUT : BAKED_OUTPUT;
  if (!existsSync(inputPath)) {
    console.error('Missing input — place Flame_Libra_RAW.glb or an existing flame_libra.glb in the repo root.');
    process.exit(1);
  }

  console.log('Loading', inputPath, hasRaw ? '(full decimate)' : '(repaint baked mesh)');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(inputPath);
  const root = doc.getRoot();
  const mesh = root.listMeshes()[0];
  const prim = mesh.listPrimitives()[0];

  let vCount;
  let positions;
  let normals;
  let indices;

  if (hasRaw) {
    const srcIdx = prim.getIndices()?.getCount?.() ?? 0;
    const targetIndices = Math.max(12000, Math.floor((srcIdx * 0.012) / 3) * 3);
    const safeTarget = Math.min(targetIndices, srcIdx);
    console.log(`Decimating ${srcIdx} indices -> ~${safeTarget}...`);
    [vCount, positions, normals, indices] = await decimatePrimitive(prim, safeTarget);
    console.log('Vertices after decimate:', vCount, 'indices:', indices.length);
  } else {
    positions = new Float32Array(prim.getAttribute('POSITION').getArray());
    normals = new Float32Array(prim.getAttribute('NORMAL').getArray());
    indices = new Uint32Array(prim.getIndices().getArray());
    vCount = positions.length / 3;
    console.log('Repainting existing mesh:', vCount, 'verts');
  }

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
  let topCapVerts = 0;
  let ringVerts = 0;

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
    if (isTopCap(nx, ny, nz)) {
      topCapVerts++;
      const r = hypot2(x, y) / rMax;
      if (r >= RING_INNER && r < RING_OUTER) ringVerts++;
    }
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

  console.log(`Painted ${count} verts (${topCapVerts} top-cap, ${ringVerts} ring)`);

  console.log('Building top texture...');
  const texBytes = buildTopTexture();
  writeFileSync(resolve(ROOT, 'flame_libra_texture.png'), texBytes);

  const texture = doc.createTexture('libra-top')
    .setMimeType('image/png')
    .setImage(texBytes);
  const material = doc.createMaterial('FlameLibra')
    .setBaseColorTexture(texture)
    .setMetallicFactor(0.28)
    .setRoughnessFactor(0.58)
    .setAlphaMode('OPAQUE')
    .setDoubleSided(true);

  prim.setMaterial(material);
  mesh.setName('FlameLibra');

  await doc.transform(dedup(), quantize({ pattern: /^(POSITION|NORMAL|TEXCOORD_0)$/ }), prune());

  const tempPath = resolve(ROOT, 'flame_libra.tmp.glb');
  console.log('Writing', tempPath);
  await io.write(tempPath, doc);
  if (existsSync(BAKED_OUTPUT)) unlinkSync(BAKED_OUTPUT);
  renameSync(tempPath, BAKED_OUTPUT);

  const outStat = readFileSync(BAKED_OUTPUT);
  console.log(`Done. Output size: ${(outStat.length / 1024 / 1024).toFixed(2)} MB, vertices: ${count}`);

  if (outStat.length < 15 * 1024 * 1024) {
    const beysPath = resolve(ROOT, 'js/game/beys.js');
    let beys = readFileSync(beysPath, 'utf8');
    beys = beys.replace(
      /id: 'libra',[\s\S]*?available: false,/,
      (block) => block.replace('available: false,', 'available: true,')
    );
    writeFileSync(beysPath, beys);
    console.log('Enabled Flame Libra in js/game/beys.js');
  } else {
    console.warn('Output still large — keeping Flame Libra locked until size is under 15 MB.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
