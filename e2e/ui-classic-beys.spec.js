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

async function startTournamentWithBey(page, targetName) {
  await gotoPcE2E(page);
  await clickMode(page, 'Tournament');
  await focusBeyByName(page, targetName);
  await expect(page.locator('.bey-card.active .bey-name')).toHaveText(targetName);
  await selectFocusedBey(page);
  await page.waitForFunction(() => {
    const overlay = document.getElementById('start-overlay');
    const btn = document.getElementById('btn-start');
    return overlay && !overlay.classList.contains('hidden') && btn && !btn.disabled;
  });
  await page.locator('#btn-start').click();
  await page.waitForFunction(() => window.__BEYWEB_E2E__.getState().hudVisible);
}

test.describe('Classic bey abilities', () => {
  test('Ray Striker shows ability buttons in offline match', async ({ page }) => {
    await startTournamentWithBey(page, 'RAY STRIKER');
    await expect(page.locator('#p1-abilities .ability-btn')).toHaveCount(2);
    const names = await page.locator('#p1-abilities .ability-name').allTextContents();
    expect(names.some((n) => /Blitz Charge/i.test(n))).toBe(true);
    expect(names.some((n) => /Lightning Sword Flash/i.test(n))).toBe(true);
  });

  test('Earth Eagle shows ability buttons in offline match', async ({ page }) => {
    await startTournamentWithBey(page, 'EARTH EAGLE');
    const names = await page.locator('#p1-abilities .ability-name').allTextContents();
    expect(names.some((n) => /Counter Stance/i.test(n))).toBe(true);
    expect(names.some((n) => /Diving Crush/i.test(n))).toBe(true);
  });

  test('Lightning L-Drago shows ability buttons in offline match', async ({ page }) => {
    await startTournamentWithBey(page, 'LIGHTNING L-DRAGO');
    const names = await page.locator('#p1-abilities .ability-name').allTextContents();
    expect(names.some((n) => /Upper Mode/i.test(n))).toBe(true);
    expect(names.some((n) => /Soaring Destruction/i.test(n))).toBe(true);
  });

  test('Meteo L-Drago power ability keeps match running', async ({ page }) => {
    await gotoPcE2E(page);
    await clickMode(page, 'Casual');
    await focusBeyByName(page, 'METEO L-DRAGO');
    await expect(page.locator('.bey-card.active .bey-name')).toHaveText('METEO L-DRAGO');
    await selectFocusedBey(page);
    await page.waitForFunction(() => {
      const overlay = document.getElementById('start-overlay');
      const btn = document.getElementById('btn-start');
      return overlay && !overlay.classList.contains('hidden') && btn && !btn.disabled;
    });
    await page.locator('#btn-start').click();
    await page.waitForFunction(() => window.__BEYWEB_E2E__.getState().hudVisible);
    await page.keyboard.press('KeyQ');
    const state = await page.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(state.gameRunning).toBe(true);
  });
});
