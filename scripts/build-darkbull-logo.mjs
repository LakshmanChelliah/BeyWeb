/**
 * Build Dark Bull UI logo from bulllogounedited.jpg.
 * Transparent PNG — flat blue bull art, no white outline.
 * Used for carousel emblem + special-move flash overlay.
 * Output: darkbull_logo.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'bulllogounedited.jpg');
const OUT = resolve(ROOT, 'darkbull_logo.png');
const SIZE = 512;
const PAD = 0.1;

const BLUE = [38, 88, 196];

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

function isArtPixel(data, p) {
  const i = p * 4;
  const lum = data[i] + data[i + 1] + data[i + 2];
  if (lum > 700) return false;
  if (lum > 600 && data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) return false;
  return true;
}

function alphaFromSource(data, w, h) {
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!isArtPixel(data, p)) continue;
    const i = p * 4;
    const lum = data[i] + data[i + 1] + data[i + 2];
    if (lum > 680) {
      alpha[p] = 0;
    } else if (lum > 560) {
      alpha[p] = Math.round((680 - lum) / 120 * 255);
    } else {
      alpha[p] = 255;
    }
  }
  return alpha;
}

function buildLogo() {
  const raw = readFileSync(INPUT);
  const src = jpeg.decode(raw, { useTArray: true });
  const trimmed = resizeNearest(src.data, src.width, src.height, SIZE, SIZE);
  const { data } = trimmed;
  const alpha = alphaFromSource(data, SIZE, SIZE);

  let minX = SIZE;
  let minY = SIZE;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const p = y * SIZE + x;
      if (alpha[p] < 48) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
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
      const sp = sy * SIZE + sx;
      const a = alpha[sp];
      if (a < 48) continue;
      const dx = offX + ox;
      const dy = offY + oy;
      const di = (dy * SIZE + dx) * 4;
      out[di] = BLUE[0];
      out[di + 1] = BLUE[1];
      out[di + 2] = BLUE[2];
      out[di + 3] = a;
    }
  }

  const png = new PNG({ width: SIZE, height: SIZE });
  png.data = Buffer.from(out);
  writeFileSync(OUT, PNG.sync.write(png));
  console.log(`Wrote ${OUT}`);
}

buildLogo();
