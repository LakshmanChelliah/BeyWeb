import { CONFIG } from '../config.js';

/**
 * Buffers steer + one-shot ability presses for network send.
 */
export function createInputBuffer() {
  let steer = { x: 0, y: 0 };
  /** @type {('power'|'special')[]} */
  const abilityQueue = [];
  let clientTick = 0;

  return {
    setSteer(x, y) {
      steer = { x, y };
    },
    queueAbility(slot) {
      if (slot === 'power' || slot === 'special') {
        abilityQueue.push(slot);
      }
    },
    consume() {
      const ability = abilityQueue.length > 0 ? abilityQueue.shift() : null;
      const out = {
        tick: clientTick,
        steer: { ...steer },
        ability,
      };
      clientTick += 1;
      return out;
    },
    getSteer() {
      return { ...steer };
    },
    syncServerTick(serverTick) {
      if (serverTick > clientTick) clientTick = serverTick;
    },
    get tick() {
      return clientTick;
    },
    reset() {
      steer = { x: 0, y: 0 };
      abilityQueue.length = 0;
      clientTick = 0;
    },
  };
}

/** Normalize raw directional input to unit-ish vector */
export function normalizeSteer(dirX, dirZ) {
  const len = Math.hypot(dirX, dirZ);
  if (len < 0.01) return { x: 0, y: 0 };
  return { x: dirX / len, y: dirZ / len };
}

export function steerFromKeys(keys, mapping) {
  let x = 0;
  let z = 0;
  for (const [code, [dx, dz]] of Object.entries(mapping)) {
    if (keys[code]) {
      x += dx;
      z += dz;
    }
  }
  return normalizeSteer(x, z);
}

export const PC_STEER_MAP = {
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1],
};

export const P1_STEER_MAP = PC_STEER_MAP;

export const P2_STEER_MAP = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
