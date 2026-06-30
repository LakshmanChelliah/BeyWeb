import { test, expect } from '@playwright/test';
import {
  hostGuestPair,
  selectOnlineMode,
  waitForE2E,
  createOnlineRoom,
  joinOnlineRoom,
  focusOnlineBeyByName,
  waitForOnlineMatch,
} from './helpers/onlineMatch.js';

async function enterOnlineSelection(host, guest) {
  await selectOnlineMode(host);
  await waitForE2E(host);
  const joinUrl = await createOnlineRoom(host);
  const roomCode = new URL(joinUrl).searchParams.get('room');

  await selectOnlineMode(guest);
  await waitForE2E(guest);
  await joinOnlineRoom(guest, roomCode);

  await host.waitForSelector('#online-continue:not([disabled])');
  await guest.waitForSelector('#online-continue:not([disabled])');
  await host.click('#online-continue');
  await guest.click('#online-continue');

  await host.waitForSelector('#btn-lock');
  await guest.waitForSelector('#btn-lock');
}

test.describe('Classic beys in online play', () => {
  test('online carousel includes classic roster beys', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
    try {
      await enterOnlineSelection(host, guest);

      const names = new Set();
      const dots = host.locator('.online-carousel-mount .carousel-dot');
      const count = await dots.count();
      expect(count).toBeGreaterThanOrEqual(8);
      for (let i = 0; i < count; i++) {
        names.add((await host.locator('.online-carousel-mount .bey-card.active .bey-name').textContent())?.trim());
        await host.locator('.online-carousel-mount .carousel-arrow.right').click();
      }
      expect(names.has('RAY STRIKER')).toBe(true);
      expect(names.has('EARTH EAGLE')).toBe(true);
      expect(names.has('LIGHTNING L-DRAGO')).toBe(true);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('host and guest can lock classic beys and start an online match', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
    try {
      await enterOnlineSelection(host, guest);

      await focusOnlineBeyByName(host, 'RAY STRIKER');
      await focusOnlineBeyByName(guest, 'EARTH EAGLE');

      await host.click('#btn-lock');
      await guest.click('#btn-lock');

      await waitForOnlineMatch(host);
      await waitForOnlineMatch(guest);

      const hostState = await host.evaluate(() => window.__BEYWEB_E2E__.getState());
      expect(hostState.hudVisible || hostState.gameRunning).toBe(true);
      expect(hostState.wsOpen).toBe(true);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('Ray Striker power ability works in online match', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
    try {
      await enterOnlineSelection(host, guest);

      await focusOnlineBeyByName(host, 'RAY STRIKER');
      await focusOnlineBeyByName(guest, 'STORM PEGASUS');

      await host.click('#btn-lock');
      await guest.click('#btn-lock');

      await waitForOnlineMatch(host);
      await waitForOnlineMatch(guest);

      await host.waitForSelector('#p1-abilities .ability-btn', { timeout: 15000 });
      const names = await host.locator('#p1-abilities .ability-name').allTextContents();
      expect(names.some((n) => /Blitz Charge/i.test(n))).toBe(true);

      await host.keyboard.press('KeyQ');
      const state = await host.evaluate(() => window.__BEYWEB_E2E__.getState());
      expect(state.gameRunning).toBe(true);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
