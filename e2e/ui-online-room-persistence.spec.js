import { test, expect } from '@playwright/test';
import { hostGuestPair, waitForE2E } from './helpers/onlineMatch.js';

test('host can reclaim room after refresh when guest has not joined yet', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  try {
    await host.goto('/pc/?e2e=1');
    await waitForE2E(host);

    await host.getByRole('button', { name: 'Online' }).click();
    await host.waitForSelector('#online-flow:not(.hidden)');
    await host.click('#online-create-btn');

    await host.waitForFunction(() => {
      const code = document.getElementById('online-room-code')?.textContent?.trim();
      return code && code.length === 6;
    });

    const roomId = (await host.locator('#online-room-code').textContent())?.trim().toUpperCase();
    const joinUrl = await host.inputValue('#online-link');
    expect(joinUrl).toContain(`room=${roomId}`);

    await host.reload();
    await waitForE2E(host);

    await host.waitForFunction((expectedRoom) => {
      const s = window.__BEYWEB_E2E__.getState();
      return s.roomId === expectedRoom;
    }, roomId, { timeout: 30000 });

    const state = await host.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(state.roomId).toBe(roomId);
    expect(state.slot).toBe(0);
    await expect(host.locator('#online-room-panel')).toBeVisible();
    await expect(host.locator('#online-host-panel')).toBeVisible();
  } finally {
    await hostContext.close();
  }
});

test('guest can join while host is briefly disconnected', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await host.goto('/pc/?e2e=1');
    await waitForE2E(host);
    await host.getByRole('button', { name: 'Online' }).click();
    await host.waitForSelector('#online-flow:not(.hidden)');
    await host.click('#online-create-btn');
    await host.waitForFunction(() => document.getElementById('online-link')?.value?.includes('room='));
    const joinUrl = await host.inputValue('#online-link');
    const roomCode = new URL(joinUrl).searchParams.get('room');

    await hostContext.close();

    await guest.goto(`/pc/?e2e=1&room=${roomCode}`);
    await waitForE2E(guest);
    await guest.waitForFunction((expectedRoom) => {
      const s = window.__BEYWEB_E2E__.getState();
      return s.roomId === expectedRoom && s.slot === 0;
    }, roomCode, { timeout: 30000 });
  } finally {
    await guestContext.close();
  }
});
