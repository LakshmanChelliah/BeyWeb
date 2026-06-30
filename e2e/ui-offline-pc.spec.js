import { test, expect } from '@playwright/test';
import {
  gotoPcE2E,
  selectFocusedBey,
  clickMode,
  forceOfflineEnd,
  startOfflineMatch,
} from './helpers/ui.js';

test.describe('PC offline UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPcE2E(page);
  });

  test('mode tabs show correct panels and hints', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Tournament' })).toHaveClass(/active/);
    await expect(page.getByText('Five rivals in order.')).toBeVisible();

    await clickMode(page, 'Casual');
    await expect(page.locator('.play-setup-diff-label')).toBeVisible();
    await expect(page.getByText('CPU rival is random each match')).toBeVisible();

    await clickMode(page, 'Online');
    await expect(page.locator('#online-flow')).not.toHaveClass(/hidden/);
    await expect(page.getByText(/Join with room code|share code or link/i).first()).toBeVisible();
    await expect(page.locator('.select-mount')).toBeHidden();

    await clickMode(page, 'Tournament');
    await expect(page.locator('#online-flow')).toHaveClass(/hidden/);
    await expect(page.locator('.select-mount')).toBeVisible();
  });

  test('tournament flow: select bey → start → HUD visible', async ({ page }) => {
    await startOfflineMatch(page);
    await expect(page.locator('#controls-hint')).toHaveClass(/visible/);
    const state = await page.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(state.gameRunning).toBe(true);
    expect(state.hudVisible).toBe(true);
  });

  test('2-player mode requires two picks', async ({ page }) => {
    await clickMode(page, '2 Players');
    await expect(page.getByText('PLAYER 1: CHOOSE YOUR BEY')).toBeVisible();

    await selectFocusedBey(page);
    await expect(page.getByText('PLAYER 2: CHOOSE YOUR BEY')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeDisabled();

    await selectFocusedBey(page);
    await expect(page.locator('#start-overlay')).not.toHaveClass(/hidden/);
    await expect(page.locator('#btn-start')).toBeEnabled();
  });

  test('change bey returns to selection', async ({ page }) => {
    await startOfflineMatch(page);
    await forceOfflineEnd(page);

    await page.locator('#btn-change-bey').click();
    await expect(page.locator('#select-overlay')).toBeVisible();
    await expect(page.locator('#hud')).not.toHaveClass(/visible/);
    await expect(page.locator('.bey-card.active .bey-select-btn')).toBeVisible();
  });

  test('keyboard start works on start overlay', async ({ page }) => {
    await selectFocusedBey(page);
    await expect(page.locator('#start-overlay')).not.toHaveClass(/hidden/);
    await page.keyboard.press('Enter');
    await expect(page.locator('#hud')).toHaveClass(/visible/);
  });
});
