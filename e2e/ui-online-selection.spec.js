import { test, expect } from '@playwright/test';
import { hostGuestPair, waitForE2E, selectOnlineMode } from './helpers/onlineMatch.js';
import { waitForOnlineMatch } from './helpers/ui.js';

test('online bey selection: lock, unlock, and match start', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await selectOnlineMode(host);
    await waitForE2E(host);
    await host.waitForSelector('#online-link');
    const joinUrl = await host.inputValue('#online-link');
    const guestUrl = joinUrl.includes('?') ? `${joinUrl}&e2e=1` : `${joinUrl}?e2e=1`;

    await guest.goto(guestUrl);
    await waitForE2E(guest);
    await host.waitForSelector('#online-continue:not([disabled])');
    await guest.waitForSelector('#online-continue:not([disabled])');
    await host.click('#online-continue');
    await guest.click('#online-continue');

    await host.waitForSelector('#btn-lock');
    await guest.waitForSelector('#btn-lock');

    // Host locks, then changes pick before opponent locks
    await host.click('#btn-lock');
    await expect(host.locator('#btn-lock')).toHaveText(/Locked In/);
    await host.click('#btn-unlock');
    await expect(host.locator('#btn-unlock')).toBeHidden();

    // Carousel navigation while unlocked
    const first = await host.locator('.online-carousel-mount .bey-card.active .bey-name').textContent();
    await host.locator('.online-carousel-mount .carousel-arrow.right').click();
    const second = await host.locator('.online-carousel-mount .bey-card.active .bey-name').textContent();
    expect(second).not.toBe(first);

    await host.click('#btn-lock');
    await guest.click('#btn-lock');

    await waitForOnlineMatch(host);
    await waitForOnlineMatch(guest);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
