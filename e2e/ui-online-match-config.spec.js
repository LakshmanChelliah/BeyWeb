import { test, expect } from '@playwright/test';
import { hostGuestPair, waitForE2E } from './helpers/onlineMatch.js';

test('online match uses server bey payload when countdown arrives first', async ({ browser }) => {
  const { host, hostContext } = await hostGuestPair(browser);
  try {
    await host.goto('/pc/?e2e=1');
    await waitForE2E(host);

    await host.evaluate(() => {
      const e2e = window.__BEYWEB_E2E__;
      e2e.onlineCtrl.start(0);
      e2e.dispatchMessage('countdown', { seconds: 0 });
    });

    let state = await host.evaluate(() => window.__BEYWEB_E2E__.getState());
    expect(state.gameRunning).toBe(false);
    expect(state.hasArenaBodies).toBe(false);

    await host.evaluate(() => {
      const e2e = window.__BEYWEB_E2E__;
      e2e.dispatchMessage('match_config', {
        beyIds: ['lightning_ldrago', 'pegasus'],
        beys: [
          {
            id: 'lightning_ldrago',
            name: 'LIGHTNING L-DRAGO',
            color: '#5B21D9',
            model: 'lightning_ldrago.glb',
            logo: 'ldrago_logo.png',
            atk: 83,
            move: 87,
            def: 28,
            sta: 28,
            leftSpin: true,
            gimmicks: {
              power: 'ldrago_upper_mode',
              special: 'ldrago_soaring_bite_strike',
            },
          },
          {
            id: 'pegasus',
            name: 'STORM PEGASUS',
            color: '#3b82f6',
            model: 'storm_pegasus.glb',
            logo: 'pegasusLogo.png',
            atk: 83,
            move: 92,
            def: 28,
            sta: 22,
            leftSpin: false,
            gimmicks: {
              power: 'pegasus_speed_boost',
              special: 'pegasus_star_blast',
            },
          },
        ],
        scores: [0, 0],
        round: 1,
        winsNeeded: 3,
        seed: 1,
      });
    });

    await host.waitForFunction(() => {
      const s = window.__BEYWEB_E2E__.getState();
      return s.hasArenaBodies && s.hasTopVisuals && s.gameRunning;
    }, null, { timeout: 15000 });

    const after = await host.evaluate(() => {
      const gr = window.__BEYWEB_E2E__.gameRef.state;
      const abilities = [...document.querySelectorAll('#player-abilities .ability-name')].map((el) => el.textContent);
      return {
        playerBey: gr.playerBey?.id,
        aiBey: gr.aiBey?.id,
        abilities,
      };
    });

    expect(after.playerBey).toBe('lightning_ldrago');
    expect(after.aiBey).toBe('pegasus');
  } finally {
    await hostContext.close();
  }
});
