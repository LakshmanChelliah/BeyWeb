import { test, expect } from '@playwright/test';
import {
  gotoPcE2E,
  clickMode,
  selectFocusedBey,
  startOfflineMatch,
  forceOfflineEnd,
} from './helpers/ui.js';

test.describe('Casual mode UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPcE2E(page);
    await clickMode(page, 'Casual');
  });

  test('difficulty buttons update active state', async ({ page }) => {
    await page.getByRole('button', { name: 'Extreme' }).click();
    await expect(page.getByRole('button', { name: 'Extreme' })).toHaveClass(/active/);
    await page.getByRole('button', { name: 'Easy' }).click();
    await expect(page.getByRole('button', { name: 'Easy' })).toHaveClass(/active/);
  });

  test('campaign HUD shows difficulty after start', async ({ page }) => {
    await page.getByRole('button', { name: 'Hard' }).click();
    await startOfflineMatch(page);
    await expect(page.locator('#campaign-hud')).not.toHaveClass(/hidden/);
    await expect(page.locator('#campaign-hud')).toContainText('Hard');
  });

  test('win shows Next Rival and restart starts new match', async ({ page }) => {
    await startOfflineMatch(page);
    await forceOfflineEnd(page, { outcome: 'KO', winner: 1 });

    await expect(page.locator('#btn-restart')).toHaveText('Next Rival');
    await page.locator('#btn-restart').click();
    await expect(page.locator('#gameover-overlay')).not.toHaveClass(/visible/);
    await expect(page.locator('#hud')).toHaveClass(/visible/);
  });

  test('loss shows Try Again', async ({ page }) => {
    await startOfflineMatch(page);
    await forceOfflineEnd(page, { outcome: 'KO', winner: 2 });
    await expect(page.locator('#btn-restart')).toHaveText('Try Again');
  });
});
