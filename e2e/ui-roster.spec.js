import { test, expect } from '@playwright/test';
import { gotoPcE2E } from './helpers/ui.js';

const EXPANSION_BEYS = ['LIGHTNING L-DRAGO', 'EARTH EAGLE', 'RAY STRIKER'];

test.describe('Playable bey roster', () => {
  test.beforeEach(async ({ page }) => {
    await gotoPcE2E(page);
  });

  test('carousel lists expansion beys', async ({ page }) => {
    const names = await page.locator('.bey-item .bey-name').allTextContents();
    for (const name of EXPANSION_BEYS) {
      expect(names, `missing ${name} in carousel`).toContain(name);
    }
    expect(await page.locator('.carousel-dot').count()).toBeGreaterThanOrEqual(8);
  });

  test('module graph loads versioned beys.js', async ({ page }) => {
    const beysUrls = [];
    page.on('request', (req) => {
      if (req.url().includes('/js/game/beys.js')) beysUrls.push(req.url());
    });
    await page.reload({ waitUntil: 'networkidle' });
    expect(beysUrls.some((u) => /beys\.js\?v=\d+/.test(u))).toBeTruthy();
  });

  test('beys.js is served with no-cache headers and full roster', async ({ request }) => {
    const res = await request.get('/js/game/beys.js?v=20');
    expect(res.ok()).toBeTruthy();
    const cacheControl = res.headers()['cache-control'] ?? '';
    expect(cacheControl).toMatch(/no-cache/i);
    const body = await res.text();
    expect(body).toContain('lightning_ldrago');
    expect(body).toContain('EARTH EAGLE');
    expect(body).toContain('RAY STRIKER');
  });
});
