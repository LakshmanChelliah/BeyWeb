import { test, expect } from '@playwright/test';
import {
  mobileHostGuestPair,
  setupMobileOnlineMatch,
} from './helpers/mobile.js';

async function sampleCanvasCenter(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return null;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const x = Math.floor(canvas.width / 2);
    const y = Math.floor(canvas.height / 2);
    const out = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return { r: out[0], g: out[1], b: out[2], a: out[3] };
  });
}

function looksLikeArena(pixel) {
  if (!pixel) return false;
  const bg = { r: 20, g: 27, b: 48 };
  const dist = Math.hypot(pixel.r - bg.r, pixel.g - bg.g, pixel.b - bg.b);
  return dist > 18;
}

async function waitForArenaVisible(page, label) {
  await expect
    .poll(async () => looksLikeArena(await sampleCanvasCenter(page)), {
      timeout: 20000,
      message: `arena visible: ${label}`,
    })
    .toBe(true);
}

test.describe('Online mobile camera', () => {
  test('live match keeps stadium centered at round start', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);
      await host.waitForTimeout(2500);
      await waitForArenaVisible(host, 'online round start host');
      await waitForArenaVisible(guest, 'online round start guest');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
