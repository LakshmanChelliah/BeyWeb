import { CONFIG } from '../config.js';
import { applySteerForce } from '../physics/steer.js';

export function createKeyboardInput(onStart, onRestart, onAbility) {
  const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
  };

  // Ability bindings: P1 (arrows) on the right side, P2 (WASD) on the left.
  const abilityKeys = {
    Period: { player: 1, slot: 'power' },
    Slash: { player: 1, slot: 'special' },
    KeyQ: { player: 2, slot: 'power' },
    KeyE: { player: 2, slot: 'special' },
  };

  function clearKeys() {
    for (const code in keys) keys[code] = false;
  }

  function onKeyDown(e) {
    if (e.code in keys) {
      e.preventDefault();
      keys[e.code] = true;
    }
    if (e.code in abilityKeys && !e.repeat) {
      e.preventDefault();
      const { player, slot } = abilityKeys[e.code];
      onAbility?.(player, slot);
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      onStart?.();
      onRestart?.();
    }
  }

  function onKeyUp(e) {
    if (e.code in keys) {
      e.preventDefault();
      keys[e.code] = false;
    }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearKeys);

  const steerOpts = { minSpin: CONFIG.SLEEP_THRESHOLD, skipKinematic: true };

  function applyDirectionalSteer(body, spin, getDir) {
    const { dirX, dirZ } = getDir();
    applySteerForce(body, dirX, dirZ, spin, CONFIG.STEER_FORCE, steerOpts);
  }

  function applyPlayer1Steer(body, spin) {
    applyDirectionalSteer(body, spin, () => {
      let dirX = 0;
      let dirZ = 0;
      if (keys.ArrowLeft) dirX -= 1;
      if (keys.ArrowRight) dirX += 1;
      if (keys.ArrowUp) dirZ -= 1;
      if (keys.ArrowDown) dirZ += 1;
      return { dirX, dirZ };
    });
  }

  function applyPlayer2Steer(body, spin) {
    applyDirectionalSteer(body, spin, () => {
      let dirX = 0;
      let dirZ = 0;
      if (keys.KeyA) dirX -= 1;
      if (keys.KeyD) dirX += 1;
      if (keys.KeyW) dirZ -= 1;
      if (keys.KeyS) dirZ += 1;
      return { dirX, dirZ };
    });
  }

  return { clearKeys, applyPlayer1Steer, applyPlayer2Steer };
}
