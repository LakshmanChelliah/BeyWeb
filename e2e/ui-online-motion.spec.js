import { test, expect } from '@playwright/test';
import { setupOnlineMatch, hostGuestPair } from './helpers/onlineMatch.js';

const MAX_FRAME_DELTA = 3.0;
const MIN_MOTION_FRAMES = 30;

test('online match: beys move smoothly without large teleports', async ({ browser }) => {
  const { host, guest, hostContext, guestContext } = await hostGuestPair(browser);
  try {
    await setupOnlineMatch(host, guest);
    await host.bringToFront();

    await host.waitForFunction(
      (minFrames) => {
        const m = window.__BEYWEB_E2E__.getState().onlineMotion;
        return m && m.frames >= minFrames;
      },
      MIN_MOTION_FRAMES,
      { timeout: 45000 }
    );

    const motion = await host.evaluate(() => window.__BEYWEB_E2E__.getState().onlineMotion);

    expect(motion.frames).toBeGreaterThanOrEqual(MIN_MOTION_FRAMES);
    expect(motion.maxFrameDelta).toBeLessThan(MAX_FRAME_DELTA);
    expect(motion.snapsPerSec).toBeLessThan(3);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
