import { test, expect, devices } from '@playwright/test';
import { gotoMobileE2E, clickMode, selectFocusedBey } from './helpers/ui.js';

// Chromium mobile viewport (no WebKit dependency — matches CI install)
test.use({ ...devices['Pixel 5'] });

test.describe('Mobile UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoMobileE2E(page);
  });

  test('shows mobile start label and mode tabs', async ({ page }) => {
    await expect(page.locator('#btn-start')).toHaveText(/Calibrate/);
    await expect(page.getByRole('button', { name: 'Online' })).toBeVisible();
    await expect(page.getByRole('button', { name: '2 Players' })).toHaveCount(0);
  });

  test('online mode shows lobby on mobile', async ({ page }) => {
    await clickMode(page, 'Online');
    await expect(page.locator('#online-flow')).not.toHaveClass(/hidden/);
    await page.waitForSelector('#online-link', { timeout: 15000 });
    await expect(page.locator('#online-link')).not.toHaveValue('');
  });

  test('bey selection title on mobile', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CHOOSE YOUR BEY' })).toBeVisible();
    await selectFocusedBey(page);
    await expect(page.locator('#start-overlay')).not.toHaveClass(/hidden/);
  });

  test('recalibrate button exists on game over', async ({ page }) => {
    await selectFocusedBey(page);
    await page.evaluate(() => {
      window.__BEYWEB_E2E__.gameRef.endOfflineMatch({ outcome: 'KO', winner: 1 });
    });
    await page.waitForSelector('#gameover-overlay.visible');
    await expect(page.locator('#btn-recalibrate')).toBeVisible();
  });
});
