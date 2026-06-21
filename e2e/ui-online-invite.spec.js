import { test, expect } from '@playwright/test';
import { hostGuestPair, waitForE2E, waitForRoomLink } from './helpers/onlineMatch.js';

test('guest joins host lobby via invite link (does not create new room)', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await host.goto('/pc/?e2e=1');
    await host.waitForSelector('#select-overlay');
    await waitForE2E(host);
    await host.getByRole('button', { name: 'Online' }).click();
    await host.waitForSelector('#online-flow:not(.hidden)');

    const joinUrl = await waitForRoomLink(host);
    expect(joinUrl).toMatch(/room=[A-Z0-9]+/);

    const hostRoom = await host.evaluate(() => window.__BEYWEB_E2E__.getState().roomId);
    expect(hostRoom).toBeTruthy();

    const guestUrl = joinUrl.includes('?')
      ? `${joinUrl}&e2e=1`
      : `${joinUrl}?e2e=1`;

    await guest.goto(guestUrl);
    await guest.waitForSelector('#online-flow:not(.hidden)');
    await waitForE2E(guest);

    await guest.waitForFunction((expectedRoom) => {
      const s = window.__BEYWEB_E2E__.getState();
      return s.slot === 1 && s.roomId === expectedRoom;
    }, hostRoom);

    await expect(guest.locator('#online-host-panel')).toBeHidden();
    await expect(guest.getByText('Joined room')).toBeVisible();
    await expect(host.getByText(/share the link/i)).toBeVisible();

    await host.waitForSelector('#online-continue:not([disabled])');
    await guest.waitForSelector('#online-continue:not([disabled])');
    await expect(host.getByText(/Both connected/i)).toBeVisible();
    await expect(guest.getByText(/Both connected/i)).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});

test('online lobby copy link button works', async ({ page }) => {
  await page.goto('/pc/?e2e=1');
  await waitForE2E(page);
  await page.getByRole('button', { name: 'Online' }).click();
  await page.waitForSelector('#online-link');

  const link = await page.inputValue('#online-link');
  await page.locator('#online-copy').click();
  await expect(page.locator('#online-copy')).toHaveText(/Copied!|Press Ctrl\+C/);
  expect(link.length).toBeGreaterThan(10);
});
