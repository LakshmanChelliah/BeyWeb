import { test, expect } from '@playwright/test';
import { gotoPcE2E, clickMode, selectFocusedBey } from './helpers/ui.js';

test.describe('Bey carousel UI', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPcE2E(page);
  });

  test('carousel arrows change focused bey', async ({ page }) => {
    const firstName = await page.locator('.bey-card.active .bey-name').textContent();
    await page.locator('.carousel-arrow.right').click();
    const secondName = await page.locator('.bey-card.active .bey-name').textContent();
    expect(secondName).not.toBe(firstName);

    await page.locator('.carousel-arrow.left').click();
    await expect(page.locator('.bey-card.active .bey-name')).toHaveText(firstName ?? '');
  });

  test('2-player marks first pick as taken for second player', async ({ page }) => {
    await clickMode(page, '2 Players');
    await selectFocusedBey(page);
    await expect(page.getByRole('button', { name: 'TAKEN' })).toHaveCount(1);
  });

  test('carousel indicators reflect focus', async ({ page }) => {
    const onDots = page.locator('.carousel-dot.on');
    await expect(onDots).toHaveCount(1);
    await page.locator('.carousel-arrow.right').click();
    await expect(page.locator('.carousel-dot.on')).toHaveCount(1);
  });
});
