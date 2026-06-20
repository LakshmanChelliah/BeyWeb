/**
 * Shared Playwright helpers for online multiplayer Playwright specs.
 */

import { waitForOnlineMatch } from './ui.js';

export async function selectOnlineMode(page) {
  await page.goto('/pc/?e2e=1');
  await page.waitForSelector('#select-overlay');
  await page.getByRole('button', { name: 'Online' }).click();
  await page.waitForSelector('#online-flow:not(.hidden)');
}

export async function waitForE2E(page) {
  await page.waitForFunction(() => window.__BEYWEB_E2E__ != null);
}

export { waitForOnlineMatch } from './ui.js';

export async function getE2EState(page) {
  return page.evaluate(() => window.__BEYWEB_E2E__.getState());
}

export async function hostGuestPair(browser) {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  return { host, guest, hostContext, guestContext };
}

export async function setupOnlineMatch(host, guest) {
  await selectOnlineMode(host);
  await waitForE2E(host);

  await host.waitForSelector('#online-link');
  const joinUrl = await host.inputValue('#online-link');
  const guestUrl = joinUrl.includes('?')
    ? `${joinUrl}&e2e=1`
    : `${joinUrl}?e2e=1`;

  await guest.goto(guestUrl);
  await guest.waitForSelector('#online-flow:not(.hidden)');
  await waitForE2E(guest);

  await host.waitForSelector('#online-continue:not([disabled])');
  await guest.waitForSelector('#online-continue:not([disabled])');
  await host.click('#online-continue');
  await guest.click('#online-continue');

  await host.waitForSelector('#btn-lock');
  await guest.waitForSelector('#btn-lock');
  await host.click('#btn-lock');
  await guest.click('#btn-lock');

  await waitForOnlineMatch(host);
  await waitForOnlineMatch(guest);
  await host.waitForTimeout(2000);
}

export async function forceRoundEnd(host, guest) {
  const roundEndMsg = {
    outcome: 'KO',
    winner: 1,
    scores: [1, 0],
    round: 1,
    isDraw: false,
    seriesOver: false,
  };

  let serverEnded = false;
  try {
    serverEnded = await host.evaluate(() => new Promise((resolve) => {
      const e2e = window.__BEYWEB_E2E__;
      const nc = e2e.netClient;
      const timer = setTimeout(() => resolve(false), 3000);
      const off = nc.on('round_end', () => {
        clearTimeout(timer);
        off();
        resolve(true);
      });
      e2e.sendDebugRoundEnd();
    }));
  } catch {
    serverEnded = false;
  }

  if (!serverEnded) {
    for (const page of [host, guest]) {
      await page.evaluate((msg) => {
        const e2e = window.__BEYWEB_E2E__;
        if (!e2e.onlineCtrl.isActive()) {
          e2e.onlineCtrl.start(e2e.netClient.slot ?? 0);
        }
        e2e.gameRef.endOnlineRound?.();
        e2e.dispatchMessage('round_end', msg);
      }, roundEndMsg);
    }
  }

  await host.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.awaitingRoundReady && s.gameoverVisible;
  }, null, { timeout: 20000 });
  await guest.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.awaitingRoundReady && s.gameoverVisible;
  }, null, { timeout: 20000 });
}

export async function clickNextRound(page) {
  await page.evaluate(() => window.__BEYWEB_E2E__.clickNextRound());
}

export async function clickRematch(page) {
  await clickNextRound(page);
}

export async function syncRematchReady(host, guest) {
  const sync = async (page) => {
    await page.evaluate(() => {
      const e2e = window.__BEYWEB_E2E__;
      if (!e2e.getState().awaitingRoundReady) return;
      e2e.dispatchMessage('ready_status', {
        readyCount: 2,
        total: 2,
        slots: [true, true],
        bothReady: true,
      });
    });
  };
  if ((await getE2EState(host)).awaitingRoundReady) {
    await sync(host);
    await sync(guest);
  }
}
