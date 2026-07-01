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

/** Carousel index order matches PLAYABLE_BEYS (isBeyPlayable) in beys.js. */
const ONLINE_BEY_ORDER = [
  'pegasus',
  'ldrago',
  'lightning_ldrago',
  'leone',
  'libra',
  'eagle',
  'striker',
  'bull',
];

export async function pickOnlineBey(page, beyId) {
  const index = ONLINE_BEY_ORDER.indexOf(beyId);
  if (index < 0) throw new Error(`Unknown online bey id: ${beyId}`);
  await page.waitForSelector('.online-select');
  const right = page.locator('.online-carousel-scene .carousel-arrow.right');
  for (let i = 0; i < index; i += 1) {
    await right.click();
    await page.waitForTimeout(120);
  }
}

export async function inspectOnlineMatch(page) {
  return page.evaluate(() => {
    const e2e = window.__BEYWEB_E2E__;
    const gr = e2e.gameRef;
    const slot = e2e.netClient.slot ?? 0;
    const localYou = slot === 1 ? gr.state.aiBey : gr.state.playerBey;
    const localOpp = slot === 1 ? gr.state.playerBey : gr.state.aiBey;
    const youAvatar = document.getElementById('player-avatar');
    const oppAvatar = document.getElementById('ai-avatar');
    return {
      slot,
      youId: localYou?.id,
      oppId: localOpp?.id,
      slot0Id: gr.state.playerBey?.id,
      slot1Id: gr.state.aiBey?.id,
      matchBeyIds: gr.state.matchBeyIds,
      youAvatarSrc: youAvatar?.getAttribute('src') ?? '',
      oppAvatarSrc: oppAvatar?.getAttribute('src') ?? '',
      abilities: [
        ...document.querySelectorAll(
          '#player-abilities .ability-name, #p1-abilities .ability-name'
        ),
      ].map((el) => el.textContent),
      hasBodies: !!(gr.state.playerBody && gr.state.aiBody),
      hasTopVisuals: !!(gr.playerGroup?.children?.length && gr.aiGroup?.children?.length),
      topMeshCount: (gr.playerGroup?.children?.length ?? 0) + (gr.aiGroup?.children?.length ?? 0),
      gameRunning: gr.state.gameRunning,
      hudVisible: document.getElementById('hud')?.classList.contains('visible'),
      spinYou: Math.round((slot === 1 ? gr.state.aiSpin : gr.state.playerSpin) * 100),
      assetVersion: window.__BEYWEB_ASSET_V__,
    };
  });
}

export async function setupOnlineMatchWithBeys(host, guest, hostBey = 'lightning_ldrago', guestBey = 'pegasus') {
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

  await pickOnlineBey(host, hostBey);
  await pickOnlineBey(guest, guestBey);

  await host.click('#btn-lock');
  await guest.click('#btn-lock');

  await waitForOnlineMatch(host);
  await waitForOnlineMatch(guest);

  await host.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.hasArenaBodies && s.hasTopVisuals && s.gameRunning;
  }, null, { timeout: 45000 });
  await guest.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.hasArenaBodies && s.hasTopVisuals && s.gameRunning;
  }, null, { timeout: 45000 });

  await host.waitForTimeout(2500);
}

export async function setupOnlineMatch(host, guest) {
  return setupOnlineMatchWithBeys(host, guest, 'pegasus', 'ldrago');
}

export async function selectOnlineModeMobile(page) {
  await page.goto('/?e2e=1');
  await page.waitForSelector('#select-overlay');
  await page.getByRole('button', { name: 'Online' }).click();
  await page.waitForSelector('#online-flow:not(.hidden)');
}

export async function setupMobileOnlineMatchWithBeys(host, guest, hostBey = 'lightning_ldrago', guestBey = 'pegasus') {
  await selectOnlineModeMobile(host);
  await waitForE2E(host);

  const joinUrl = await createOnlineRoom(host);
  const roomCode = new URL(joinUrl).searchParams.get('room');

  await selectOnlineModeMobile(guest);
  await waitForE2E(guest);
  await joinOnlineRoom(guest, roomCode);

  await host.waitForSelector('#online-continue:not([disabled])');
  await guest.waitForSelector('#online-continue:not([disabled])');
  await host.click('#online-continue');
  await guest.click('#online-continue');

  await host.waitForSelector('#btn-lock');
  await guest.waitForSelector('#btn-lock');

  await pickOnlineBey(host, hostBey);
  await pickOnlineBey(guest, guestBey);

  await host.click('#btn-lock');
  await guest.click('#btn-lock');

  await waitForOnlineMatch(host);
  await waitForOnlineMatch(guest);

  await host.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.hasArenaBodies && s.hasTopVisuals && s.gameRunning;
  }, null, { timeout: 45000 });
  await guest.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return s.hasArenaBodies && s.hasTopVisuals && s.gameRunning;
  }, null, { timeout: 45000 });

  await host.waitForTimeout(2500);
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
