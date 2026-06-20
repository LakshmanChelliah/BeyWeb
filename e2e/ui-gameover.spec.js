import { test, expect } from '@playwright/test';
import {
  gotoPcE2E,
  startOfflineMatch,
  forceOfflineEnd,
} from './helpers/ui.js';

test.describe('Game over UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPcE2E(page);
  });

  test('tournament round win shows Next Round', async ({ page }) => {
    await startOfflineMatch(page);
    await forceOfflineEnd(page, { outcome: 'KO', winner: 1 });
    await expect(page.locator('#btn-restart')).toHaveText('Next Round');
    await expect(page.locator('#campaign-hud')).toContainText('Best of 3');
  });

  test('tournament draw shows Rematch', async ({ page }) => {
    await startOfflineMatch(page);
    await forceOfflineEnd(page, { outcome: 'DRAW', winner: null });
    await expect(page.locator('#btn-restart')).toHaveText('Rematch');
  });

  test('Play Again restarts match from game over', async ({ page }) => {
    await startOfflineMatch(page);
    await forceOfflineEnd(page, { outcome: 'KO', winner: 1 });
    await page.locator('#btn-restart').click();
    await expect(page.locator('#gameover-overlay')).not.toHaveClass(/visible/);
    const state = await page.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(state.gameRunning).toBe(true);
  });

  test('Space triggers restart when game over', async ({ page }) => {
    await startOfflineMatch(page);
    await forceOfflineEnd(page, { outcome: 'KO', winner: 1 });
    await page.keyboard.press('Space');
    await expect(page.locator('#gameover-overlay')).not.toHaveClass(/visible/);
  });
});
