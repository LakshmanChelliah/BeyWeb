/**
 * Build a transparent Earth Eagle/Aquila facebolt logo from the provided JPG.
 * Input:  beystoadd/earth_eagle_logo_with_background.jpg
 * Output: earth_eagle_logo.png
 */
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'beystoadd/earth_eagle_logo_with_background.jpg');
const OUTPUT = resolve(ROOT, 'earth_eagle_logo.png');
const PADDING = 22;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function backgroundAlpha(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max - min;
  const whiteness = (r + g + b) / 3;

  // Remove the white/gray card background and its compression halo, while
  // keeping the logo's yellow outline and purple art solid.
  if (whiteness > 242 && saturation < 18) return 0;
  if (whiteness > 228 && saturation < 28) return clamp01((242 - whiteness) / 14);
  return 1;
}

const jpg = jpeg.decode(readFileSync(INPUT), { useTArray: true });
const src = jpg.data;

let minX = jpg.width;
let minY = jpg.height;
let maxX = -1;
let maxY = -1;
const alpha = new Uint8Array(jpg.width * jpg.height);

for (let y = 0; y < jpg.height; y++) {
  for (let x = 0; x < jpg.width; x++) {
    const i = (y * jpg.width + x) * 4;
    const a = backgroundAlpha(src[i], src[i + 1], src[i + 2]);
    alpha[y * jpg.width + x] = Math.round(a * 255);
    if (a > 0.08) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
}

minX = Math.max(0, minX - PADDING);
minY = Math.max(0, minY - PADDING);
maxX = Math.min(jpg.width - 1, maxX + PADDING);
maxY = Math.min(jpg.height - 1, maxY + PADDING);

const outW = maxX - minX + 1;
const outH = maxY - minY + 1;
const out = new PNG({ width: outW, height: outH });

for (let y = 0; y < outH; y++) {
  for (let x = 0; x < outW; x++) {
    const sx = x + minX;
    const sy = y + minY;
    const si = (sy * jpg.width + sx) * 4;
    const di = (y * outW + x) * 4;
    out.data[di] = src[si];
    out.data[di + 1] = src[si + 1];
    out.data[di + 2] = src[si + 2];
    out.data[di + 3] = alpha[sy * jpg.width + sx];
  }
}

writeFileSync(OUTPUT, PNG.sync.write(out));
console.log(`Wrote ${OUTPUT} (${outW}x${outH})`);
