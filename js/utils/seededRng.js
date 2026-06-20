/** Mulberry32 — fast deterministic PRNG for match replay. */
export function createSeededRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const p of parts) {
    const str = String(p);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return h >>> 0;
}

/** Read match RNG from state, fall back to Math.random for local play. */
export function matchRandom(state) {
  if (typeof state?.rng === 'function') return state.rng();
  return Math.random();
}
