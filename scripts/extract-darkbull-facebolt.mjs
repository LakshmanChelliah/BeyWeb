/**
 * Crop the Dark Bull facebolt (bull head + BULL text) from darkbull_referencelook.jpg.
 * Output: darkbull_facebolt.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REF = resolve(ROOT, 'darkbull_referencelook.jpg');
const OUT = resolve(ROOT, 'darkbull_facebolt.png');

// Facebolt hex occupies roughly the inner 22% of the product photo radius.
const CROP_FRAC = 0.44;

const raw = readFileSync(REF);
const { width, height, data } = jpeg.decode(raw, { useTArray: true });
const cx = width / 2;
const cy = height / 2;
const crop = Math.round(Math.min(width, height) * CROP_FRAC);
const left = Math.round(cx - crop / 2);
const top = Math.round(cy - crop / 2);

const out = new Uint8Array(crop * crop * 4);
for (let y = 0; y < crop; y++) {
  for (let x = 0; x < crop; x++) {
    const sx = left + x;
    const sy = top + y;
    const si = (sy * width + sx) * 4;
    const di = (y * crop + x) * 4;
    out[di] = data[si];
    out[di + 1] = data[si + 1];
    out[di + 2] = data[si + 2];
    out[di + 3] = 255;
  }
}

const png = new PNG({ width: crop, height: crop });
png.data = Buffer.from(out);
writeFileSync(OUT, PNG.sync.write(png));
console.log(`Wrote ${OUT} (${crop}x${crop})`);
