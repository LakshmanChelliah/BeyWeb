/**
 * Build Ray Striker / Ray Unicorno emblem from the top-down reference.
 * Keeps only the gold unicorn symbol from the purple facebolt (no hex background).
 * Input:  beystoadd/raystrikercolour.jpeg
 * Output: ray_striker_logo.png
 */
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'beystoadd/raystrikercolour.jpeg');
const OUTPUT = resolve(ROOT, 'ray_striker_logo.png');
const SIZE = 512;
const PAD = 0.1;
const SYMBOL_MAX_R = 0.13;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
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
  return { data: out, width: dstW, height: dstH };
}

/** Keep gold/orange unicorn art only; drop purple hex, teal ring, and metal. */
function symbolAlpha(r, g, b) {
  const lum = (r + g + b) / 3;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;

  if (lum < 55) return 0;

  const isPurpleBolt = b > r * 1.02 && b > g * 1.08 && r < 175 && b > 55;
  if (isPurpleBolt) return 0;

  const isTeal = g > r * 1.02 && g > 95 && b > 65 && sat > 14;
  if (isTeal) return 0;

  const isSilver = sat < 32 && lum > 88;
  if (isSilver) return 0;

  const isGold = r > 105 && g > 75 && b < r * 0.92 && sat > 18;
  const isOrangeHorn = r > 125 && g > 45 && g < r * 0.98 && b < 95;
  const isLimeOutline = g > 115 && r > 70 && b < 110 && g >= r * 0.85 && sat > 22;

  if (isGold || isOrangeHorn) return 1;
  if (isLimeOutline) return 0.9;
  return 0;
}

function buildLogo() {
  const jpg = jpeg.decode(readFileSync(INPUT), { useTArray: true });
  const trimmed = resizeNearest(jpg.data, jpg.width, jpg.height, SIZE, SIZE);
  const { data } = trimmed;
  const cx = SIZE / 2;
  const alpha = new Uint8Array(SIZE * SIZE);

  let minX = SIZE;
  let minY = SIZE;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - cx;
      const dy = y - cx;
      const normR = Math.hypot(dx, dy) / (SIZE / 2);
      const i = (y * SIZE + x) * 4;
      const a = normR <= SYMBOL_MAX_R * 1.15
        ? Math.round(symbolAlpha(data[i], data[i + 1], data[i + 2]) * 255)
        : 0;
      alpha[y * SIZE + x] = a;
      if (a > 48) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX) {
    throw new Error('No unicorn symbol pixels found in reference crop');
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const fit = Math.floor(SIZE * (1 - PAD * 2));
  const scale = Math.min(fit / cropW, fit / cropH);
  const outW = Math.max(1, Math.round(cropW * scale));
  const outH = Math.max(1, Math.round(cropH * scale));
  const offX = Math.round((SIZE - outW) / 2);
  const offY = Math.round((SIZE - outH) / 2);
  const out = new Uint8Array(SIZE * SIZE * 4);

  for (let oy = 0; oy < outH; oy++) {
    const sy = minY + Math.min(cropH - 1, Math.floor(oy / scale));
    for (let ox = 0; ox < outW; ox++) {
      const sx = minX + Math.min(cropW - 1, Math.floor(ox / scale));
      const p = sy * SIZE + sx;
      const a = alpha[p];
      if (a < 48) continue;
      const si = p * 4;
      const dx = offX + ox;
      const dy = offY + oy;
      const di = (dy * SIZE + dx) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = a;
    }
  }

  const png = new PNG({ width: SIZE, height: SIZE });
  png.data = Buffer.from(out);
  writeFileSync(OUTPUT, PNG.sync.write(png));
  console.log(`Wrote ${OUTPUT} (symbol crop ${cropW}x${cropH})`);
}

buildLogo();
