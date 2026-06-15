/**
 * Re-bake Rock Leone top colors without re-decimating.
 * Top cap: white vertex tint + radial texture (facebolt / green ring / silver wheel).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, quantize, prune } from '@gltf-transform/functions';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GLB = resolve(ROOT, 'rock_leone.glb');
const FACE_PNG = resolve(ROOT, 'rockleonelogandFacebolt.png');
const TEX_SIZE = 2048;

const COLORS = {
  silver: [0.72, 0.75, 0.78],
  silverDark: [0.55, 0.58, 0.62],
  green: [0.12, 0.85, 0.40],
  greenBright: [0.18, 0.92, 0.48],
  camoTan: [0.77, 0.65, 0.45],
  camoBrown: [0.35, 0.26, 0.18],
  camoOlive: [0.45, 0.50, 0.28],
  track: [0.22, 0.24, 0.28],
  tip: [0.91, 0.92, 0.94],
  white: [1, 1, 1],
};

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
      dst[di + 3] = 255;
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

// Top-down texture radius matches mesh UV: rim maps to r=1 (not 0.5).
function textureRadius(dx, dy, cx) {
  return Math.min(1, hypot2(dx, dy) / cx * 2);
}

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

      if (r < 0.17) {
        rgb = [248, 248, 248];
      } else if (r < 0.76) {
        rgb = [255, 255, 255];
      } else if (r < 0.96) {
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
  const faceSize = Math.round(TEX_SIZE * 0.32);
  const face = resizeNearest(faceImg.data, faceImg.width, faceImg.height, faceSize, faceSize);
  blit(data, TEX_SIZE, TEX_SIZE, face, faceSize, faceSize, Math.round(cx - faceSize / 2), Math.round(cx - faceSize / 2));

  const png = new PNG({ width: TEX_SIZE, height: TEX_SIZE });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

/** Top cap points toward -Z in the baked mesh (game loader applies +PI/2 X). */
function isTopCap(nx, ny, nz) {
  return nz < -0.28;
}

function topCapPaint(rNorm) {
  if (rNorm < 0.16) return { rgb: COLORS.white, alpha: 1 };
  if (rNorm < 0.76) return { rgb: COLORS.greenBright, alpha: 1 };
  return { rgb: COLORS.white, alpha: 1 };
}

function sidePaint(h, r) {
  if (h < 0.14) return { rgb: COLORS.tip, alpha: 1 };
  if (h < 0.32) return { rgb: COLORS.track, alpha: 1 };
  if (h < 0.74) return { rgb: r > 0.62 ? COLORS.silver : COLORS.silverDark, alpha: 1 };
  if (h < 0.9) return { rgb: COLORS.green, alpha: 1 };
  return { rgb: COLORS.silver, alpha: 1 };
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(GLB);
const root = doc.getRoot();
const prim = root.listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray();
const norm = prim.getAttribute('NORMAL').getArray();
const count = pos.length / 3;

let minZ = Infinity, maxZ = -Infinity, rMax = 0;
for (let i = 0; i < count; i++) {
  const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
  minZ = Math.min(minZ, z);
  maxZ = Math.max(maxZ, z);
  rMax = Math.max(rMax, hypot2(x, y));
}
const zSpan = maxZ - minZ || 1;

const colors = new Float32Array(count * 4);
const uvs = new Float32Array(count * 2);
let topVerts = 0;

for (let i = 0; i < count; i++) {
  const x = pos[i * 3];
  const y = pos[i * 3 + 1];
  const z = pos[i * 3 + 2];
  const nx = norm[i * 3];
  const ny = norm[i * 3 + 1];
  const nz = norm[i * 3 + 2];
  const h = (z - minZ) / zSpan;
  const r = hypot2(x, y) / rMax;

  uvs[i * 2] = x / (2 * rMax) + 0.5;
  uvs[i * 2 + 1] = y / (2 * rMax) + 0.5;

  if (isTopCap(nx, ny, nz)) {
    topVerts++;
    const paint = topCapPaint(r);
    colors[i * 4] = paint.rgb[0];
    colors[i * 4 + 1] = paint.rgb[1];
    colors[i * 4 + 2] = paint.rgb[2];
    colors[i * 4 + 3] = paint.alpha;
  } else {
    const paint = sidePaint(h, r);
    colors[i * 4] = paint.rgb[0];
    colors[i * 4 + 1] = paint.rgb[1];
    colors[i * 4 + 2] = paint.rgb[2];
    colors[i * 4 + 3] = paint.alpha;
  }
}

console.log(`Repainting ${count} verts (${topVerts} top-cap)`);

const buffer = root.listBuffers()[0] || doc.createBuffer();
prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(colors).setBuffer(buffer));
prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uvs).setBuffer(buffer));

const texBytes = buildTopTexture();
writeFileSync(resolve(ROOT, 'rock_leone_texture.png'), texBytes);

const texture = doc.createTexture('leone-top').setMimeType('image/png').setImage(texBytes);
const material = doc.createMaterial('RockLeone')
  .setBaseColorTexture(texture)
  .setMetallicFactor(0.15)
  .setRoughnessFactor(0.48)
  .setAlphaMode('OPAQUE')
  .setDoubleSided(true);
prim.setMaterial(material);

await doc.transform(dedup(), quantize(), prune());
await io.write(GLB, doc);
console.log('Updated', GLB);
