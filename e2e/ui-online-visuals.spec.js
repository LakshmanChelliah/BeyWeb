import { test, expect } from '@playwright/test';
import { hostGuestPair, setupOnlineMatch } from './helpers/onlineMatch.js';
import { waitForOnlineMatch } from './helpers/ui.js';

test('online match keeps bey visuals during stale countdown ticks', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await waitForOnlineMatch(host);

    await host.waitForFunction(() => {
      const s = window.__BEYWEB_E2E__.getState();
      return s.hudVisible && s.hasArenaBodies && s.hasTopVisuals;
    }, null, { timeout: 30000 });

    const before = await host.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(before.hasTopVisuals).toBe(true);
    expect(before.gameRunning).toBe(true);

    await host.evaluate(() => {
      window.__BEYWEB_E2E__.dispatchMessage('countdown', { seconds: 3 });
      window.__BEYWEB_E2E__.dispatchMessage('countdown', { seconds: 2 });
    });

    await host.waitForTimeout(400);

    const after = await host.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(after.hasArenaBodies).toBe(true);
    expect(after.hasTopVisuals).toBe(true);
    expect(after.hudVisible).toBe(true);
    expect(after.gameRunning).toBe(true);
    expect(after.gameFrozen).toBe(false);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
