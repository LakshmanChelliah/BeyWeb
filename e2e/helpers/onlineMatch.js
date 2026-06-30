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

export async function waitForRoomLink(page) {
  await page.waitForSelector('#online-link');
  await page.waitForFunction(() => {
    const link = document.getElementById('online-link')?.value ?? '';
    return /room=[A-Z0-9]+/.test(link);
  }, null, { timeout: 15000 });
  return page.inputValue('#online-link');
}

export async function createOnlineRoom(page) {
  await page.click('#online-create-btn');
  return waitForRoomLink(page);
}

export async function joinOnlineRoom(page, roomCode) {
  await page.fill('#online-join-code', roomCode);
  await page.click('#online-join-btn');
  await page.waitForFunction(() => {
    const panel = document.getElementById('online-room-panel');
    return panel && !panel.hidden;
  }, null, { timeout: 15000 });
}

export async function setupOnlineMatch(host, guest) {
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
  for (let attempt = 0; attempt < 2 && !serverEnded; attempt += 1) {
    try {
      serverEnded = await host.evaluate(() => new Promise((resolve) => {
        const e2e = window.__BEYWEB_E2E__;
        const nc = e2e.netClient;
        const timer = setTimeout(() => resolve(false), 8000);
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
  }, null, { timeout: 30000 });
  await guest.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.awaitingRoundReady && s.gameoverVisible;
  }, null, { timeout: 30000 });
}

export async function forceSeriesEnd(host, guest) {
  const endedOnServer = await host.evaluate(() => new Promise((resolve) => {
    const e2e = window.__BEYWEB_E2E__;
    const nc = e2e.netClient;
    const timer = setTimeout(() => resolve(false), 12000);
    let rounds = 0;
    const cleanup = () => {
      clearTimeout(timer);
      offSeries?.();
      offRound?.();
    };
    const offSeries = nc.on('series_end', () => {
      cleanup();
      resolve(true);
    });
    const offRound = nc.on('round_end', (msg) => {
      if (msg.seriesOver) {
        cleanup();
        resolve(true);
      }
    });
    const endRound = () => {
      if (rounds >= 3) return;
      rounds += 1;
      e2e.sendDebugRoundEnd();
    };
    endRound();
    const interval = setInterval(() => {
      if (rounds >= 3) {
        clearInterval(interval);
        return;
      }
      endRound();
    }, 600);
  }));

  if (!endedOnServer) {
    const seriesEndMsg = {
      winner: 0,
      scores: [3, 0],
      forfeit: false,
    };
    for (const page of [host, guest]) {
      await page.evaluate((msg) => {
        const e2e = window.__BEYWEB_E2E__;
        if (!e2e.onlineCtrl.isActive()) {
          e2e.onlineCtrl.start(e2e.netClient.slot ?? 0);
        }
        e2e.gameRef.endOnlineRound?.();
        e2e.dispatchMessage('series_end', msg);
      }, seriesEndMsg);
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
