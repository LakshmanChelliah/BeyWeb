import { test, expect } from '@playwright/test';
import { gotoPcE2E, gotoMobileE2E, clickMode } from './helpers/ui.js';

async function assertFreshOnlineLobby(page) {
  await clickMode(page, 'Online');
  await page.waitForSelector('#online-flow:not(.hidden)');

  await expect(page.locator('#online-entry-panel')).toBeVisible();
  await expect(page.locator('#online-create-btn')).toBeVisible();
  await expect(page.locator('#online-join-btn')).toBeVisible();

  await expect(page.locator('#online-room-panel')).toBeHidden();
  await expect(page.locator('#online-ready-popup')).toBeHidden();
  await expect(page.getByText('Both connected', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Choose Your Bey' })).toBeHidden();

  const popupDisplay = await page.locator('#online-ready-popup').evaluate(
    (el) => getComputedStyle(el).display,
  );
  expect(popupDisplay).toBe('none');
}

test('online lobby shows create/join entry before room is created (PC)', async ({ page }) => {
  await gotoPcE2E(page);
  await assertFreshOnlineLobby(page);
});

test('online lobby shows create/join entry before room is created (mobile)', async ({ page }) => {
  await gotoMobileE2E(page);
  await assertFreshOnlineLobby(page);
});
