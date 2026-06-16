/**
 * Pure helpers that convert 0–100 bey stats into physics multipliers.
 * Falls back to a neutral value of 50 when a stat is not yet defined.
 *
 * Two separate ATK multipliers serve different purposes:
 *
 *   moveSpeedMult — steer force (wide range 0.20–1.80 so speed feels distinct)
 *   atkSpeedMult  — alias of moveSpeedMult (legacy name)
 *   atkCombatMult — knockback & spin drain (symmetric with defMult, range 0.50–1.50
 *                   so an ATK=100 bey exactly cancels a DEF=100 bey at parity)
 *
 *   defMult      — absorbs knockback on impact (0.50 – 1.50)
 *   spinDefMult  — extra spin-loss reduction on clash; ramps faster with DEF
 *   staMult      — spin-decay rate; lower = slower decay (1.50 – 0.50)
 */

/** Steer-force multiplier — wide range so Pegasus feels noticeably faster. */
export function moveSpeedMult(beyStats) {
  const move = beyStats?.move ?? beyStats?.atk ?? 50;
  return 0.2 + move / 62.5;   // 0.20 → 1.80
}

/** @deprecated Use moveSpeedMult — kept for callers that still import atkSpeedMult. */
export function atkSpeedMult(beyStats) {
  return moveSpeedMult(beyStats);
}

/** Combat multiplier for knockback and spin loss dealt on impact. */
export function atkCombatMult(beyStats) {
  return 0.5 + (beyStats?.atk ?? 50) / 100;     // 0.50 → 1.50  (mirrors defMult)
}

/** Defense multiplier — scales incoming knockback and spin loss absorbed. */
export function defMult(beyStats) {
  return 0.5 + (beyStats?.def ?? 50) / 100;     // 0.50 → 1.50
}

/**
 * Spin-loss divisor on clash — ramps faster with DEF than defMult so defense
 * beys keep momentum without becoming immovable walls (knockback still uses defMult).
 */
export function spinDefMult(beyStats) {
  const def = beyStats?.def ?? 50;
  return 0.5 + def / 58;                        // def 91 → ~2.07, def 28 → ~0.98
}

/**
 * Spin-decay rate multiplier.
 * Higher stamina → smaller multiplier → slower decay.
 */
export function staMult(sta) {
  return 1.5 - (sta ?? 50) / 100;               // 1.50 (sta=0) → 0.50 (sta=100)
}
