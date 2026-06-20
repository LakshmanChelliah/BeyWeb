/**
 * Shared Playwright helpers for BeyWeb UI tests.
 */

export async function waitForE2E(page) {
  await page.waitForFunction(() => window.__BEYWEB_E2E__ != null);
}

export async function gotoPcE2E(page) {
  await page.goto('/pc/?e2e=1');
  await page.waitForSelector('#select-overlay');
  await waitForE2E(page);
}

export async function gotoMobileE2E(page) {
  await page.goto('/?e2e=1');
  await page.waitForSelector('#select-overlay');
  await waitForE2E(page);
}

export async function selectFocusedBey(page) {
  await page.locator('.bey-card.active .bey-select-btn').click({ force: true });
}

export async function waitForOnlineMatch(page) {
  await page.waitForFunction(() => {
    const e2e = window.__BEYWEB_E2E__;
    const s = e2e.getState();
    return (s.hudVisible || s.gameRunning) && e2e.onlineCtrl.isActive();
  }, null, { timeout: 45000 });
}

export async function startOfflineMatch(page) {
  await selectFocusedBey(page);
  await page.waitForFunction(() => {
    const overlay = document.getElementById('start-overlay');
    return overlay && !overlay.classList.contains('hidden');
  });
  await page.locator('#btn-start').click();
  await page.waitForFunction(() => window.__BEYWEB_E2E__.getState().hudVisible);
}

export async function forceOfflineEnd(page, result = { outcome: 'KO', winner: 1 }) {
  await page.evaluate((r) => {
    const e2e = window.__BEYWEB_E2E__;
    if (!e2e.gameRef.state.gameRunning) {
      e2e.gameRef.state.gameRunning = true;
    }
    e2e.gameRef.endOfflineMatch(r);
  }, result);
  await page.waitForSelector('#gameover-overlay.visible');
}

export async function getE2EState(page) {
  return page.evaluate(() => window.__BEYWEB_E2E__.getState());
}

export async function clickMode(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
}
