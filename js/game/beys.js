/**
 * Bey roster used by the selection screen and the game engine.
 *
 * `available` — true when the bey has a model in the build and can be picked.
 * `color` is a CSS hex string; the engine converts it to a numeric THREE color via
 * `beyColorHex()`. `model` points at an optional GLB asset (the renderer falls
 * back to a procedural top mesh tinted with `color` when the file is missing).
 *
 * Stats are sourced from official Takara Tomy / Hasbro part-by-part star ratings
 * (Energy Ring + Fusion Wheel + Spin Track + Performance Tip), normalized to 0–100.
 *
 * atk — scales steer force and knockback dealt on impact
 * def — reduces knockback and spin loss received on impact
 * sta — slows the passive spin-decay rate
 *
 * gimmicks — optional ability loadout. Each slot holds an ability ID (or null)
 *   resolved against ABILITY_REGISTRY in js/game/abilities.js:
 *     { power, special, passive }
 *   This keeps beys purely declarative — new beys/moves only add a registry
 *   entry and reference its ID here.
 *
 * logo — optional PNG used for the cinematic special-move flash overlay.
 */
export const BEYS = Object.freeze([
  {
    id: 'pegasus',
    name: 'STORM PEGASUS',
    type: 'Attack',
    desc: 'A relentless tornado assault. Rubber-flat tip makes it the fastest, most aggressive bey on the field.',
    // Storm wheel (ATK ****), Pegasus ring (ATK ****), RF rubber-flat tip (ATK ******)
    atk: 92,
    def: 28,
    sta: 22,
    color: '#3b82f6',
    model: 'storm_pegasus.glb',
    logo: 'pegasusLogo.png',
    gimmicks: {
      power: 'pegasus_speed_boost',
      special: 'pegasus_star_blast',
      passive: null,
    },
    available: true,
  },
  {
    id: 'ldrago',
    name: 'METEO L-DRAGO',
    type: 'Attack',
    desc: 'Left-spin dragon. Activate Spin Steal to drain the opponent\'s spin on every clash.',
    // Meteo wheel, L-Drago II rubber ring (spin-steal), LF left-flat tip
    atk: 85,
    def: 32,
    sta: 52,
    color: '#ef4444',
    model: 'meteo_ldrago.glb',
    logo: 'updatedLdragoLogo.png',
    gimmicks: {
      power: 'ldrago_spin_steal',
      special: 'ldrago_supreme_flight',
      passive: null,
    },
    available: true,
  },
  {
    id: 'leone',
    name: 'ROCK LEONE',
    type: 'Defense',
    desc: 'Kyoya\'s fortress bey. WB tip anchors the dish; Lion Gale Force Wall repels reckless rushdown.',
    // Rock (ATK * DEF **** STA **), Leone ring (ATK * DEF **** STA **), 145 track (STA **), WB (ATK * DEF ***** STA *)
    // Hasbro card: Attack 1 · Defense 4 · Stamina 2
    atk: 18,
    def: 91,
    sta: 46,
    color: '#22c55e',
    model: 'rock_leone.glb',
    logo: 'rockleonelogandFacebolt.png',
    gimmicks: {
      power: 'leone_wide_ball',
      special: 'leone_lion_wall',
      passive: null,
    },
    available: true,
  },
  {
    id: 'libra',
    name: 'FLAME LIBRA',
    type: 'Stamina',
    desc: 'Benkei\'s endurance bey. Sonic Shield deflects rivals; Sonic Buster channels at center into a slowing sand pit.',
    // Flame (ATK ** DEF * STA **), Libra ring, 145 track (STA **), ES tip (STA *****)
    atk: 42,
    def: 28,
    sta: 88,
    color: '#84cc16',
    model: 'flame_libra.glb',
    logo: 'flame_libralogo.png',
    gimmicks: {
      power: 'libra_sonic_shield',
      special: 'libra_sonic_buster',
      passive: null,
    },
    available: true,
  },
  {
    id: 'sagittario',
    name: '???',
    type: '???',
    desc: 'This bey is not available yet.',
    atk: null,
    def: null,
    sta: null,
    color: '#4b5563',
    model: 'flame_sagittario.glb',
    available: true,
  },
  {
    id: 'eagle',
    name: '???',
    type: '???',
    desc: 'This bey is not available yet.',
    atk: null,
    def: null,
    sta: null,
    color: '#4b5563',
    model: 'earth_eagle.glb',
    available: true,
  },
  {
    id: 'bull',
    name: '???',
    type: '???',
    desc: 'This bey is not available yet.',
    atk: null,
    def: null,
    sta: null,
    color: '#4b5563',
    model: 'dark_bull.glb',
    available: true,
  },
]);

/** Beys that can actually be picked in the selection screen. */
export const PLAYABLE_BEYS = Object.freeze(BEYS.filter((b) => b.available));

/** Picks a random playable bey that is not the excluded one (for CPU rivals). */
export function pickOpponentBey(excludedBey) {
  const excludeId = typeof excludedBey === 'string' ? excludedBey : excludedBey?.id;
  const pool = PLAYABLE_BEYS.filter((b) => b.id !== excludeId);
  if (pool.length === 0) return PLAYABLE_BEYS[0] ?? null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Converts a roster `color` CSS hex string to a numeric THREE color. */
export function beyColorHex(color) {
  return parseInt(color.replace('#', ''), 16);
}

export function getBeyById(id) {
  return BEYS.find((b) => b.id === id) || null;
}

export function isBeyPlayable(bey) {
  return Boolean(bey?.available);
}
