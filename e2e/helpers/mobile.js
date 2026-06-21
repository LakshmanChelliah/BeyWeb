/**
 * Mobile Playwright helpers — gyro mocks, offline/online flows.
 */

import { devices, expect } from '@playwright/test';
import {
  waitForE2E,
  waitForOnlineMatch,
  selectFocusedBey,
  getE2EState,
} from './ui.js';
import {
  forceRoundEnd,
  clickNextRound,
  clickRematch,
  syncRematchReady,
  createOnlineRoom,
  joinOnlineRoom,
} from './onlineMatch.js';

export { gotoMobileE2E, getE2EState, waitForOnlineMatch } from './ui.js';

export async function mockMotionSensors(page) {
  await page.addInitScript(() => {
    if (typeof DeviceOrientationEvent !== 'undefined') {
      DeviceOrientationEvent.requestPermission = async () => 'granted';
    }
    if (typeof DeviceMotionEvent !== 'undefined') {
      DeviceMotionEvent.requestPermission = async () => 'granted';
    }
  });
}

export async function enableGyroE2E(page) {
  await page.locator('body').click({ position: { x: 12, y: 12 }, force: true });
  await page.evaluate(async () => {
    await window.__BEYWEB_E2E__.enableGyro({ calibrate: false });
    window.__BEYWEB_E2E__.simulateOrientation(0, 0);
    window.__BEYWEB_E2E__.calibrateGyro();
    window.__BEYWEB_E2E__.refreshGyroSteer();
  });
}

export async function simulateTilt(page, beta, gamma) {
  await page.evaluate(({ b, g }) => {
    window.__BEYWEB_E2E__.simulateOrientation(b, g);
    window.__BEYWEB_E2E__.refreshGyroSteer();
  }, { b: beta, g: gamma });
}

export async function calibrateAtTilt(page, beta, gamma) {
  await simulateTilt(page, beta, gamma);
  await page.evaluate(() => {
    window.__BEYWEB_E2E__.calibrateGyro();
    window.__BEYWEB_E2E__.refreshGyroSteer();
  });
}

export async function readGyroSteer(page) {
  return page.evaluate(() => window.__BEYWEB_E2E__.getGyroState());
}

export async function expectGyroSteerAbove(page, minMag = 0.08) {
  const gyro = await readGyroSteer(page);
  expect(gyro.steerMag).toBeGreaterThan(minMag);
  return gyro;
}

export async function expectGyroSteerNearZero(page, maxMag = 0.05) {
  const gyro = await readGyroSteer(page);
  expect(gyro.steerMag).toBeLessThan(maxMag);
  return gyro;
}

export async function startMobileOfflineMatch(page) {
  await selectFocusedBey(page);
  await page.waitForSelector('#start-overlay:not(.hidden)');
  await page.locator('#btn-start').click();
  await page.waitForFunction(() => window.__BEYWEB_E2E__.getState().hudVisible);
}

export async function forceMobileOfflineEnd(page, result = { outcome: 'KO', winner: 1 }) {
  await page.evaluate((r) => {
    const e2e = window.__BEYWEB_E2E__;
    if (!e2e.gameRef.state.gameRunning) {
      e2e.gameRef.state.gameRunning = true;
    }
    e2e.gameRef.endOfflineMatch(r);
  }, result);
  await page.waitForSelector('#gameover-overlay.visible');
}

export async function mobileHostGuestPair(browser) {
  const device = devices['Pixel 5'];
  const hostContext = await browser.newContext({ ...device });
  const guestContext = await browser.newContext({ ...device });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  return { host, guest, hostContext, guestContext };
}

export async function setupMobileOnlineMatch(host, guest) {
  await mockMotionSensors(host);
  await mockMotionSensors(guest);

  await host.goto('/?e2e=1');
  await waitForE2E(host);
  await host.getByRole('button', { name: 'Online' }).click();
  await host.waitForSelector('#online-flow:not(.hidden)');

  const joinUrl = await createOnlineRoom(host);
  const roomCode = new URL(joinUrl).searchParams.get('room');

  await guest.goto('/?e2e=1');
  await waitForE2E(guest);
  await guest.getByRole('button', { name: 'Online' }).click();
  await guest.waitForSelector('#online-flow:not(.hidden)');
  await joinOnlineRoom(guest, roomCode);

  await host.waitForSelector('#online-continue:not([disabled])');
  await guest.waitForSelector('#online-continue:not([disabled])');
  await host.click('#online-continue');
  await guest.click('#online-continue');

  await host.waitForSelector('#btn-lock');
  await guest.waitForSelector('#btn-lock');

  await enableGyroE2E(host);
  await enableGyroE2E(guest);

  await host.click('#btn-lock');
  await guest.click('#btn-lock');

  await waitForOnlineMatch(host);
  await waitForOnlineMatch(guest);
}

export async function syncOnlineNextRound(host, guest) {
  const syncBothReady = async (page) => {
    await page.evaluate(() => {
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
  };

  if ((await getE2EState(host)).awaitingRoundReady) {
    await syncBothReady(host);
    await syncBothReady(guest);
  }

  await host.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.hudVisible && s.hasArenaBodies && !s.gameoverVisible;
  }, null, { timeout: 30000 });
  await guest.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.hudVisible && s.hasArenaBodies && !s.gameoverVisible;
  }, null, { timeout: 30000 });
}

export async function forceMobileSeriesEnd(host, guest) {
  const { forceSeriesEnd } = await import('./onlineMatch.js');
  await forceSeriesEnd(host, guest);
}

export {
  forceRoundEnd,
  clickNextRound,
  clickRematch,
  syncRematchReady,
};
