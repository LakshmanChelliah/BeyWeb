/**
 * Bey roster used by the selection screen and the game engine.
 *
 * `available` — true when the bey has a model in the build and can be picked.
 * `color` is a CSS hex string; the engine converts it to a numeric THREE color via
 * `beyColorHex()`. `model` points at an optional GLB asset (the renderer falls
 * back to a procedural top mesh tinted with `color` when the file is missing).
 *
 * packagingStars — Metal Fusion box/card ratings (1–5) for the select UI
 * (Energy Ring + Fusion Wheel + Spin Track + Performance Tip), normalized to 0–100.
 *
 * atk — scales knockback dealt on impact
 * move — optional steer-force stat (defaults to atk when omitted)
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
    // Hasbro / Takara Tomy Metal Fusion card stars (1–5)
    packagingStars: { atk: 5, def: 1, sta: 1 },
    atk: 83,
    move: 92,
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
    id: 'lightning_ldrago',
    name: 'LIGHTNING L-DRAGO',
    type: 'Attack',
    desc: 'Ryuga\'s original left-spin dragon. Upper Mode unleashes devastating smash strikes; Soaring Destruction calls lightning from above.',
    // Lightning fusion wheel, L-Drago I energy ring (no rubber), 100 track, HF (Hole Flat) tip.
    // Hasbro BB-43 card stars: Attack 5 / Defense 2 / Stamina 0.
    leftSpin: true,
    packagingStars: { atk: 5, def: 2, sta: 0 },
    atk: 83,
    move: 87,
    def: 28,
    sta: 28,
    color: '#5B21D9',
    model: 'lightning_ldrago.glb',
    logo: 'ldrago_logo.png',
    gimmicks: {
      power: 'ldrago_upper_mode',
      special: 'ldrago_soaring_destruction',
      passive: null,
    },
    available: true,
  },
  {
    id: 'meteo_ldrago',
    name: 'METEO L-DRAGO',
    type: 'Attack',
    desc: 'Ryuga\'s evolved left-spin dragon. Spin Steal drains rivals on every clash; Absorb Break coils and devours their spin in a crimson dragon rush.',
    // Meteo fusion wheel, L-Drago II rubber ring (spin-steal), LF left-flat tip.
    // Hasbro BB-88 card stars: Attack 4 / Defense 2 / Stamina 3.
    leftSpin: true,
    packagingStars: { atk: 4, def: 2, sta: 3 },
    atk: 77,
    move: 85,
    def: 32,
    sta: 52,
    color: '#ef4444',
    model: 'meteo_ldrago.glb',
    logo: 'updatedLdragoLogo.png',
    gimmicks: {
      power: 'ldrago_spin_steal',
      special: 'ldrago_absorb_break',
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
    packagingStars: { atk: 1, def: 4, sta: 2 },
    atk: 18,
    move: 22.58, // steer +15% vs atk-only default; knockback still uses atk
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
    desc: 'A stamina fortress built to outlast the field. ES tip holds spin forever; Sonic Shield repels rushdown and Sonic Buster drags rivals into center quicksand.',
    // Flame (ATK ** DEF * STA **), Libra ring, 145 track (STA **), ES tip (STA *****)
    packagingStars: { atk: 2, def: 1, sta: 5 },
    atk: 42,
    move: 18,
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
    available: false,
  },
  {
    id: 'eagle',
    name: 'EARTH EAGLE',
    type: 'Balance',
    desc: 'Tsubasa\'s balanced sky hunter. Earth wheel and WD tip favor defense and stamina while the Eagle ring keeps movement controlled.',
    // Earth wheel + Eagle/Aquila energy ring + 145 track + WD (Wide Defense) tip.
    packagingStars: { atk: 2, def: 4, sta: 4 },
    atk: 38,
    move: 34,
    orbitDrift: 0.35,  // WD tip creates natural wide sweeping arcs
    def: 72,
    sta: 78,
    color: '#6d28d9',
    model: 'earth_eagle.glb',
    logo: 'earth_eagle_logo.png',
    gimmicks: {
      power: 'eagle_counter_stance',
      special: 'eagle_diving_crush',
      passive: null,
    },
    available: true,
  },
  {
    id: 'striker',
    name: 'RAY STRIKER',
    type: 'Attack',
    desc: 'Masamune\'s blitz striker. Ray wheel and CS tip carve sharp angles; Lightning Sword Flash vanishes and pierces rivals.',
    // Ray wheel (ATK ***), Unicorno ring (ATK ****), D125 track, CS Control Sharp tip.
    // Hasbro BB-99 card: Attack 5 / Defense 1 / Stamina 2.
    packagingStars: { atk: 5, def: 1, sta: 2 },
    atk: 81,
    move: 90,
    def: 26,
    sta: 30,
    color: '#14b8a6',
    model: 'ray_striker.glb',
    logo: 'ray_striker_logo.png',
    gimmicks: {
      power: 'striker_blitz_charge',
      special: 'striker_lightning_flash',
      passive: null,
    },
    available: true,
  },
  {
    id: 'bull',
    name: 'DARK BULL',
    type: 'Balance',
    desc: 'Maximum Stampede boosts speed and contact knockback; Red Horn Uppercut charges and launches foes. Strongest near the rim.',
    // Bull / Dark wheel (ATK ***), Bull ring, 145 track, HF hole flat
    packagingStars: { atk: 4, def: 2, sta: 3 },
    atk: 70,
    move: 42, // faster steer than Libra; atk still drives knockback
    def: 38,
    sta: 34,
    color: '#dc2626',
    model: 'dark_bull.glb',
    logo: 'darkbull_logo.png',
    gimmicks: {
      power: 'bull_maximum_stampede',
      special: 'bull_red_horn_uppercut',
      passive: null,
    },
    available: true,
  },
]);

export function getBeyById(id) {
  const resolved = id === 'ldrago' ? 'meteo_ldrago' : id;
  return BEYS.find((b) => b.id === resolved) || null;
}

/** Resolve roster entry; falls back when id is missing or unknown. */
export function getBeyOrDefault(id, fallbackId = 'pegasus') {
  return getBeyById(id) ?? getBeyById(fallbackId) ?? BEYS[0];
}

export function isBeyPlayable(bey) {
  return Boolean(bey?.available && bey.atk != null);
}

/** Beys that can actually be picked in the selection screen. */
export const PLAYABLE_BEYS = Object.freeze(BEYS.filter(isBeyPlayable));

/** Converts a roster `color` CSS hex string to a numeric THREE color. */
export function beyColorHex(color) {
  return parseInt(color.replace('#', ''), 16);
}
