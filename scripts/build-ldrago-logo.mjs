/**
 * Build Lightning L-Drago UI logo from Lightning_lDrago_Logo_wBlackBackground.jpg.
 * Drops the solid black background, preserves the white dragon art and magenta outline.
 * Used for carousel emblem + special-move flash overlay.
 * Output: ldrago_logo.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'beystoadd/Lightning_lDrago_Logo_wBlackBackground.jpg');
const OUT = resolve(ROOT, 'ldrago_logo.png');
const SIZE = 512;
const PAD = 0.06;

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

/**
 * Alpha from luminance — near-black is transparent, near-white/magenta art is opaque.
 * Soft ramp around the threshold so JPEG compression artifacts don't leave a black halo.
 */
function alphaFromSource(data, w, h) {
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = r + g + b;
    if (lum < 60) {
      alpha[p] = 0;
    } else if (lum < 160) {
      alpha[p] = Math.round(((lum - 60) / 100) * 255);
    } else {
      alpha[p] = 255;
    }
  }
  return alpha;
}

function isWhiteFramePixel(data, p) {
  const i = p * 4;
  return data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220;
}

function whiteCounts(data, w, h) {
  const rows = new Uint16Array(h);
  const cols = new Uint16Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!isWhiteFramePixel(data, p)) continue;
      rows[y]++;
      cols[x]++;
    }
  }
  return { rows, cols };
}

function findBandEnd(counts, threshold, fromStart = true) {
  const len = counts.length;
  let i = fromStart ? 0 : len - 1;
  const step = fromStart ? 1 : -1;
  while (i >= 0 && i < len && counts[i] < threshold) i += step;
  if (i < 0 || i >= len) return null;
  while (i >= 0 && i < len && counts[i] >= threshold) i += step;
  return i;
}

function detectInnerFrameBounds(data, w, h) {
  const { rows, cols } = whiteCounts(data, w, h);
  const rowThreshold = Math.floor(w * 0.55);
  const colThreshold = Math.floor(h * 0.55);
  const top = findBandEnd(rows, rowThreshold, true);
  const bottom = findBandEnd(rows, rowThreshold, false);
  const left = findBandEnd(cols, colThreshold, true);
  const right = findBandEnd(cols, colThreshold, false);

  if (top == null || bottom == null || left == null || right == null) {
    return { left: 0, top: 0, right: w - 1, bottom: h - 1 };
  }

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    right: Math.min(w - 1, right),
    bottom: Math.min(h - 1, bottom),
  };
}

function buildLogo() {
  const raw = readFileSync(INPUT);
  const src = jpeg.decode(raw, { useTArray: true });
  const trimmed = resizeNearest(src.data, src.width, src.height, SIZE, SIZE);
  const { data } = trimmed;
  const alpha = alphaFromSource(data, SIZE, SIZE);
  const inner = detectInnerFrameBounds(data, SIZE, SIZE);

  let minX = SIZE;
  let minY = SIZE;
  let maxX = 0;
  let maxY = 0;
  for (let y = inner.top; y <= inner.bottom; y++) {
    for (let x = inner.left; x <= inner.right; x++) {
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
      if (sx < inner.left || sx > inner.right || sy < inner.top || sy > inner.bottom) continue;
      const si = sp * 4;
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
  writeFileSync(OUT, PNG.sync.write(png));
  console.log(`Wrote ${OUT}`);
}

buildLogo();
