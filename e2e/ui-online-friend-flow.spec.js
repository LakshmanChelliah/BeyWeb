import { test, expect } from '@playwright/test';
import {
  hostGuestPair,
  setupOnlineMatch,
  getE2EState,
  forceRoundEnd,
  clickNextRound,
} from './helpers/onlineMatch.js';
import {
  mobileHostGuestPair,
  setupMobileOnlineMatch,
  mockMotionSensors,
  simulateTilt,
  enableGyroE2E,
  syncOnlineNextRound,
} from './helpers/mobile.js';
import { waitForOnlineMatch } from './helpers/ui.js';

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
  return Math.hypot(pixel.r - bg.r, pixel.g - bg.g, pixel.b - bg.b) > 18;
}

async function expectLiveMatch(page, label) {
  const state = await getE2EState(page);
  expect(state.onlineActive, `${label}: online series active`).toBe(true);
  expect(state.hudVisible, `${label}: HUD visible`).toBe(true);
  expect(state.hasArenaBodies, `${label}: arena bodies`).toBe(true);
  expect(state.hasTopVisuals, `${label}: top visuals`).toBe(true);
  expect(state.wsOpen, `${label}: websocket open`).toBe(true);
  expect(state.gameRunning, `${label}: game running`).toBe(true);
  expect(state.gameFrozen, `${label}: not frozen`).toBe(false);
  expect(state.snapshotCount, `${label}: snapshots flowing`).toBeGreaterThan(5);

  await expect
    .poll(async () => looksLikeArena(await sampleCanvasCenter(page)), {
      timeout: 15000,
      message: `${label}: stadium in frame`,
    })
    .toBe(true);
}

test.describe('Two friends playing online (PC)', () => {
  test('host invites guest, both lock in, and play a live match', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
    try {
      await setupOnlineMatch(host, guest);
      await waitForOnlineMatch(host);
      await waitForOnlineMatch(guest);

      const hostState = await getE2EState(host);
      const guestState = await getE2EState(guest);
      expect(hostState.roomId).toBeTruthy();
      expect(guestState.roomId).toBe(hostState.roomId);
      expect(hostState.slot).toBe(0);
      expect(guestState.slot).toBe(1);

      await expectLiveMatch(host, 'host');
      await expectLiveMatch(guest, 'guest');

      const hostTick0 = hostState.lastServerTick;
      await host.keyboard.down('KeyW');
      await host.keyboard.down('KeyD');
      await host.waitForTimeout(800);
      await host.keyboard.up('KeyW');
      await host.keyboard.up('KeyD');

      await host.waitForFunction((prev) => {
        return window.__BEYWEB_E2E__.getState().lastServerTick > prev;
      }, hostTick0, { timeout: 15000 });

      await guest.waitForFunction((prev) => {
        return window.__BEYWEB_E2E__.getState().lastServerTick > prev;
      }, guestState.lastServerTick, { timeout: 15000 });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('friends finish a round and start the next together', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
    try {
      await setupOnlineMatch(host, guest);
      await waitForOnlineMatch(host);

      await forceRoundEnd(host, guest);
      await clickNextRound(host);
      await clickNextRound(guest);

      await host.waitForFunction(() => {
        const s = window.__BEYWEB_E2E__.getState();
        return s.awaitingRoundReady && s.gameoverVisible;
      });
      await guest.waitForFunction(() => {
        const s = window.__BEYWEB_E2E__.getState();
        return s.awaitingRoundReady && s.gameoverVisible;
      });

      await host.evaluate(() => {
        const e2e = window.__BEYWEB_E2E__;
        e2e.dispatchMessage('ready_status', {
          readyCount: 2,
          total: 2,
          slots: [true, true],
          bothReady: true,
        });
        for (const sec of [3, 2, 1, 0]) {
          e2e.dispatchMessage('countdown', { seconds: sec });
        }
      });
      await guest.evaluate(() => {
        const e2e = window.__BEYWEB_E2E__;
        e2e.dispatchMessage('ready_status', {
          readyCount: 2,
          total: 2,
          slots: [true, true],
          bothReady: true,
        });
        for (const sec of [3, 2, 1, 0]) {
          e2e.dispatchMessage('countdown', { seconds: sec });
        }
      });

      await host.waitForFunction(() => {
        const s = window.__BEYWEB_E2E__.getState();
        return s.hudVisible && s.hasArenaBodies && !s.gameoverVisible;
      }, null, { timeout: 30000 });
      await guest.waitForFunction(() => {
        const s = window.__BEYWEB_E2E__.getState();
        return s.hudVisible && s.hasArenaBodies && !s.gameoverVisible;
      }, null, { timeout: 30000 });

      await expectLiveMatch(host, 'host round 2');
      await expectLiveMatch(guest, 'guest round 2');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});

test.describe('Two friends playing online (mobile)', () => {
  test('host shares code, guest joins, both play with gyro', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);

      const hostState = await getE2EState(host);
      const guestState = await getE2EState(guest);
      expect(hostState.roomId).toBe(guestState.roomId);

      await expectLiveMatch(host, 'mobile host');
      await expectLiveMatch(guest, 'mobile guest');

      await simulateTilt(host, 14, 10);
      await simulateTilt(guest, 12, 16);

      const hostGyro = await host.evaluate(() => window.__BEYWEB_E2E__.getGyroState());
      const guestGyro = await guest.evaluate(() => window.__BEYWEB_E2E__.getGyroState());
      expect(hostGyro.steerMag).toBeGreaterThan(0.05);
      expect(guestGyro.steerMag).toBeGreaterThan(0.05);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('mobile friends advance to round two after a KO', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);
      await forceRoundEnd(host, guest);

      await clickNextRound(host);
      await clickNextRound(guest);
      await syncOnlineNextRound(host, guest);

      await enableGyroE2E(host);
      await enableGyroE2E(guest);

      await expectLiveMatch(host, 'mobile host round 2');
      await expectLiveMatch(guest, 'mobile guest round 2');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
