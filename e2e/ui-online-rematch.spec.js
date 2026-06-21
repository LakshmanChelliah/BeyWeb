import { test, expect } from '@playwright/test';
import {
  hostGuestPair,
  setupOnlineMatch,
  waitForE2E,
  waitForRoomLink,
  createOnlineRoom,
  joinOnlineRoom,
  forceRoundEnd,
  forceSeriesEnd,
  clickNextRound,
  clickRematch,
  syncRematchReady,
  getE2EState,
} from './helpers/onlineMatch.js';
import { waitForOnlineMatch } from './helpers/ui.js';

test('online next round respawns arena with HUD and controls', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await waitForOnlineMatch(host);

    const before = await host.evaluate(() => ({
      bodies: window.__BEYWEB_E2E__.getState().hasArenaBodies,
      hud: window.__BEYWEB_E2E__.getState().hudVisible,
    }));
    expect(before.bodies).toBe(true);
    expect(before.hud).toBe(true);

    await forceRoundEnd(host, guest);
    await clickNextRound(host);
    await clickNextRound(guest);

    const syncBothReady = async (page) => {
      await page.evaluate(() => {
        const e2e = window.__BEYWEB_E2E__;
        if (!e2e.getState().awaitingRoundReady) return;
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

    const after = await host.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(after.hasArenaBodies).toBe(true);
    expect(after.hudVisible).toBe(true);
    expect(after.gameFrozen).toBe(false);
    expect(after.gameRunning).toBe(true);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('online hides Change Bey after a match', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await waitForOnlineMatch(host);
    await expect(host.locator('#btn-change-bey')).toHaveClass(/hidden/);
    await forceRoundEnd(host, guest);
    await expect(host.locator('#btn-change-bey')).toHaveClass(/hidden/);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('online rematch requires both players and opens bey selection in same lobby', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await waitForOnlineMatch(host);

    const roomBefore = (await getE2EState(host)).roomId;
    await forceSeriesEnd(host, guest);

    await expect(host.locator('#btn-restart')).toContainText('Rematch (0/2)');
    await clickRematch(host);
    await expect(host.locator('#btn-restart')).toContainText('Rematch (1/2)');

    await clickRematch(guest);
    await syncRematchReady(host, guest);

    await host.waitForSelector('.online-select', { timeout: 15000 });
    await guest.waitForSelector('.online-select', { timeout: 15000 });

    const hostState = await getE2EState(host);
    const guestState = await getE2EState(guest);
    expect(hostState.hasArenaBodies).toBe(false);
    expect(hostState.hudVisible).toBe(false);
    expect(hostState.gameoverVisible).toBe(false);
    expect(hostState.roomId).toBe(roomBefore);
    expect(guestState.roomId).toBe(roomBefore);
    await expect(host.locator('#online-link')).toHaveCount(0);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('online rematch starts a fresh match after new lock-in', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await waitForOnlineMatch(host);

    const roomBefore = (await getE2EState(host)).roomId;
    await forceSeriesEnd(host, guest);

    await clickRematch(host);
    await clickRematch(guest);
    await syncRematchReady(host, guest);

    await host.waitForSelector('.online-select');
    await guest.waitForSelector('.online-select');
    await host.click('#btn-lock');
    await guest.click('#btn-lock');

    await waitForOnlineMatch(host);
    await waitForOnlineMatch(guest);

    const hostState = await getE2EState(host);
    const guestState = await getE2EState(guest);
    expect(hostState.hasArenaBodies).toBe(true);
    expect(hostState.hudVisible).toBe(true);
    expect(hostState.roomId).toBe(roomBefore);
    expect(guestState.roomId).toBe(roomBefore);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('online bey selection shows centered emblem layout', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await host.goto('/pc/?e2e=1');
    await waitForE2E(host);
    await host.getByRole('button', { name: 'Online' }).click();
    await host.waitForSelector('#online-flow:not(.hidden)');
    const joinUrl = await createOnlineRoom(host);
    const roomCode = new URL(joinUrl).searchParams.get('room');
    await guest.goto('/pc/?e2e=1');
    await waitForE2E(guest);
    await guest.getByRole('button', { name: 'Online' }).click();
    await guest.waitForSelector('#online-flow:not(.hidden)');
    await joinOnlineRoom(guest, roomCode);
    await host.waitForSelector('#online-continue:not([disabled])');
    await guest.waitForSelector('#online-continue:not([disabled])');
    await host.click('#online-continue');
    await guest.click('#online-continue');

    await host.waitForSelector('.online-select');
    const frontCard = host.locator('.online-carousel-scene .bey-card.active');
    await expect(frontCard).toBeVisible();
    await expect(frontCard.locator('.bey-emblem .bey-emblem-img')).toBeVisible();

    const emblemBox = await frontCard.locator('.bey-emblem').boundingBox();
    const imgBox = await frontCard.locator('.bey-emblem .bey-emblem-img').boundingBox();
    expect(emblemBox).toBeTruthy();
    expect(imgBox).toBeTruthy();
    if (emblemBox && imgBox) {
      const emblemCenterX = emblemBox.x + emblemBox.width / 2;
      const imgCenterX = imgBox.x + imgBox.width / 2;
      expect(Math.abs(emblemCenterX - imgCenterX)).toBeLessThan(8);
    }
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
