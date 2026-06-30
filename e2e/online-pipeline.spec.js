import { test, expect } from '@playwright/test';
import { hostGuestPair, getE2EState } from './helpers/onlineMatch.js';

async function runOnlineMatch(host, guest) {
  async function selectOnline(page) {
    await page.goto('/pc/?e2e=1');
    await page.waitForSelector('#select-overlay');
    await page.waitForFunction(() => window.__BEYWEB_E2E__ != null);
    await page.getByRole('button', { name: 'Online' }).click();
    await page.waitForSelector('#online-flow:not(.hidden)');
  }

  await selectOnline(host);
  await selectOnline(guest);

  await host.click('#online-create-btn');
  await host.waitForFunction(() => /room=/.test(document.getElementById('online-link')?.value ?? ''));
  const joinUrl = await host.inputValue('#online-link');
  const roomCode = new URL(joinUrl).searchParams.get('room');

  await guest.fill('#online-join-code', roomCode);
  await guest.click('#online-join-btn');

  await host.waitForSelector('#online-continue:not([disabled])');
  await guest.waitForSelector('#online-continue:not([disabled])');
  await host.click('#online-continue');
  await guest.click('#online-continue');

  await host.waitForSelector('#btn-lock');
  await guest.waitForSelector('#btn-lock');
  await host.click('#btn-lock');
  await guest.click('#btn-lock');

  await host.waitForFunction(() => {
    const s = window.__BEYWEB_E2E__.getState();
    return (s.hudVisible || s.gameRunning) && window.__BEYWEB_E2E__.onlineCtrl.isActive();
  }, null, { timeout: 45000 });

  await host.waitForFunction(() => window.__BEYWEB_E2E__.getState().snapshotCount > 10, null, {
    timeout: 30000,
  });
  await guest.waitForFunction(() => window.__BEYWEB_E2E__.getState().snapshotCount > 10, null, {
    timeout: 30000,
  });
}

test('online pipeline: server tick advances and input flows during match', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await runOnlineMatch(host, guest);

    const hostBefore = await getE2EState(host);
    const guestBefore = await getE2EState(guest);
    expect(hostBefore.snapshotCount).toBeGreaterThan(10);
    expect(guestBefore.snapshotCount).toBeGreaterThan(10);
    expect(hostBefore.wsOpen).toBe(true);
    expect(guestBefore.wsOpen).toBe(true);

    const hostTick0 = hostBefore.lastServerTick;
    await host.keyboard.down('KeyW');
    await host.keyboard.down('KeyD');
    await host.waitForTimeout(1000);
    await host.keyboard.up('KeyW');
    await host.keyboard.up('KeyD');

    await host.waitForFunction((prev) => {
      return window.__BEYWEB_E2E__.getState().lastServerTick > prev;
    }, hostTick0, { timeout: 15000 });

    const guestTick0 = (await getE2EState(guest)).lastServerTick;
    await guest.waitForFunction((prev) => {
      return window.__BEYWEB_E2E__.getState().lastServerTick > prev;
    }, guestTick0, { timeout: 15000 });
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
