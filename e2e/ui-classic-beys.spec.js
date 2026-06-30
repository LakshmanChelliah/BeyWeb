import { test, expect } from '@playwright/test';
import { gotoPcE2E, clickMode, selectFocusedBey } from './helpers/ui.js';

async function focusBeyByName(page, targetName) {
  const dots = page.locator('.carousel-dot');
  const count = await dots.count();
  for (let i = 0; i < count; i++) {
    const name = (await page.locator('.bey-card.active .bey-name').textContent())?.trim();
    if (name === targetName) return;
    await page.locator('.carousel-arrow.right').click();
  }
  throw new Error(`${targetName} not found in carousel`);
}

test.describe('Classic bey abilities', () => {
  test('Ray Striker shows ability buttons in offline match', async ({ page }) => {
    await gotoPcE2E(page);
    await clickMode(page, 'Tournament');
    await focusBeyByName(page, 'RAY STRIKER');
    await selectFocusedBey(page);
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__BEYWEB_E2E__.getState().hudVisible);
    await expect(page.locator('#p1-abilities .ability-btn')).toHaveCount(2);
    const names = await page.locator('#p1-abilities .ability-name').allTextContents();
    expect(names.some((n) => /Blitz Charge/i.test(n))).toBe(true);
    expect(names.some((n) => /Lightning Sword Flash/i.test(n))).toBe(true);
  });
});
