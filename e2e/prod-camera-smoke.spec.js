import { test, expect } from '@playwright/test';
import {
  calibrateAtTilt,
  forceMobileOfflineEnd,
  mobileHostGuestPair,
  mockMotionSensors,
  setupMobileOnlineMatch,
  startMobileOfflineMatch,
} from './helpers/mobile.js';
import { clickMode, gotoMobileE2E } from './helpers/ui.js';

const PROD = process.env.BEYWEB_PROD_URL || 'https://beyweb-production.up.railway.app';

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

/** Arena dish grey vs empty scene background (#141b30). */
function looksLikeArena(pixel) {
  if (!pixel) return false;
  const bg = { r: 20, g: 27, b: 48 };
  const dist = Math.hypot(pixel.r - bg.r, pixel.g - bg.g, pixel.b - bg.b);
  return dist > 18;
}

async function waitForArenaVisible(page, label) {
  await expect
    .poll(
      async () => {
        const px = await sampleCanvasCenter(page);
        return looksLikeArena(px);
      },
      { timeout: 20000, message: `arena visible: ${label}` }
    )
    .toBe(true);
}

async function waitForHud(page) {
  await page.waitForFunction(() => document.getElementById('hud')?.classList.contains('visible'));
}

test.describe('Production camera smoke', () => {
  test.use({ baseURL: PROD });

  test('mobile casual rematch keeps stadium in frame', async ({ page }) => {
    await mockMotionSensors(page);
    await gotoMobileE2E(page);
    await clickMode(page, 'Casual');
    await startMobileOfflineMatch(page);
    await page.waitForTimeout(2000);
    await waitForArenaVisible(page, 'casual match 1');

    await forceMobileOfflineEnd(page);
    await page.locator('#btn-restart').click();
    await waitForHud(page);
    await page.waitForTimeout(2000);
    await waitForArenaVisible(page, 'casual match 2');
  });

  test('mobile online round start keeps stadium in frame for both players', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);
      await host.waitForTimeout(3000);
      for (const [page, label] of [[host, 'host'], [guest, 'guest']]) {
        const state = await page.evaluate(() => window.__BEYWEB_E2E__.getState());
        expect(state.hasArenaBodies, `${label} bodies`).toBe(true);
        expect(state.hasTopVisuals, `${label} visuals`).toBe(true);
        await waitForArenaVisible(page, `online round 1 ${label}`);
      }
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('mobile online countdown respawn keeps stadium in frame', async ({ page }) => {
    await mockMotionSensors(page);
    await gotoMobileE2E(page);
    await clickMode(page, 'Online');
    await page.evaluate(async () => {
      const gameRef = window.__BEYWEB_E2E__.gameRef;
      gameRef.state.playerBey = gameRef.state.playerBey ?? { id: 'pegasus' };
      gameRef.state.aiBey = gameRef.state.aiBey ?? { id: 'bull' };
      gameRef.spawnTops();
      gameRef.endOfflineMatch({ outcome: 'KO', winner: 1 });
      gameRef.clearArenaTops();
      gameRef.spawnTops();
      gameRef.startOnlineRound();
    });
    await page.waitForTimeout(2000);
    await waitForArenaVisible(page, 'online respawn simulation');
  });
});
