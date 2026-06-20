import { test, expect } from '@playwright/test';
import {
  hostGuestPair,
  setupOnlineMatch,
  forceRoundEnd,
  clickNextRound,
  getE2EState,
  waitForE2E,
} from './helpers/onlineMatch.js';

test.describe.serial('Online next-round transition (shared match)', () => {
  /** @type {import('@playwright/test').Page} */
  let host;
  /** @type {import('@playwright/test').Page} */
  let guest;
  /** @type {import('@playwright/test').BrowserContext} */
  let hostContext;
  /** @type {import('@playwright/test').BrowserContext} */
  let guestContext;

  test.beforeAll(async ({ browser }) => {
    const pair = await hostGuestPair(browser);
    host = pair.host;
    guest = pair.guest;
    hostContext = pair.hostContext;
    guestContext = pair.guestContext;
    await setupOnlineMatch(host, guest);
    await forceRoundEnd(host, guest);
  });

  test.afterAll(async () => {
    await hostContext?.close();
    await guestContext?.close();
  });

  test('no countdown before both players click Next Round', async () => {
    const hostState = await getE2EState(host);
    const guestState = await getE2EState(guest);
    expect(hostState.countdownVisible).toBe(false);
    expect(guestState.countdownVisible).toBe(false);
    expect(hostState.restartLabel).toContain('0/2');

    await clickNextRound(host);
    await host.waitForFunction(() => {
      const s = window.__BEYWEB_E2E__.getState();
      return s.restartDisabled === true;
    }, null, { timeout: 5000 });
    const afterOne = await getE2EState(host);
    expect(afterOne.countdownVisible).toBe(false);
    expect(afterOne.restartDisabled).toBe(true);
  });

  test('both ready starts the next round', async () => {
    await clickNextRound(guest);

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
      return !s.awaitingRoundReady && !s.gameoverVisible;
    }, null, { timeout: 20000 });

    await guest.waitForFunction(() => {
      const s = window.__BEYWEB_E2E__.getState();
      return !s.awaitingRoundReady && !s.gameoverVisible;
    }, null, { timeout: 20000 });

    const hostState = await getE2EState(host);
    const guestState = await getE2EState(guest);
    expect(hostState.gameoverVisible).toBe(false);
    expect(guestState.gameoverVisible).toBe(false);
  });
});

test('recovers when countdown arrives before bothReady', async ({ browser }) => {
  const { host, hostContext } = await hostGuestPair(browser);
  try {
    await host.goto('/pc/?e2e=1');
    await waitForE2E(host);

    await host.evaluate(() => {
      const e2e = window.__BEYWEB_E2E__;
      e2e.onlineCtrl.start(0);
      e2e.gameRef.endOnlineRound?.();
      e2e.dispatchMessage('round_end', {
        outcome: 'KO',
        winner: 1,
        scores: [1, 0],
        round: 1,
        isDraw: false,
        seriesOver: false,
      });
    });

    let state = await getE2EState(host);
    expect(state.awaitingRoundReady).toBe(true);

    await host.evaluate(() => {
      const e2e = window.__BEYWEB_E2E__;
      e2e.dispatchMessage('countdown', { seconds: 3 });
    });

    state = await getE2EState(host);
    expect(state.countdownVisible).toBe(false);
    expect(state.gameoverVisible).toBe(true);

    await host.evaluate(() => {
      const e2e = window.__BEYWEB_E2E__;
      e2e.dispatchMessage('ready_status', {
        readyCount: 2,
        total: 2,
        slots: [true, true],
        bothReady: true,
      });
      e2e.dispatchMessage('countdown', { seconds: 2 });
      e2e.dispatchMessage('countdown', { seconds: 1 });
      e2e.dispatchMessage('countdown', { seconds: 0 });
    });

    await host.waitForFunction(() => {
      const s = window.__BEYWEB_E2E__.getState();
      return !s.awaitingRoundReady && !s.gameoverVisible;
    });

    state = await getE2EState(host);
    expect(state.awaitingRoundReady).toBe(false);
    expect(state.gameoverVisible).toBe(false);
  } finally {
    await hostContext.close();
  }
});

test('Space does not register next-round ready', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await forceRoundEnd(host, guest);

    await host.keyboard.press('Space');
    await guest.keyboard.press('Enter');

    const hostState = await getE2EState(host);
    const guestState = await getE2EState(guest);
    expect(hostState.restartDisabled).toBe(false);
    expect(guestState.restartDisabled).toBe(false);
    expect(hostState.restartLabel).toContain('0/2');
    expect(guestState.restartLabel).toContain('0/2');
    expect(hostState.countdownVisible).toBe(false);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
