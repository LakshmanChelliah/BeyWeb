import { test, expect } from '@playwright/test';
import { hostGuestPair, setupOnlineMatch, getE2EState } from './helpers/onlineMatch.js';
import { waitForOnlineMatch } from './helpers/ui.js';

test('online match keeps bey visuals during stale countdown ticks', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await waitForOnlineMatch(host);
    await waitForOnlineMatch(guest);

    for (const page of [host, guest]) {
      await page.waitForFunction(() => {
        const s = window.__BEYWEB_E2E__.getState();
        return s.hudVisible && s.hasArenaBodies && s.hasTopVisuals;
      }, null, { timeout: 30000 });
    }

    for (const page of [host, guest]) {
      await page.evaluate(() => {
        window.__BEYWEB_E2E__.dispatchMessage('countdown', { seconds: 3 });
        window.__BEYWEB_E2E__.dispatchMessage('countdown', { seconds: 2 });
      });
    }

    await host.waitForTimeout(400);

    for (const [page, label] of [[host, 'host'], [guest, 'guest']]) {
      const after = await getE2EState(page);
      expect(after.hasArenaBodies, `${label} bodies`).toBe(true);
      expect(after.hasTopVisuals, `${label} visuals`).toBe(true);
      expect(after.hudVisible, `${label} hud`).toBe(true);
      expect(after.gameRunning, `${label} running`).toBe(true);
      expect(after.gameFrozen, `${label} frozen`).toBe(false);
    }
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
