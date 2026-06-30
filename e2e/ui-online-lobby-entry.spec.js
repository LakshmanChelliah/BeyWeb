import { test, expect } from '@playwright/test';
import { gotoPcE2E, clickMode } from './helpers/ui.js';

test('online lobby shows create/join entry before room is created', async ({ page }) => {
  await gotoPcE2E(page);
  await clickMode(page, 'Online');
  await page.waitForSelector('#online-flow:not(.hidden)');

  await expect(page.locator('#online-entry-panel')).toBeVisible();
  await expect(page.locator('#online-create-btn')).toBeVisible();
  await expect(page.locator('#online-join-btn')).toBeVisible();

  await expect(page.locator('#online-room-panel')).toBeHidden();
  await expect(page.locator('#online-ready-popup')).toBeHidden();
  await expect(page.getByText('Both connected', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Choose Your Bey' })).toBeHidden();
});
