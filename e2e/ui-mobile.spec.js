import { test, expect, devices } from '@playwright/test';
import { gotoMobileE2E, clickMode, selectFocusedBey } from './helpers/ui.js';
import {
  mockMotionSensors,
  enableGyroE2E,
  simulateTilt,
  calibrateAtTilt,
  expectGyroSteerAbove,
  expectGyroSteerNearZero,
  startMobileOfflineMatch,
  forceMobileOfflineEnd,
  mobileHostGuestPair,
  setupMobileOnlineMatch,
  syncOnlineNextRound,
  forceMobileSeriesEnd,
  forceRoundEnd,
  clickNextRound,
  clickRematch,
  syncRematchReady,
  waitForOnlineMatch,
} from './helpers/mobile.js';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile UI', () => {
  test.beforeEach(async ({ page }) => {
    await mockMotionSensors(page);
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

test.describe('Mobile gyro controls', () => {
  test.beforeEach(async ({ page }) => {
    await mockMotionSensors(page);
    await gotoMobileE2E(page);
    await enableGyroE2E(page);
  });

  test('tilt produces steer input in offline match', async ({ page }) => {
    await startMobileOfflineMatch(page);
    await simulateTilt(page, 18, 12);
    await expectGyroSteerAbove(page);
  });

  test('recalibrate resets steer at neutral pose', async ({ page }) => {
    await startMobileOfflineMatch(page);
    await simulateTilt(page, 20, 15);
    await expectGyroSteerAbove(page);

    await calibrateAtTilt(page, 20, 15);
    await expectGyroSteerNearZero(page);
  });

  test('play again keeps gyro steering on next match', async ({ page }) => {
    await startMobileOfflineMatch(page);
    await simulateTilt(page, 16, 10);
    await expectGyroSteerAbove(page);

    await forceMobileOfflineEnd(page, { outcome: 'KO', winner: 1 });
    await expect(page.locator('#btn-restart')).toHaveText('Next Round');
    await page.locator('#btn-restart').click();

    await page.waitForFunction(() => {
      const s = window.__BEYWEB_E2E__.getState();
      return s.gameRunning && s.hudVisible && !s.gameoverVisible;
    });

    await simulateTilt(page, 14, 18);
    await expectGyroSteerAbove(page);
  });

  test('recalibrate button works during game over', async ({ page }) => {
    await startMobileOfflineMatch(page);
    await simulateTilt(page, 22, 8);
    await forceMobileOfflineEnd(page, { outcome: 'KO', winner: 1 });

    await simulateTilt(page, 22, 8);
    await page.locator('#btn-recalibrate').click();
    await page.evaluate(() => window.__BEYWEB_E2E__.refreshGyroSteer());
    await expectGyroSteerNearZero(page);
  });
});

test.describe('Mobile online gyro', () => {
  test('gyro steer works during online match', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);
      await simulateTilt(host, 15, 12);
      await expectGyroSteerAbove(host);
      await simulateTilt(guest, 10, 18);
      await expectGyroSteerAbove(guest);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('gyro steer works after online next round', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);
      await forceRoundEnd(host, guest);

      await clickNextRound(host);
      await clickNextRound(guest);
      await syncOnlineNextRound(host, guest);

      await enableGyroE2E(host);
      await simulateTilt(host, 17, 11);
      await expectGyroSteerAbove(host);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('gyro steer works after online rematch', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);
      await forceMobileSeriesEnd(host, guest);

      await clickRematch(host);
      await clickRematch(guest);
      await syncRematchReady(host, guest);

      await host.waitForSelector('.online-select');
      await guest.waitForSelector('.online-select');

      await enableGyroE2E(host);
      await enableGyroE2E(guest);
      await host.click('#btn-lock');
      await guest.click('#btn-lock');

      await waitForOnlineMatch(host);
      await waitForOnlineMatch(guest);

      await simulateTilt(host, 13, 16);
      await expectGyroSteerAbove(host);
      await simulateTilt(guest, 19, 9);
      await expectGyroSteerAbove(guest);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test('online recalibrate stays available on mobile', async ({ browser }) => {
    const { host, guest, hostContext, guestContext } = await mobileHostGuestPair(browser);
    try {
      await setupMobileOnlineMatch(host, guest);
      await forceRoundEnd(host, guest);

      await expect(host.locator('#btn-recalibrate')).toBeVisible();
    await simulateTilt(host, 21, 6);
    await host.locator('#btn-recalibrate').click();
    await calibrateAtTilt(host, 21, 6);
    await expectGyroSteerNearZero(host);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
