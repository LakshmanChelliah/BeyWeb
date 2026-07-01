import { test, expect, devices } from '@playwright/test';
import {
  hostGuestPair,
  setupOnlineMatchWithBeys,
  setupMobileOnlineMatchWithBeys,
  inspectOnlineMatch,
  forceRoundEnd,
  clickNextRound,
  getE2EState,
} from './helpers/onlineMatch.js';

const HOST_BEY = 'lightning_ldrago';
const GUEST_BEY = 'pegasus';

function expectLdragoPresentation(player, label) {
  expect(player.youId, `${label}: your bey`).toBe(HOST_BEY);
  expect(player.oppId, `${label}: opponent bey`).toBe(GUEST_BEY);
  expect(player.abilities.join(' '), `${label}: abilities`).toMatch(/Upper|Soaring|Bite/i);
  expect(player.youAvatarSrc, `${label}: avatar`).toMatch(/ldrago/i);
  expect(player.oppAvatarSrc, `${label}: rival avatar`).toMatch(/pegasus/i);
}

function expectPegasusPresentation(player, label) {
  expect(player.youId, `${label}: your bey`).toBe(GUEST_BEY);
  expect(player.oppId, `${label}: opponent bey`).toBe(HOST_BEY);
  expect(player.abilities.join(' '), `${label}: abilities`).toMatch(/Speed Boost|Star Blast/i);
  expect(player.youAvatarSrc, `${label}: avatar`).toMatch(/pegasus/i);
  expect(player.oppAvatarSrc, `${label}: rival avatar`).toMatch(/ldrago/i);
}

function expectArenaLive(player, label) {
  expect(player.hasBodies, `${label}: physics bodies`).toBe(true);
  expect(player.hasTopVisuals, `${label}: 3D top meshes`).toBe(true);
  expect(player.topMeshCount, `${label}: mesh count`).toBeGreaterThanOrEqual(2);
  expect(player.hudVisible, `${label}: HUD`).toBe(true);
  expect(player.gameRunning, `${label}: match running`).toBe(true);
  expect(player.spinYou, `${label}: spin meter`).toBeGreaterThan(10);
}

test.describe('friend-like online flow', () => {
  test.setTimeout(180000);

  test('PC host + PC guest: Lightning L-Drago vs Storm Pegasus', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
    try {
      await setupOnlineMatchWithBeys(host, guest, HOST_BEY, GUEST_BEY);

      const hostView = await inspectOnlineMatch(host);
      const guestView = await inspectOnlineMatch(guest);

      expect(hostView.slot).toBe(0);
      expect(guestView.slot).toBe(1);
      expect(hostView.slot0Id).toBe(HOST_BEY);
      expect(hostView.slot1Id).toBe(GUEST_BEY);
      expect(hostView.matchBeyIds).toEqual([HOST_BEY, GUEST_BEY]);

      expectLdragoPresentation(hostView, 'host');
      expectPegasusPresentation(guestView, 'guest');
      expectArenaLive(hostView, 'host');
      expectArenaLive(guestView, 'guest');

      await host.screenshot({ path: 'test-results/friend-flow-pc-host-arena.png' });
      await guest.screenshot({ path: 'test-results/friend-flow-pc-guest-arena.png' });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('mobile host + mobile guest: Lightning L-Drago vs Storm Pegasus', async ({ browser }) => {
    const hostContext = await browser.newContext({
      ...devices['iPhone 13'],
      isMobile: true,
      hasTouch: true,
    });
    const guestContext = await browser.newContext({
      ...devices['iPhone 13'],
      isMobile: true,
      hasTouch: true,
    });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      await setupMobileOnlineMatchWithBeys(host, guest, HOST_BEY, GUEST_BEY);

      const hostView = await inspectOnlineMatch(host);
      const guestView = await inspectOnlineMatch(guest);

      expectLdragoPresentation(hostView, 'mobile host');
      expectPegasusPresentation(guestView, 'mobile guest');
      expectArenaLive(hostView, 'mobile host');
      expectArenaLive(guestView, 'mobile guest');

      await host.screenshot({ path: 'test-results/friend-flow-mobile-host-arena.png' });
      await guest.screenshot({ path: 'test-results/friend-flow-mobile-guest-arena.png' });
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('mixed mobile host + PC guest still shows correct beys and arena tops', async ({ browser }) => {
    const hostContext = await browser.newContext({
      ...devices['iPhone 13'],
      isMobile: true,
      hasTouch: true,
    });
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      await setupMobileOnlineMatchWithBeys(host, guest, HOST_BEY, GUEST_BEY);

      const hostView = await inspectOnlineMatch(host);
      const guestView = await inspectOnlineMatch(guest);

      expectLdragoPresentation(hostView, 'mixed host');
      expectPegasusPresentation(guestView, 'mixed guest');
      expectArenaLive(hostView, 'mixed host');
      expectArenaLive(guestView, 'mixed guest');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('friends can finish a round and start the next with tops still visible', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
    try {
      await setupOnlineMatchWithBeys(host, guest, HOST_BEY, GUEST_BEY);

      await forceRoundEnd(host, guest);
      await clickNextRound(host);
      await clickNextRound(guest);

      for (const page of [host, guest]) {
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
      }

      await host.waitForFunction(() => {
        const s = window.__BEYWEB_E2E__.getState();
        return s.hudVisible && s.hasArenaBodies && s.hasTopVisuals && !s.gameoverVisible;
      }, null, { timeout: 30000 });

      const after = await inspectOnlineMatch(host);
      expect(after.youId).toBe(HOST_BEY);
      expect(after.oppId).toBe(GUEST_BEY);
      expectArenaLive(after, 'round two host');

      const guestState = await getE2EState(guest);
      expect(guestState.hasTopVisuals).toBe(true);
      expect(guestState.hasArenaBodies).toBe(true);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
