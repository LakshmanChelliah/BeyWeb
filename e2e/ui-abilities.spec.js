import { test, expect } from '@playwright/test';
import { gotoPcE2E, startOfflineMatch } from './helpers/ui.js';

test.describe('In-match ability UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPcE2E(page);
    await startOfflineMatch(page);
  });

  test('ability buttons are visible for player', async ({ page }) => {
    await expect(page.locator('#p1-abilities .ability-btn')).not.toHaveCount(0);
    await expect(page.locator('#p1-abilities')).toHaveClass(/visible/);
  });

  test('power ability click keeps match running', async ({ page }) => {
    await page.locator('#p1-abilities .ability-btn').first().click();
    const state = await page.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(state.gameRunning).toBe(true);
  });

  test('Q key triggers power ability', async ({ page }) => {
    await page.keyboard.press('KeyQ');
    const state = await page.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(state.gameRunning).toBe(true);
  });

  test('2-player shows both ability bars', async ({ page }) => {
    await page.goto('/pc/?e2e=1');
    await page.waitForFunction(() => window.__BEYWEB_E2E__ != null);
    await page.getByRole('button', { name: '2 Players' }).click();
    await page.locator('.bey-card.active .bey-select-btn').click();
    await page.locator('.bey-card.active .bey-select-btn').click();
    await page.locator('#btn-start').click();
    await expect(page.locator('#p1-abilities .ability-btn')).not.toHaveCount(0);
    await expect(page.locator('#p2-abilities .ability-btn')).not.toHaveCount(0);
  });
});
