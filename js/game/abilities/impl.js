/**
 * Bey gimmick / ability system.
 *
 * Everything about a move lives in ABILITY_REGISTRY; beys only reference ability
 * IDs (see js/game/beys.js `gimmicks`). To add a new bey or move, add a registry
 * entry and reference its ID — no engine changes required.
 *
 * Slots:
 *   power   — active, usually instant (windup 0)
 *   special — active, cinematic (windup plays a logo flash before the effect)
 *   passive — always-on, reacts to collisions via resolveContactAbilities
 *
 * charge  — seconds to fill before the move is available at match start (and
 *           after each use, cooldown applies). Stronger moves use longer charges.
 *
 * Spin is the 0..1 model stored in game state (playerSpin / aiSpin); all spin
 * changes go through addSpin (clamped). Per-body runtime flags are stamped onto
 * body.userData (steerMult, controlLocked, airborne, boosting, slamming, guarding)
 * so physics / input / contact code can read them without touching this module.
 */
import * as CANNON from 'cannon-es';
import { CONFIG } from '../../config.js';
import { setBodyCollisions } from '../../physics/top.js';
import { isAtPocketAngle } from '../../physics/arena.js';
import { clamp01 } from '../../utils/math.js';

/** Special-move logo flash and windup are 50% longer than base ability.windup values. */
export const SPECIAL_WINDUP_MULT = 1.5;
export const SPECIAL_LOGO_FLASH_DUR = 0.825;

export function effectiveSpecialWindup(baseWindup) {
  return (baseWindup || 0) * SPECIAL_WINDUP_MULT;
}

function slotWindupTotal(slot, fallback = 0) {
  if (slot.windupDuration > 0) return slot.windupDuration;
  const base = slot.ability?.windup ?? fallback;
  return base > 0 ? effectiveSpecialWindup(base) : base;
}

// ---- Star Blast tuning ------------------------------------------------------
const STAR_APEX = 38;
const STAR_DASH_DUR = 0.8;           // smoother, slower run-up to the wall
const STAR_WALL_IMPACT_DUR = 0.36;   // longer squash + recoil so it reads
const STAR_WALL_RECOIL = 1.6;        // how far it rebounds off the wall (XZ units)
const STAR_ASCEND_DUR = 0.92;        // one continuous wall-hit → apex arc (no mid-air pause)
const STAR_DIVE_DUR = 0.82;          // slower accelerating plunge
const STAR_FALL_PITCH = -Math.PI / 2;
const STAR_FALL_ROLL = Math.PI / 2;
const STAR_LAND_LIFT = 0.25;
// Big slam bounces (integrated; lower gravity = slower, floatier hops).
const STAR_BOUNCE_GRAVITY = 62;
const STAR_BOUNCE_VELOCITY = 14;
const STAR_BOUNCE_RESTITUTION = 0.48;
const STAR_BOUNCE_MIN_V = 4.2;
const STAR_BOUNCE_KNOCKBACK = 3.4;   // XZ push on each ground tap
const STAR_BOUNCE_KB_SCALE = 0.16;   // scales knockback with impact speed
const STAR_BOUNCE_OPP_MULT = 1.2;    // extra push on the foe when discs overlap
const STAR_BLAST_HIT_KNOCKBACK = 5.2; // slam connect on the opponent
const LDRAGO_LIGHTNING_HIT_KNOCKBACK = STAR_BLAST_HIT_KNOCKBACK * 0.85;
const STAR_BLAST_IMPULSE_MULT = 4.8;  // bey-vs-bey radial pop on Star Blast hit
const STAR_KB_DAMP = 10;             // decay rate; v0 = distance * damp → ~distance travel
const STAR_PHYSICS_KB_SCALE = 7;     // opponent knockback via velocity only (no position snap)
const STAR_BOUNCE_PULSE_DUR = 0.2;   // squash stretch per contact
const STAR_BOUNCE_UPRIGHT_RATE = 0.00035; // slower tilt recovery between hops
// Settle: a few little decaying hops + a slow, gentle wobble as it rebalances.
const STAR_SETTLE_DUR = 1.35;
const STAR_SETTLE_HOPS = 3;          // number of little hops
const STAR_SETTLE_HOP_HEIGHT = 0.32;
const STAR_SETTLE_WOBBLES = 3;       // gentle sways over the settle (slower = fewer)
const STAR_SETTLE_WOBBLE_AMP = 0.08; // radians, kept subtle
const STAR_BLAST_HIT_SPIN = 0.24;    // opponent spin loss on a connected slam
const STAR_BLAST_MISS_SELF = 0.05;   // self spin loss when the dive whiffs
// Star Blast camera: full stadium in frame at normal FOV, walls + a little sky above.
const STAR_BLAST_CAM_Y = 28;
const STAR_BLAST_CAM_Z = 24;
const STAR_BLAST_CAM_LOOK_Y = 1.5;
const SLAM_IMPULSE_MULT = 2.6;
const SLAM_SPIN_MULT = 2.4;
const SLAM_SELF_IMPULSE = 0.25;
const BOOST_STEER_MULT = 1.85;
const FLIGHT_LIFT = 0.12;
const LDRAGO_FLIGHT_WINDUP = 0.65;
export const LDRAGO_FLIGHT_DURATION = 3.05;
export const LDRAGO_FLIGHT_LAND_DUR = 0.28;
export const LDRAGO_FLIGHT_LAUNCH_DUR = 0.85;
export const LDRAGO_LIGHTNING_COUNT = 5;
export const LDRAGO_LIGHTNING_CHARGE_DUR = 0.85;
export const LDRAGO_LIGHTNING_STRIKE_INTERVAL = 0.17;
export const LDRAGO_LIGHTNING_RADIUS = 2.35;
export const LDRAGO_SPIN_STEAL_DURATION = 4;
const LDRAGO_FLIGHT_APEX = 15;
const LDRAGO_FLIGHT_BOB = 0.35;
const LDRAGO_FLIGHT_LAUNCH_PEAK = 0.58;
const LDRAGO_LIGHTNING_POST_DUR = 0.2;
const GUARD_IMPULSE_MULT = 3.4;
const GUARD_SPIN_MULT = 2.2;
const GUARD_SELF_IMPULSE = 0.04;
const SPIN_STEAL_KB_MULT = 0.4; // 60% knockback reduction while Spin Steal is active

// Rock Leone — Wide Ball anchor + Lion Gale Force Wall (defense-tuned, low ATK).
const LEONE_ANCHOR_KB_OUT = 0.82;  // outgoing (low ATK stat)
const LEONE_ANCHOR_DAMAGE_TAKEN = 0.2; // knockback felt while planted
const LEONE_ANCHOR_STEER = 0.68;
const LEONE_ANCHOR_DAMPING = 0.44;
const LEONE_WALL_REPULSE = 4.2;    // max radial push per tornado pulse (XZ)
const LEONE_WALL_REPULSE_SPIN = 0.0065; // opponent spin chip per strong pulse
const LEONE_WALL_SELF_SPIN = 0.012; // passive drain per second during the wall
const LEONE_WALL_PULSE = 0.12;
export const LEONE_WALL_REACH_MULT = 5.5; // reach = (rSelf + rOpp) * this — full tornado radius
const LEONE_WALL_HOVER_BASE = 2.75; // disc center height — above ground bey reach
const LEONE_WALL_HOVER_BOB = 0.2;
export const LEONE_WALL_DURATION = 5.55;  // active tornado time (3× original 1.85s)
/** Leone takes 15% less spin loss from bey-vs-bey hits and slams. */
const LEONE_SPIN_LOSS_TAKEN = 0.85;

// Flame Libra — Sonic Shield + Sonic Buster (stamina / control tuned).
const LIBRA_SHIELD_REPULSE = 3.6;
const LIBRA_SHIELD_REPULSE_SPIN = 0.0055;
const LIBRA_SHIELD_SELF_SPIN = 0.009;
const LIBRA_SHIELD_PULSE = 0.13;
const LIBRA_SHIELD_REACH_MULT = 2.75;
export const LIBRA_SHIELD_DURATION = 3.4;

export const LIBRA_BUSTER_RADIUS_MULT = 9.0;
export const LIBRA_BUSTER_DURATION = 4.8;
export const LIBRA_BUSTER_SPREAD_DUR = 3.5;
export const LIBRA_BUSTER_WINDUP_DUR = 1.55;
const LIBRA_BUSTER_SLOW_STEER = 0.36;
const LIBRA_BUSTER_DRAG = 3.1;
const LIBRA_BUSTER_SLOW_RATE = 2;
const LIBRA_BUSTER_VIBRATE_HZ = 200;
const LIBRA_BUSTER_VIBRATE_LIFT = 0.34;
const LIBRA_BUSTER_VIBRATE_XY = 0.07;
const LIBRA_BUSTER_VISUAL_SPIN = 4.5;
const LIBRA_BUSTER_QUICKSAND_PULL = CONFIG.SONIC_QUICKSAND_PULL_MULT;
const LIBRA_BUSTER_QUICKSAND_SINK = 14;
const LIBRA_BUSTER_DAMAGE_TAKEN = 0.1;

// Dark Bull — Maximum Stampede + Red Horn Uppercut (balance-tuned).
export const BULL_STAMPEDE_DURATION = 3;
const BULL_STAMPEDE_KB_OUT = 1.35;
const BULL_STAMPEDE_STEER = 1.35;
export const BULL_UPPERCUT_DURATION = 9;
export const BULL_UPPERCUT_WINDUP = 0.65;
export const BULL_DASH_BUILD_DUR = 0.55;
export const BULL_CHARGE_DUR = BULL_DASH_BUILD_DUR;
const BULL_DASH_SPEED = 19.5;
const BULL_DASH_LEAN = 0.36;
const BULL_COAST_ARRIVE = 0.45;
const BULL_RECOVER_DUR = 0.45;
const BULL_UPPERCUT_BASE_KB = 2.4;
const BULL_UPPERCUT_SPIN_MIN = 0.25;
const BULL_UPPERCUT_SPIN_MAX = 0.30;
const BULL_UPPERCUT_MISS_SELF = 0.04;
const BULL_AIR_RISE_DUR = 0.88;
const BULL_AIR_GRAVITY = 24;
const BULL_AIR_WOBBLE_AMP = 0.2;
const BULL_AIR_WOBBLE_RATE = 7.8;
export const BULL_FLIP_DUR = BULL_AIR_RISE_DUR + 1.5;

export function isBullFlipActive(body) {
  return body?.userData?.bullFlipPhase != null;
}
const BULL_UPPERCUT_SLAM_MULT = 1.2;
const BULL_UPPERCUT_LIFT = 14;

function groundY(body) {
  const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  return CONFIG.FLOOR_Y + r + CONFIG.FLOOR_EPSILON;
}

// ---- easing helpers (0..1 -> 0..1) -----------------------------------------
const easeInQuad = (t) => t * t;
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** Quicksand radius grows outward from Libra over the buster (windup + active). */
export function libraBusterSandRadius(fullReach, elapsed) {
  const spread = easeOutCubic(clamp01(elapsed / LIBRA_BUSTER_SPREAD_DUR));
  return fullReach * Math.max(0.08, spread);
}
const easeInCubic = (t) => t * t * t;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
// Damped oscillation that settles to 0 — used for the upright wobble.
const dampedWobble = (t) => Math.cos(t * Math.PI * 3.2) * Math.pow(1 - t, 2.2);

function setAirborneKinematic(body) {
  if (body.type !== CANNON.Body.KINEMATIC) {
    body.userData._prevBodyType = body.type;
    body.type = CANNON.Body.KINEMATIC;
  }
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
}

function restoreDynamicBody(body) {
  body.type = body.userData._prevBodyType ?? CANNON.Body.DYNAMIC;
  delete body.userData._prevBodyType;
  body.velocity.set(0, 0, 0);
}

function isPocketAngle(angle) {
  return isAtPocketAngle(angle, 1.15);
}

/** Nearest solid wall point along the rim (avoids KO pockets). */
function pickWallTarget(body) {
  const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const maxR = CONFIG.WALL_RADIUS - r - 0.04;
  let angle = Math.atan2(body.position.z, body.position.x);
  if (isPocketAngle(angle)) {
    let best = angle;
    let bestDist = Infinity;
    for (let i = 0; i < CONFIG.POCKET_ANGLES.length; i++) {
      const pocketStart = CONFIG.POCKET_ANGLES[i];
      const pocketEnd = CONFIG.POCKET_ANGLES[(i + 1) % CONFIG.POCKET_ANGLES.length];
      let wallStart = pocketStart + CONFIG.POCKET_HALF_WIDTH;
      let wallEnd = pocketEnd - CONFIG.POCKET_HALF_WIDTH;
      if (wallEnd < wallStart) wallEnd += Math.PI * 2;
      const mid = (wallStart + wallEnd) * 0.5;
      let delta = Math.abs(angle - mid);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      if (delta < bestDist) {
        bestDist = delta;
        best = mid;
      }
    }
    angle = best;
  }
  return {
    x: Math.cos(angle) * maxR,
    z: Math.sin(angle) * maxR,
    nx: -Math.cos(angle),
    nz: -Math.sin(angle),
  };
}

function homingXZ(body, opp, rate) {
  if (!opp) return;
  const t = Math.min(1, rate);
  body.position.x += (opp.position.x - body.position.x) * t;
  body.position.z += (opp.position.z - body.position.z) * t;
}

/** Set dash heading toward the opponent, target on the far stadium wall. */
function initBullDashTarget(body, opp) {
  const fromX = body.userData.bullChargeFromX ?? body.position.x;
  const fromZ = body.userData.bullChargeFromZ ?? body.position.z;
  let nx = (opp?.position.x ?? body.position.x) - fromX;
  let nz = (opp?.position.z ?? body.position.z) - fromZ;
  const d = Math.hypot(nx, nz);
  if (d < 0.05) {
    const yaw = Math.atan2(body.position.z, body.position.x);
    nx = Math.cos(yaw);
    nz = Math.sin(yaw);
  } else {
    nx /= d;
    nz /= d;
  }
  body.userData.bullCoastNx = nx;
  body.userData.bullCoastNz = nz;

  const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const maxR = CONFIG.WALL_RADIUS - r - 0.04;
  const angle = Math.atan2(nz, nx);
  body.userData.bullCoastTargetX = Math.cos(angle) * maxR;
  body.userData.bullCoastTargetZ = Math.sin(angle) * maxR;
  body.userData.bullCoastDist = Math.hypot(
    body.userData.bullCoastTargetX - body.position.x,
    body.userData.bullCoastTargetZ - body.position.z
  );
}

/** Constant-speed dash; returns true once the far wall is reached. */
function stepBullDash(state, side, body, opp, dt) {
  if (body.userData.bullCoastTargetX == null) initBullDashTarget(body, opp);

  const tx = body.userData.bullCoastTargetX;
  const tz = body.userData.bullCoastTargetZ;
  const dx = tx - body.position.x;
  const dz = tz - body.position.z;
  const remain = Math.hypot(dx, dz);

  body.userData.bullUpperPhaseT = (body.userData.bullUpperPhaseT ?? 0) + dt;
  body.userData.bullUpperSlamming = true;
  body.position.y = groundY(body);

  if (remain < BULL_COAST_ARRIVE) {
    body.position.x = tx;
    body.position.z = tz;
    return true;
  }

  const move = Math.min(BULL_DASH_SPEED * dt, remain);
  body.position.x += (dx / remain) * move;
  body.position.z += (dz / remain) * move;

  if (opp && bullUppercutOverlap(body, opp) && !bullUppercutVictimImmune(state, body, opp)) {
    applyBullUppercutHit(state, side, body, opp);
  }

  return false;
}

function stepBullUppercutDash(state, dt) {
  for (const side of ['player', 'ai']) {
    const spSlot = state.abilities?.[side]?.special;
    if (!spSlot?.active || spSlot.ability.id !== 'bull_red_horn_uppercut') continue;
    const body = side === 'player' ? state.playerBody : state.aiBody;
    const opp = side === 'player' ? state.aiBody : state.playerBody;
    if (!body || body.userData.bullUpperPhase !== 'dash') continue;
    if (stepBullDash(state, side, body, opp, dt)) {
      body.userData.bullDashDone = true;
    }
  }
}

/** Cinematic knockback for Pegasus (velocity zeroed each frame during Star Blast). */
function addStarKnockback(body, nx, nz, distance) {
  if (!body || distance <= 0) return;
  const speed = distance * STAR_KB_DAMP;
  body.userData.starKnockbackVX = (body.userData.starKnockbackVX ?? 0) + nx * speed;
  body.userData.starKnockbackVZ = (body.userData.starKnockbackVZ ?? 0) + nz * speed;
}

function integrateStarKnockback(body, dt) {
  if (!body) return;
  let vx = body.userData.starKnockbackVX ?? 0;
  let vz = body.userData.starKnockbackVZ ?? 0;
  if (Math.abs(vx) < 0.02 && Math.abs(vz) < 0.02) {
    delete body.userData.starKnockbackVX;
    delete body.userData.starKnockbackVZ;
    return;
  }
  body.position.x += vx * dt;
  body.position.z += vz * dt;
  const decay = Math.exp(-STAR_KB_DAMP * dt);
  body.userData.starKnockbackVX = vx * decay;
  body.userData.starKnockbackVZ = vz * decay;
}

/** Smooth knockback for the opponent — physics velocity only, never a position snap. */
function applyPhysicsKnockback(body, nx, nz, distance) {
  if (!body || distance <= 0) return;
  const speed = distance * STAR_PHYSICS_KB_SCALE;
  body.velocity.x += nx * speed;
  body.velocity.z += nz * speed;
}

function pickLightningSpots(count) {
  const spots = [];
  const maxR = CONFIG.WALL_RADIUS - 2.8;
  const minDist = LDRAGO_LIGHTNING_RADIUS * 2.1;
  let attempts = 0;
  while (spots.length < count && attempts < 100) {
    attempts += 1;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * maxR * 0.88;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const tooClose = spots.some((s) => {
      const dx = s.x - x;
      const dz = s.z - z;
      return dx * dx + dz * dz < minDist * minDist;
    });
    if (tooClose) continue;
    spots.push({ x, z, flashT: 0 });
  }
  while (spots.length < count) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * maxR * 0.88;
    spots.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r, flashT: 0 });
  }
  return spots;
}

function isInLightningZone(body, spot, radius) {
  const dx = body.position.x - spot.x;
  const dz = body.position.z - spot.z;
  return dx * dx + dz * dz <= radius * radius;
}

function applyLightningStrike(state, casterBody, spot) {
  spot.flashT = 1;
  for (const side of ['player', 'ai']) {
    const body = side === 'player' ? state.playerBody : state.aiBody;
    if (!body || body === casterBody || body.userData.ringOut) continue;
    if (body.userData.invulnerable) continue;
    if (!isInLightningZone(body, spot, LDRAGO_LIGHTNING_RADIUS)) continue;

    const k = spinKey(side);
    state[k] = Math.max(0, state[k] - STAR_BLAST_HIT_SPIN);

    let dx = body.position.x - spot.x;
    let dz = body.position.z - spot.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    applyPhysicsKnockback(body, dx, dz, LDRAGO_LIGHTNING_HIT_KNOCKBACK);
  }
}

function tickLdragoSupremeFlightLightning(state, body, dt) {
  const ft = body.userData.ldragoFlightT ?? 0;
  const chargeStart = LDRAGO_FLIGHT_LAUNCH_DUR;
  const strikeStart = chargeStart + LDRAGO_LIGHTNING_CHARGE_DUR;

  if (ft >= chargeStart && !body.userData.ldragoLightningSpots) {
    body.userData.ldragoLightningSpots = pickLightningSpots(LDRAGO_LIGHTNING_COUNT);
    body.userData.ldragoLightningFired = 0;
  }

  const spots = body.userData.ldragoLightningSpots;
  if (spots) {
    for (const spot of spots) {
      if (spot.flashT > 0) {
        spot.flashT = Math.max(0, spot.flashT - dt * 2.6);
      }
    }
  }

  if (!spots || ft < strikeStart) return;

  const strikeIdx = Math.floor((ft - strikeStart) / LDRAGO_LIGHTNING_STRIKE_INTERVAL);
  let fired = body.userData.ldragoLightningFired ?? 0;
  while (fired <= strikeIdx && fired < LDRAGO_LIGHTNING_COUNT) {
    applyLightningStrike(state, body, spots[fired]);
    fired += 1;
  }
  body.userData.ldragoLightningFired = fired;
}

function applyStarBounceKnockback(body, opp, contactSpeed) {
  const kb = Math.min(STAR_BOUNCE_KNOCKBACK, contactSpeed * STAR_BOUNCE_KB_SCALE);
  if (kb <= 0) return;

  if (!opp) {
    const d = Math.hypot(body.position.x, body.position.z) || 1;
    addStarKnockback(body, body.position.x / d, body.position.z / d, kb * 0.55);
    return;
  }

  let dx = body.position.x - opp.position.x;
  let dz = body.position.z - opp.position.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d;
  const nz = dz / d;
  addStarKnockback(body, nx, nz, kb);

  const overlapping = starBlastOverlap(body, opp);
  const oppKb = overlapping ? kb * STAR_BOUNCE_OPP_MULT : kb * 0.45;
  applyPhysicsKnockback(opp, -nx, -nz, oppKb);
}

function applyStarBlastHitKnockback(body, opp, strength = STAR_BLAST_HIT_KNOCKBACK) {
  if (!body || !opp || strength <= 0) return;
  let dx = opp.position.x - body.position.x;
  let dz = opp.position.z - body.position.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d;
  const nz = dz / d;
  applyPhysicsKnockback(opp, nx, nz, strength);
  addStarKnockback(body, -nx, -nz, strength * 0.3);
}

function starBlastOverlap(body, opp) {
  if (!body || !opp) return false;
  const dx = body.position.x - opp.position.x;
  const dz = body.position.z - opp.position.z;
  const rA = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const rB = opp.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const reach = rA + rB;
  return dx * dx + dz * dz <= reach * reach;
}

function markStarBlastHit(state, attackerSide, body, opp) {
  if (!body || body.userData.starBlastHit) return;
  if (opp?.userData?.invulnerable) return;
  body.userData.starBlastHit = true;
  const oppSide = attackerSide === 'player' ? 'ai' : 'player';
  const k = spinKey(oppSide);
  state[k] = Math.max(0, state[k] - STAR_BLAST_HIT_SPIN);
  applyStarBlastHitKnockback(body, opp);
}

function resolveStarBlastOutcome(state, side, body) {
  if (!body || body.userData.starBlastResolved) return;
  body.userData.starBlastResolved = true;
  if (!body.userData.starBlastHit) {
    const k = spinKey(side);
    state[k] = Math.max(0, state[k] - STAR_BLAST_MISS_SELF);
  }
}

function initStarBlast(body) {
  const wall = pickWallTarget(body);
  body.userData.starWallX = wall.x;
  body.userData.starWallZ = wall.z;
  body.userData.starWallNx = wall.nx;
  body.userData.starWallNz = wall.nz;
  body.userData.starPhase = 'windup';
  body.userData.starPhaseT = 0;
  body.userData.starImpactFlash = false;
  body.userData.starBlastHit = false;
  delete body.userData.starBlastResolved;
  setBodyCollisions(body, false);
}

function finishStarBlast(state, side, slot, body, dt) {
  if (!body || (!slot.active && body.userData.starPhase == null)) return;
  resolveStarBlastOutcome(state, side, body);
  slot.active = false;
  slot.activeRemaining = 0;
  slot.windupRemaining = 0;
  if (slot.ability.onEnd) slot.ability.onEnd(makeCtx(state, side, dt));
}

/** Restores player/AI steering and dynamic physics after Star Blast (or on reset). */
function releaseStarBlastControl(body) {
  if (!body) return;
  body.userData.controlLocked = false;
  body.userData.airborne = false;
  clearStarBlastMotion(body);
  delete body.userData.starPhase;
  delete body.userData.starPhaseT;
  delete body.userData.starImpactFlash;
  delete body.userData.starWallX;
  delete body.userData.starWallZ;
  delete body.userData.starWallNx;
  delete body.userData.starWallNz;
  setBodyCollisions(body, true);
  if (body.type === CANNON.Body.KINEMATIC) {
    restoreDynamicBody(body);
  }
  body.position.y = groundY(body);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
}

function clearStarBlastMotion(body) {
  body.userData.flightLift = 0;
  body.userData.flightTilt = 0;
  body.userData.flightRoll = 0;
  body.userData.flightSquash = 1;
  body.userData.slamming = false;
  body.userData.starImpactFlash = false;
  body.userData.starVY = 0;
  delete body.userData.starBlastHit;
  delete body.userData.starBlastResolved;
  delete body.userData.starBouncePulseT;
  delete body.userData.starImpactX;
  delete body.userData.starImpactZ;
  delete body.userData.starDashFromX;
  delete body.userData.starDashFromZ;
  delete body.userData.starSettleTilt;
  delete body.userData.starSettleRoll;
  delete body.userData.starKnockbackVX;
  delete body.userData.starKnockbackVZ;
}

function clearSonicSlow(body) {
  if (!body) return;
  if (body.userData._sonicSlowBaseSteer != null) {
    body.userData.steerMult = body.userData._sonicSlowBaseSteer;
    delete body.userData._sonicSlowBaseSteer;
  }
  delete body.userData.sonicSlow;
  delete body.userData.sonicPull;
}

function clearLibraSandBoost(body) {
  if (!body) return;
  if (body.userData._sonicSandBaseSteer != null) {
    body.userData.steerMult = body.userData._sonicSandBaseSteer;
    delete body.userData._sonicSandBaseSteer;
  }
  delete body.userData.sonicSandBoost;
}

function clearLibraBusterVibrate(body) {
  if (!body) return;
  delete body.userData.sonicBusterVibrateT;
  delete body.userData.sonicBusterVisualSpinMult;
  delete body.userData.sonicBusterFromX;
  delete body.userData.sonicBusterFromZ;
  delete body.userData.flightOffsetX;
  delete body.userData.flightOffsetZ;
}

function bullUppercutKbScale(victim) {
  const dist = Math.hypot(victim.position.x, victim.position.z);
  const t = clamp01(dist / (CONFIG.ARENA_RADIUS * 0.92));
  return 0.42 + t * 0.83;
}

function bullUppercutSpinLoss(victim) {
  const dist = Math.hypot(victim.position.x, victim.position.z);
  const t = clamp01(dist / (CONFIG.ARENA_RADIUS * 0.92));
  return BULL_UPPERCUT_SPIN_MIN + t * (BULL_UPPERCUT_SPIN_MAX - BULL_UPPERCUT_SPIN_MIN);
}

function bullUppercutOverlap(body, opp) {
  if (!body || !opp) return false;
  const dx = body.position.x - opp.position.x;
  const dz = body.position.z - opp.position.z;
  const rA = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const rB = opp.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const reach = rA + rB;
  return dx * dx + dz * dz <= reach * reach;
}

/** Leone's wall / guards and vertical separation block Bull's ground dash uppercut. */
function readContactLift(body) {
  if (!body) return 0;
  if (body.userData.contactLift != null) return body.userData.contactLift;
  return body.userData.flightLift ?? 0;
}

function leoneWallContactLift(state, body) {
  if (!body?.userData?.lionWall && !body?.userData?.lionWallWindup) {
    return readContactLift(body);
  }
  const side = body.userData.side;
  const slot = side && state.abilities?.[side]?.special;
  if (!slot || slot.ability.id !== 'leone_lion_wall') return readContactLift(body);
  if (slot.windupRemaining > 0) {
    const windup = slotWindupTotal(slot, 0.45);
    const t = clamp01(1 - slot.windupRemaining / windup);
    return LEONE_WALL_HOVER_BASE * easeOutQuad(t);
  }
  if (slot.active) {
    const wt = body.userData.lionWallT ?? 0;
    return LEONE_WALL_HOVER_BASE + Math.sin(wt * 4.2) * LEONE_WALL_HOVER_BOB;
  }
  return readContactLift(body);
}

function bullUppercutVictimImmune(state, attacker, victim) {
  if (!victim) return true;
  if (victim.userData.invulnerable) return true;
  if (victim.userData.bullFlipPhase) return true;
  if (victim.userData.lionWall || victim.userData.lionWallWindup || victim.userData.guarding) {
    return true;
  }

  const victimLift = leoneWallContactLift(state, victim);
  const attackerLift = readContactLift(attacker);
  const rA = attacker.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const rB = victim.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const reach = (rA + rB) * 0.78;
  return Math.abs(victimLift - attackerLift) > reach;
}

function applyBullUppercutHit(state, attackerSide, attacker, victim) {
  if (!attacker || !victim || bullUppercutVictimImmune(state, attacker, victim)) return;
  if (!attacker.userData.bullUpperHit) attacker.userData.bullUpperHit = true;

  let dx = victim.position.x - attacker.position.x;
  let dz = victim.position.z - attacker.position.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d;
  const nz = dz / d;
  const kb = BULL_UPPERCUT_BASE_KB * bullUppercutKbScale(victim);

  const oppSide = attackerSide === 'player' ? 'ai' : 'player';
  const k = spinKey(oppSide);
  state[k] = Math.max(0, state[k] - bullUppercutSpinLoss(victim));

  const posScale = bullUppercutKbScale(victim);

  victim.userData.bullFlipFromX = victim.position.x;
  victim.userData.bullFlipFromZ = victim.position.z;
  victim.userData.bullFlipKbNx = nx;
  victim.userData.bullFlipKbNz = nz;
  victim.userData.bullFlipKbMag = kb;
  victim.userData.bullFlipPhase = 'air';
  victim.userData.bullFlipPhaseT = 0;
  victim.userData.bullFlipElapsed = 0;
  delete victim.userData.bullFlipFalling;
  delete victim.userData.bullFlipVY;
  delete victim.userData.bullFlipWobbleT;
  victim.userData.bullFlipPeakLift = BULL_UPPERCUT_LIFT * posScale;
  victim.userData.flightTilt = 0;
  victim.userData.flightRoll = 0;
  victim.userData.flightLift = 0;
  victim.userData.flightSquash = 1.04;
  victim.userData.airborne = true;
  victim.userData.controlLocked = true;
  victim.userData.bullFlipBurstT = 1;
  setBodyCollisions(victim, false);
  setAirborneKinematic(victim);
  victim.velocity.set(0, 0, 0);
  victim.angularVelocity.set(0, 0, 0);

  attacker.userData.bullImpactFlash = true;
  attacker.userData.bullImpactX = (attacker.position.x + victim.position.x) * 0.5;
  attacker.userData.bullImpactZ = (attacker.position.z + victim.position.z) * 0.5;
}

function resolveBullUppercutOutcome(state, side, body) {
  if (!body || body.userData.bullUpperResolved) return;
  body.userData.bullUpperResolved = true;
  if (!body.userData.bullUpperHit) {
    const k = spinKey(side);
    state[k] = Math.max(0, state[k] - BULL_UPPERCUT_MISS_SELF);
  }
}

function initBullUppercut(body) {
  body.userData.bullUpperPhase = 'windup';
  body.userData.bullUpperPhaseT = 0;
  body.userData.bullUpperHit = false;
  body.userData.bullImpactFlash = false;
  delete body.userData.bullUpperResolved;
  setBodyCollisions(body, false);
}

function clearBullUppercutMotion(body) {
  body.userData.flightLift = 0;
  body.userData.flightTilt = 0;
  body.userData.flightRoll = 0;
  body.userData.flightSquash = 1;
  body.userData.bullUpperSlamming = false;
  body.userData.bullImpactFlash = false;
  delete body.userData.bullUpperPhase;
  delete body.userData.bullUpperPhaseT;
  delete body.userData.bullUpperHit;
  delete body.userData.bullUpperResolved;
  delete body.userData.bullChargeFromX;
  delete body.userData.bullChargeFromZ;
  delete body.userData.bullImpactX;
  delete body.userData.bullImpactZ;
  delete body.userData.bullImpactResolved;
  delete body.userData.bullImpactFromTilt;
  delete body.userData.bullImpactFromSquash;
  delete body.userData.bullRecoverFromTilt;
  delete body.userData.bullRecoverFromSquash;
  delete body.userData.bullCoastNx;
  delete body.userData.bullCoastNz;
  delete body.userData.bullCoastTargetX;
  delete body.userData.bullCoastTargetZ;
  delete body.userData.bullCoastDist;
  delete body.userData.bullDashDone;
  delete body.userData.bullWindupEndTilt;
}

function releaseBullUppercutControl(body) {
  if (!body) return;
  body.userData.controlLocked = false;
  body.userData.airborne = false;
  clearBullUppercutMotion(body);
  setBodyCollisions(body, true);
  if (body.type === CANNON.Body.KINEMATIC) {
    restoreDynamicBody(body);
  }
  body.position.y = groundY(body);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
}

function finishBullUppercut(state, side, slot, body, dt) {
  if (!body || (!slot.active && body.userData.bullUpperPhase == null)) return;
  resolveBullUppercutOutcome(state, side, body);
  slot.active = false;
  slot.activeRemaining = 0;
  slot.windupRemaining = 0;
  if (slot.ability.onEnd) slot.ability.onEnd(makeCtx(state, side, dt));
}

function clearBullFlipCinematic(body) {
  if (!body) return;
  delete body.userData.bullFlipPhase;
  delete body.userData.bullFlipPhaseT;
  delete body.userData.bullFlipFalling;
  delete body.userData.bullFlipVY;
  delete body.userData.bullFlipWobbleT;
  delete body.userData.bullFlipPeakLift;
  delete body.userData.bullFlipFromX;
  delete body.userData.bullFlipFromZ;
  delete body.userData.bullFlipKbNx;
  delete body.userData.bullFlipKbNz;
  delete body.userData.bullFlipKbMag;
  delete body.userData.bullFlipElapsed;
  delete body.userData.bullUppercutFlipT;
  delete body.userData.bullFlipBurstT;
  body.userData.airborne = false;
}

function releaseBullFlipVictim(body, applyKb = true) {
  if (!body) return;
  if (applyKb && (body.userData.bullFlipKbMag ?? 0) > 0) {
    applyPhysicsKnockback(
      body,
      body.userData.bullFlipKbNx ?? 0,
      body.userData.bullFlipKbNz ?? 0,
      body.userData.bullFlipKbMag * 0.2
    );
  }
  body.userData.controlLocked = false;
  body.userData.airborne = false;
  body.userData.flightLift = 0;
  body.userData.flightTilt = 0;
  body.userData.flightRoll = 0;
  body.userData.flightSquash = 1;
  clearBullFlipCinematic(body);
  setBodyCollisions(body, true);
  if (body.type === CANNON.Body.KINEMATIC) restoreDynamicBody(body);
  body.position.y = groundY(body);
}

function pinBullFlipPhysics(body) {
  if (!body?.userData?.bullFlipPhase) return;
  if (body.type !== CANNON.Body.KINEMATIC) setAirborneKinematic(body);
  setBodyCollisions(body, false);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.position.y = groundY(body);
}

function tickBullFlipDecay(body, dt) {
  if (body.userData.bullFlipBurstT != null) {
    body.userData.bullFlipBurstT -= dt * 5;
    if (body.userData.bullFlipBurstT <= 0) delete body.userData.bullFlipBurstT;
  }

  if (!body.userData.bullFlipPhase) return;

  pinBullFlipPhysics(body);
  body.userData.airborne = true;
  body.userData.controlLocked = true;
  body.userData.bullFlipElapsed = (body.userData.bullFlipElapsed ?? 0) + dt;
  body.userData.bullFlipPhaseT = (body.userData.bullFlipPhaseT ?? 0) + dt;

  const peakLift = body.userData.bullFlipPeakLift ?? BULL_UPPERCUT_LIFT;

  if (!body.userData.bullFlipFalling) {
    const t = clamp01(body.userData.bullFlipPhaseT / BULL_AIR_RISE_DUR);
    const e = easeOutCubic(t);
    body.userData.flightLift = peakLift * Math.sin(e * Math.PI * 0.5);
    if (t >= 1) body.userData.bullFlipFalling = true;
  } else {
    let vy = body.userData.bullFlipVY ?? 0;
    vy -= BULL_AIR_GRAVITY * dt;
    let lift = (body.userData.flightLift ?? 0) + vy * dt;
    if (lift <= 0) {
      body.userData.flightLift = 0;
      body.userData.flightTilt = 0;
      body.userData.flightRoll = 0;
      body.userData.flightSquash = 1;
      releaseBullFlipVictim(body, true);
      return;
    }
    body.userData.bullFlipVY = vy;
    body.userData.flightLift = lift;
  }

  const lift = body.userData.flightLift ?? 0;
  const airFrac = clamp01(lift / Math.max(peakLift * 0.22, 0.5));
  const wobbleT = (body.userData.bullFlipWobbleT ?? 0) + dt;
  body.userData.bullFlipWobbleT = wobbleT;
  const amp = BULL_AIR_WOBBLE_AMP * airFrac;
  const wobbleWave = Math.sin(wobbleT * BULL_AIR_WOBBLE_RATE);
  const wobbleWave2 = Math.sin(wobbleT * BULL_AIR_WOBBLE_RATE * 0.83 + 0.6);
  body.userData.flightTilt = amp * wobbleWave;
  body.userData.flightRoll = amp * wobbleWave2;
  body.userData.flightSquash = 1 + 0.03 * airFrac * Math.sin(wobbleT * BULL_AIR_WOBBLE_RATE * 1.6);

  const kb = body.userData.bullFlipKbMag ?? 0;
  if (kb > 0) {
    const p = easeOutQuad(clamp01(body.userData.bullFlipElapsed / BULL_FLIP_DUR));
    const fromX = body.userData.bullFlipFromX ?? body.position.x;
    const fromZ = body.userData.bullFlipFromZ ?? body.position.z;
    const dist = kb * 0.32;
    body.position.x = fromX + (body.userData.bullFlipKbNx ?? 0) * dist * p;
    body.position.z = fromZ + (body.userData.bullFlipKbNz ?? 0) * dist * p;
  }
}

function isLibraBusterChannelingBody(state, body) {
  if (!body) return false;
  if (body.userData.sonicBuster || body.userData.sonicBusterWindup) return true;
  for (const side of ['player', 'ai']) {
    if ((side === 'player' ? state.playerBody : state.aiBody) !== body) continue;
    const slot = state.abilities?.[side]?.special;
    if (slot?.ability?.id !== 'libra_sonic_buster') return false;
    return slot.windupRemaining > 0 || slot.active;
  }
  return false;
}

/** Pins Libra at stadium center while Sonic Buster windup/active (physics rate). */
function stepLibraBusterChannel(state, dt) {
  for (const side of ['player', 'ai']) {
    const body = side === 'player' ? state.playerBody : state.aiBody;
    if (!isLibraBusterChannelingBody(state, body)) continue;

    const slot = state.abilities[side].special;
    const windup = slotWindupTotal(slot, LIBRA_BUSTER_WINDUP_DUR);
    let t = 1;
    if (slot.windupRemaining > 0) {
      t = easeOutCubic(1 - slot.windupRemaining / windup);
    }
    const fx = body.userData.sonicBusterFromX ?? body.position.x;
    const fz = body.userData.sonicBusterFromZ ?? body.position.z;
    body.position.x = fx + (0 - fx) * t;
    body.position.z = fz + (0 - fz) * t;
    body.velocity.set(0, 0, 0);
    body.userData.sonicBusterX = 0;
    body.userData.sonicBusterZ = 0;
  }
}

// ---- registry ---------------------------------------------------------------
export const ABILITY_REGISTRY = {
  pegasus_speed_boost: {
    id: 'pegasus_speed_boost',
    name: 'Speed Boost',
    slot: 'power',
    icon: '»',
    desc: 'Temporary burst of speed and grip.',
    charge: 5,
    cooldown: 8,
    duration: 3,
    windup: 0,
    glow: '#60a5fa',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.steerMult = BOOST_STEER_MULT;
      b.userData.boosting = true;
      b.userData.boostT = 0;
      b.userData.prevDamping = b.linearDamping;
      b.linearDamping = Math.max(0.05, b.linearDamping * 0.5);
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.steerMult = 1;
      b.userData.boosting = false;
      delete b.userData.boostT;
      if (b.userData.prevDamping != null) b.linearDamping = b.userData.prevDamping;
    },
  },

  pegasus_star_blast: {
    id: 'pegasus_star_blast',
    name: 'Star Blast Attack',
    slot: 'special',
    icon: '\u2605',
    desc: 'Slams the wall, dives on the foe for heavy spin damage; whiffs cost ~5% spin.',
    charge: 11,
    cooldown: 12,
    duration: 6,
    windup: 0.5,
    glow: '#60a5fa',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.airborne = true;
      b.userData.controlLocked = true;
      b.userData.slamming = false;
      b.userData.flightTilt = 0;
      b.userData.flightRoll = 0;
      b.userData.starPhase = 'dash';
      b.userData.starPhaseT = 0;
      setAirborneKinematic(b);
      setBodyCollisions(b, false);
    },
    onEnd(ctx) {
      releaseStarBlastControl(ctx.body);
    },
  },

  ldrago_supreme_flight: {
    id: 'ldrago_supreme_flight',
    name: 'Dragon Emperor Supreme Flight',
    slot: 'special',
    icon: '\u2726',
    desc: 'Rises and calls down five lightning strikes; foes caught take Star Blast-level spin damage and heavy knockback.',
    charge: 12,
    cooldown: 14,
    duration: 3.05,
    windup: 0.65,
    glow: '#f87171',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.airborne = true;
      b.userData.guarding = true;
      b.userData.invulnerable = true;
      b.userData.controlLocked = true;
      b.userData.ldragoFlightWindup = false;
      b.userData.ldragoFlightT = 0;
      b.userData.ldragoFlightLaunchT = 1;
      b.userData.guardX = b.position.x;
      b.userData.guardZ = b.position.z;
      setAirborneKinematic(b);
    },
    onStep(ctx) {
      const b = ctx.body;
      b.userData.ldragoFlightT = (b.userData.ldragoFlightT ?? 0) + ctx.dt;
      tickLdragoSupremeFlightLightning(ctx.state, b, ctx.dt);
      b.position.y = groundY(b);
      const xzLerp = 1 - Math.exp(-12 * ctx.dt);
      b.position.x += ((b.userData.guardX ?? b.position.x) - b.position.x) * xzLerp;
      b.position.z += ((b.userData.guardZ ?? b.position.z) - b.position.z) * xzLerp;
      b.velocity.set(0, 0, 0);
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.airborne = false;
      b.userData.guarding = false;
      b.userData.invulnerable = false;
      b.userData.controlLocked = false;
      b.userData.ldragoFlightWindup = false;
      b.userData.flightLift = 0;
      b.userData.flightTilt = 0;
      b.userData.flightRoll = 0;
      b.userData.flightSquash = 1;
      delete b.userData.ldragoFlightT;
      delete b.userData.ldragoFlightLaunchT;
      delete b.userData.flightRepulseT;
      delete b.userData.ldragoLightningSpots;
      delete b.userData.ldragoLightningFired;
      delete b.userData.ldragoLightningCharging;
      delete b.userData.ldragoFlightRerising;
      b.position.y = groundY(b);
      restoreDynamicBody(b);
    },
  },

  ldrago_spin_steal: {
    id: 'ldrago_spin_steal',
    name: 'Spin Steal',
    slot: 'power',
    icon: '\u21BB',
    desc: 'While active, steal opponent spin, take no spin loss, and cut collision knockback by 60%.',
    charge: 7.5,
    cooldown: 10,
    duration: 4,
    windup: 0,
    glow: '#f87171',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.spinStealing = true;
      b.userData.spinStealT = 0;
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.spinStealing = false;
      delete b.userData.spinStealT;
      delete b.userData.spinStealBurstT;
      delete b.userData.spinStealFromX;
      delete b.userData.spinStealFromZ;
    },
  },

  leone_wide_ball: {
    id: 'leone_wide_ball',
    name: 'Wide Ball Anchor',
    slot: 'power',
    icon: '\u25C9',
    desc: 'WB tip digs in — takes only 20% collision knockback and no spin loss from hits.',
    charge: 6,
    cooldown: 9,
    duration: 2.6,
    windup: 0,
    glow: '#4ade80',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.anchoring = true;
      b.userData.steerMult = LEONE_ANCHOR_STEER;
      b.userData.prevDamping = b.linearDamping;
      b.linearDamping = LEONE_ANCHOR_DAMPING;
      b.userData.leoneAnchorT = 0;
    },
    onStep(ctx) {
      const b = ctx.body;
      // Cap drift so planted grip still reads, but 20% knockback can show through.
      const speed = Math.hypot(b.velocity.x, b.velocity.z);
      const maxSpeed = 4.2 * LEONE_ANCHOR_DAMAGE_TAKEN;
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        b.velocity.x *= scale;
        b.velocity.z *= scale;
      }
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.anchoring = false;
      b.userData.steerMult = 1;
      if (b.userData.prevDamping != null) b.linearDamping = b.userData.prevDamping;
      b.userData.flightSquash = 1;
      b.userData.flightTilt = 0;
      b.userData.flightRoll = 0;
      delete b.userData.leoneAnchorT;
    },
  },

  leone_lion_wall: {
    id: 'leone_lion_wall',
    name: 'Lion Gale Force Wall',
    slot: 'special',
    icon: '\u25CE',
    desc: 'Spins up a green tornado wall that repels rivals and shrugs off spin loss; costs a little stamina.',
    charge: 9,
    cooldown: 12,
    duration: LEONE_WALL_DURATION,
    windup: 0.45,
    glow: '#22c55e',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.guarding = true;
      b.userData.lionWall = true;
      b.userData.lionWallWindup = false;
      b.userData.airborne = true;
      b.userData.lionWallPulse = 0;
      b.userData.lionWallT = 0;
      b.userData.lionWallReach =
        (b.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS) * LEONE_WALL_REACH_MULT;
      b.userData.controlLocked = true;
      b.userData.prevDamping = b.linearDamping;
      b.linearDamping = Math.max(0.38, b.linearDamping * 1.35);
    },
    onStep(ctx) {
      const b = ctx.body;
      const opp = ctx.opponentBody;
      b.userData.lionWallPulse = (b.userData.lionWallPulse ?? 0) + ctx.dt;
      ctx.addSpin(-LEONE_WALL_SELF_SPIN * ctx.dt, ctx.side);

      if (!opp) return;

      const rA = b.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const rB = opp.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const dx = opp.position.x - b.position.x;
      const dz = opp.position.z - b.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const reach = (rA + rB) * LEONE_WALL_REACH_MULT;
      b.userData.lionWallReach = reach;
      if (dist >= reach) return;

      const nx = dx / dist;
      const nz = dz / dist;
      const falloff = 1 - dist / reach;

      // Continuous gale push — ground beys are shoved even though vertical contact is blocked.
      const push = LEONE_WALL_REPULSE * falloff * (ctx.dt / LEONE_WALL_PULSE);
      opp.velocity.x += nx * push;
      opp.velocity.z += nz * push;

      // Positional separation under the hover disc (replaces contact overlap correction).
      const minDist = rA + rB;
      if (dist < minDist) {
        const overlap = minDist - dist;
        opp.position.x += nx * overlap;
        opp.position.z += nz * overlap;
      }

      if (b.userData.lionWallPulse < LEONE_WALL_PULSE) return;
      b.userData.lionWallPulse = 0;

      if (falloff > 0.25) {
        ctx.addSpin(-LEONE_WALL_REPULSE_SPIN * falloff, ctx.oppSide);
        b.userData.lionWallBurstT = falloff;
      }
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.guarding = false;
      b.userData.lionWall = false;
      b.userData.lionWallWindup = false;
      b.userData.controlLocked = false;
      delete b.userData.lionWallPulse;
      delete b.userData.lionWallT;
      delete b.userData.lionWallBurstT;
      delete b.userData.lionWallReach;
      b.userData.flightSquash = 1;
      b.userData.flightTilt = 0;
      b.userData.flightRoll = 0;
      b.userData.flightLift = 0;
      b.userData.airborne = false;
      delete b.userData.contactLift;
      if (b.userData.prevDamping != null) b.linearDamping = b.userData.prevDamping;
    },
  },

  libra_sonic_shield: {
    id: 'libra_sonic_shield',
    name: 'Sonic Shield',
    slot: 'power',
    icon: '\u25CE',
    desc: 'Green aura deflects rivals and their attacks away from Libra.',
    charge: 6.5,
    cooldown: 9,
    duration: LIBRA_SHIELD_DURATION,
    windup: 0,
    glow: '#4ade80',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.guarding = true;
      b.userData.sonicShield = true;
      b.userData.sonicShieldPulse = 0;
      b.userData.sonicShieldT = 0;
      b.userData.sonicShieldReach =
        (b.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS) * LIBRA_SHIELD_REACH_MULT;
    },
    onStep(ctx) {
      const b = ctx.body;
      const opp = ctx.opponentBody;
      b.userData.sonicShieldPulse = (b.userData.sonicShieldPulse ?? 0) + ctx.dt;
      ctx.addSpin(-LIBRA_SHIELD_SELF_SPIN * ctx.dt, ctx.side);

      if (!opp || b.userData.sonicShieldPulse < LIBRA_SHIELD_PULSE) return;
      b.userData.sonicShieldPulse = 0;

      const rA = b.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const rB = opp.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const dx = opp.position.x - b.position.x;
      const dz = opp.position.z - b.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const reach = (rA + rB) * LIBRA_SHIELD_REACH_MULT;
      b.userData.sonicShieldReach = reach;
      if (dist >= reach) return;

      const falloff = 1 - dist / reach;
      const push = LIBRA_SHIELD_REPULSE * falloff;
      opp.velocity.x += (dx / dist) * push;
      opp.velocity.z += (dz / dist) * push;
      if (falloff > 0.22) {
        ctx.addSpin(-LIBRA_SHIELD_REPULSE_SPIN * falloff, ctx.oppSide);
        b.userData.sonicShieldBurstT = falloff;
      }
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.guarding = false;
      b.userData.sonicShield = false;
      delete b.userData.sonicShieldPulse;
      delete b.userData.sonicShieldT;
      delete b.userData.sonicShieldBurstT;
      delete b.userData.sonicShieldReach;
      b.userData.flightSquash = 1;
      b.userData.flightTilt = 0;
      b.userData.flightRoll = 0;
    },
  },

  libra_sonic_buster: {
    id: 'libra_sonic_buster',
    name: 'Sonic Buster',
    slot: 'special',
    icon: '\u25C9',
    desc: 'Rushes to center, bounces at sonic speed, and opens quicksand that sucks rivals inward.',
    charge: 12.5,
    cooldown: 13,
    duration: LIBRA_BUSTER_DURATION,
    windup: LIBRA_BUSTER_WINDUP_DUR,
    glow: '#a3e635',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.sonicBuster = true;
      b.userData.sonicBusterWindup = false;
      b.userData.controlLocked = true;
      b.userData.sonicBusterT = 0;
      b.userData.sonicBusterX = 0;
      b.userData.sonicBusterZ = 0;
      b.position.x = 0;
      b.position.z = 0;
      b.velocity.set(0, 0, 0);
      const R = b.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      b.userData.sonicBusterReach = R * LIBRA_BUSTER_RADIUS_MULT;
    },
    onStep(ctx) {
      const b = ctx.body;
      clearSonicSlow(b);
      b.userData.sonicBusterT = (b.userData.sonicBusterT ?? 0) + ctx.dt;
      b.position.x = 0;
      b.position.z = 0;
      b.velocity.set(0, 0, 0);
      const fullReach = b.userData.sonicBusterReach ?? CONFIG.DEFAULT_OUTER_RADIUS * LIBRA_BUSTER_RADIUS_MULT;
      const elapsed = effectiveSpecialWindup(LIBRA_BUSTER_WINDUP_DUR) + (b.userData.sonicBusterT ?? 0);
      const reach = libraBusterSandRadius(fullReach, elapsed);
      b.userData.sonicBusterSpread = reach;
      const pitX = b.position.x;
      const pitZ = b.position.z;

      for (const victim of [ctx.state.playerBody, ctx.state.aiBody]) {
        if (!victim || victim === b) continue;
        const dx = victim.position.x - pitX;
        const dz = victim.position.z - pitZ;
        const dist = Math.hypot(dx, dz);
        if (dist >= reach) {
          clearSonicSlow(victim);
          continue;
        }

        const falloff = 1 - dist / reach;
        const pullFalloff = falloff * falloff;
        if (victim.userData._sonicSlowBaseSteer == null) {
          victim.userData._sonicSlowBaseSteer = victim.userData.steerMult ?? 1;
        }
        victim.userData.sonicSlow = falloff;
        victim.userData.sonicPull = pullFalloff;
        const slowAmt = (1 - LIBRA_BUSTER_SLOW_STEER) * falloff * LIBRA_BUSTER_SLOW_RATE;
        const slowFactor = Math.max(0.06, 1 - slowAmt);
        victim.userData.steerMult = victim.userData._sonicSlowBaseSteer * slowFactor;
        const drag = 1 - Math.min(
          0.9,
          LIBRA_BUSTER_DRAG * LIBRA_BUSTER_SLOW_RATE * falloff * ctx.dt
        );
        victim.velocity.x *= drag;
        victim.velocity.z *= drag;

        const sink = LIBRA_BUSTER_QUICKSAND_SINK * pullFalloff * ctx.dt;
        victim.velocity.x -= (dx / dist) * sink;
        victim.velocity.z -= (dz / dist) * sink;
      }
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.sonicBuster = false;
      b.userData.sonicBusterWindup = false;
      b.userData.controlLocked = false;
      delete b.userData.sonicBusterT;
      delete b.userData.sonicBusterX;
      delete b.userData.sonicBusterZ;
      delete b.userData.sonicBusterReach;
      delete b.userData.sonicBusterSpread;
      b.userData.flightSquash = 1;
      b.userData.flightTilt = 0;
      b.userData.flightRoll = 0;
      b.userData.flightLift = 0;
      clearLibraSandBoost(b);
      clearLibraBusterVibrate(b);
      clearSonicSlow(ctx.state.playerBody);
      clearSonicSlow(ctx.state.aiBody);
    },
  },

  bull_maximum_stampede: {
    id: 'bull_maximum_stampede',
    name: 'Maximum Stampede',
    slot: 'power',
    icon: '\u25C8',
    desc: 'Charges through rivals for a modest knockback boost on contact.',
    charge: 6.5,
    cooldown: 9,
    duration: BULL_STAMPEDE_DURATION,
    windup: 0,
    glow: '#ef4444',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.stampeding = true;
      b.userData.stampedeT = 0;
      b.userData.steerMult = BULL_STAMPEDE_STEER;
      b.userData.prevDamping = b.linearDamping;
      b.linearDamping = Math.max(0.05, b.linearDamping * 0.65);
    },
    onStep(ctx) {
      const b = ctx.body;
      if (!b.userData.stampeding) return;
      const vx = b.velocity.x;
      const vz = b.velocity.z;
      const len = Math.hypot(vx, vz);
      if (len > 0.5) {
        const bias = 1.35 * ctx.dt;
        b.velocity.x += (vx / len) * bias;
        b.velocity.z += (vz / len) * bias;
      }
    },
    onEnd(ctx) {
      const b = ctx.body;
      b.userData.stampeding = false;
      b.userData.steerMult = 1;
      delete b.userData.stampedeT;
      if (b.userData.prevDamping != null) b.linearDamping = b.userData.prevDamping;
      b.userData.flightSquash = 1;
      b.userData.flightTilt = 0;
    },
  },

  bull_red_horn_uppercut: {
    id: 'bull_red_horn_uppercut',
    name: 'Red Horn Uppercut',
    slot: 'special',
    icon: '\u25B2',
    desc: 'Lower horns, then charge. Launches foes outward; strongest near the rim.',
    charge: 10,
    cooldown: 12,
    duration: BULL_UPPERCUT_DURATION,
    windup: BULL_UPPERCUT_WINDUP,
    glow: '#dc2626',
    onActivate(ctx) {
      const b = ctx.body;
      b.userData.airborne = true;
      b.userData.controlLocked = true;
      b.userData.bullUpperPhase = 'dash';
      b.userData.bullUpperPhaseT = 0;
      b.userData.bullUpperHit = false;
      b.userData.bullImpactFlash = false;
      delete b.userData.bullImpactResolved;
      delete b.userData.bullDashDone;
      b.userData.bullChargeFromX = b.position.x;
      b.userData.bullChargeFromZ = b.position.z;
      initBullDashTarget(b, ctx.opponentBody);
      setAirborneKinematic(b);
      setBodyCollisions(b, false);
    },
    onEnd(ctx) {
      releaseBullUppercutControl(ctx.body);
    },
  },
};

// ---- runtime ----------------------------------------------------------------
function makeSlot(id) {
  const ability = id ? ABILITY_REGISTRY[id] || null : null;
  if (!ability) return null;
  const initialCharge = CONFIG.ABILITY_TEST_NO_DELAYS
    ? 0
    : (ability.charge ?? ability.cooldown ?? 0);
  return {
    ability,
    cooldownRemaining: initialCharge,
    cooldownTotal: initialCharge,
    windupRemaining: 0,
    windupDuration: 0,
    active: false,
    activeRemaining: 0,
  };
}

export function createAbilityRuntime(bey) {
  const g = bey?.gimmicks || {};
  return {
    power: makeSlot(g.power),
    special: makeSlot(g.special),
    passive: g.passive ? ABILITY_REGISTRY[g.passive] || null : null,
  };
}

function spinKey(side) {
  return side === 'player' ? 'playerSpin' : 'aiSpin';
}

function makeCtx(state, side, dt) {
  const isPlayer = side === 'player';
  const body = isPlayer ? state.playerBody : state.aiBody;
  const opponentBody = isPlayer ? state.aiBody : state.playerBody;
  return {
    state,
    side,
    oppSide: isPlayer ? 'ai' : 'player',
    body,
    opponentBody,
    dt,
    getSpin(s = side) {
      return state[spinKey(s)];
    },
    addSpin(delta, s = side) {
      if (delta < 0) {
        const b = s === 'player' ? state.playerBody : state.aiBody;
        if (b?.userData?.invulnerable) return;
      }
      const k = spinKey(s);
      state[k] = Math.max(0, Math.min(1, state[k] + delta));
    },
  };
}

function activateSlot(state, side, slot) {
  const ability = slot.ability;
  slot.windupDuration = 0;
  slot.active = true;
  slot.activeRemaining = ability.duration || 0;
  if (ability.onActivate) ability.onActivate(makeCtx(state, side, 0));
  if (slot.activeRemaining <= 0) {
    if (ability.onEnd) ability.onEnd(makeCtx(state, side, 0));
    slot.active = false;
  }
}

function applyAbilityWindupSetup(state, side, ability) {
  const body = side === 'player' ? state.playerBody : state.aiBody;
  if (!body) return;
  if (ability.id === 'pegasus_star_blast') {
    body.userData.controlLocked = true;
    initStarBlast(body);
  }
  if (ability.id === 'ldrago_supreme_flight') {
    body.userData.invulnerable = true;
    body.userData.ldragoFlightWindup = true;
  }
  if (ability.id === 'leone_lion_wall') {
    body.userData.controlLocked = true;
    body.userData.lionWallWindup = true;
    body.userData.airborne = true;
  }
  if (ability.id === 'libra_sonic_buster') {
    body.userData.controlLocked = true;
    body.userData.sonicBusterWindup = true;
    body.userData.sonicBusterFromX = body.position.x;
    body.userData.sonicBusterFromZ = body.position.z;
    body.userData.sonicBusterX = 0;
    body.userData.sonicBusterZ = 0;
    body.userData.sonicBusterVibrateT = 0;
    body.velocity.set(0, 0, 0);
  }
  if (ability.id === 'bull_red_horn_uppercut') {
    body.userData.controlLocked = true;
    initBullUppercut(body);
  }
}

/**
 * Attempts to trigger a power/special slot for a side. Returns the ability that
 * fired (so the engine can play its flash) or null if it was unavailable.
 */
export function triggerAbility(state, side, slotName) {
  const runtime = state.abilities?.[side];
  if (!runtime) return null;
  const slot = runtime[slotName];
  if (!slot) return null;
  if (state[spinKey(side)] < CONFIG.SLEEP_THRESHOLD) return null;
  const testInstant = CONFIG.ABILITY_TEST_NO_DELAYS;
  if (
    (!testInstant && slot.cooldownRemaining > 0) ||
    slot.active ||
    slot.windupRemaining > 0
  ) {
    return null;
  }

  const ability = slot.ability;
  if (testInstant) {
    slot.cooldownRemaining = 0;
    slot.cooldownTotal = ability.cooldown || 0;
  } else {
    slot.cooldownRemaining = ability.cooldown || 0;
    slot.cooldownTotal = ability.cooldown || 0;
  }
  if ((ability.windup || 0) > 0) {
    applyAbilityWindupSetup(state, side, ability);
    if (testInstant) {
      activateSlot(state, side, slot);
    } else {
      slot.windupDuration = effectiveSpecialWindup(ability.windup);
      slot.windupRemaining = slot.windupDuration;
    }
  } else {
    activateSlot(state, side, slot);
  }
  return ability;
}

/** Ends one in-progress ability slot when the bey's spin has fully stopped. */
function cancelSlotOnSpinStop(state, side, slot, dt) {
  const body = side === 'player' ? state.playerBody : state.aiBody;
  const ability = slot?.ability;
  if (!ability) return false;
  if (slot.windupRemaining <= 0 && !slot.active) return false;

  const id = ability.id;
  if (id === 'pegasus_star_blast') {
    finishStarBlast(state, side, slot, body, dt);
    return true;
  }
  if (id === 'bull_red_horn_uppercut') {
    finishBullUppercut(state, side, slot, body, dt);
    return true;
  }
  if (ability.onEnd) ability.onEnd(makeCtx(state, side, dt));
  slot.active = false;
  slot.activeRemaining = 0;
  slot.windupRemaining = 0;
  slot.windupDuration = 0;
  return true;
}

/**
 * Stops any in-progress power/special move when that bey's spin hits zero.
 * Returns which sides cancelled a special (so the logo flash can be cleared).
 */
export function cancelAbilitiesOnSpinStop(state, dt) {
  if (!state.abilities) return { player: false, ai: false };
  const cancelledSpecial = { player: false, ai: false };
  for (const side of ['player', 'ai']) {
    if (state[spinKey(side)] > CONFIG.SPIN_STOPPED) continue;
    const runtime = state.abilities[side];
    if (!runtime) continue;
    for (const slotName of ['power', 'special']) {
      const slot = runtime[slotName];
      if (!slot) continue;
      if (cancelSlotOnSpinStop(state, side, slot, dt)) {
        if (slotName === 'special') cancelledSpecial[side] = true;
      }
    }
  }
  return cancelledSpecial;
}

/** Per physics step: drive active abilities that move the body (airborne homing). */
export function stepAbilities(state, dt) {
  if (!state.abilities) return;
  tickBullFlipDecay(state.playerBody, dt);
  tickBullFlipDecay(state.aiBody, dt);
  stepBullUppercutDash(state, dt);
  stepLibraBusterChannel(state, dt);
  for (const side of ['player', 'ai']) {
    const runtime = state.abilities[side];
    if (!runtime) continue;
    for (const slotName of ['power', 'special']) {
      const slot = runtime[slotName];
      if (slot && slot.active && slot.ability.onStep) {
        slot.ability.onStep(makeCtx(state, side, dt));
      }
    }
  }
  cancelAbilitiesOnSpinStop(state, dt);
}

/** Per frame: drive cinematic visuals (runs at render rate, not physics rate). */
export function tickAbilityVisuals(state, dt) {
  if (!state.abilities) return;
  for (const side of ['player', 'ai']) {
    const slot = state.abilities[side]?.special;
    if (!slot || slot.ability.id !== 'pegasus_star_blast') continue;

    const body = side === 'player' ? state.playerBody : state.aiBody;
    const opp = side === 'player' ? state.aiBody : state.playerBody;
    if (!body) continue;

    const inMove =
      slot.windupRemaining > 0 || slot.active || body.userData.starPhase != null;
    if (!inMove) continue;

    const floor = groundY(body);
    body.position.y = floor;
    body.velocity.set(0, 0, 0);

    if (slot.windupRemaining > 0) {
      // Anticipation: crouch on the floor (no lift) while the logo flash plays.
      const windup = slotWindupTotal(slot, 0.5);
      const t = clamp01(windup > 0 ? 1 - slot.windupRemaining / windup : 1);
      body.userData.flightLift = 0;
      body.userData.flightTilt = 0.1 * easeOutQuad(t);
      body.userData.flightRoll = 0;
      body.userData.flightSquash = 1 - 0.15 * easeOutQuad(t);
      body.userData.slamming = false;
      setBodyCollisions(body, false);
      continue;
    }

    if (!slot.active) continue;

    const phase = body.userData.starPhase ?? 'dash';
    body.userData.starPhaseT = (body.userData.starPhaseT ?? 0) + dt;
    body.userData.flightSquash = body.userData.flightSquash ?? 1;

    switch (phase) {
      // 1) Accelerating dash toward the wall, leaning into the run.
      case 'dash': {
        body.userData.slamming = false;
        body.userData.flightLift = 0;
        const tx = body.userData.starWallX ?? 0;
        const tz = body.userData.starWallZ ?? 0;
        if (body.userData.starDashFromX == null) {
          body.userData.starDashFromX = body.position.x;
          body.userData.starDashFromZ = body.position.z;
        }
        const t = clamp01(body.userData.starPhaseT / STAR_DASH_DUR);
        const e = easeInQuad(t); // smooth, gradual build of speed into the wall
        body.position.x = body.userData.starDashFromX + (tx - body.userData.starDashFromX) * e;
        body.position.z = body.userData.starDashFromZ + (tz - body.userData.starDashFromZ) * e;
        body.userData.flightTilt = 0.12 + 0.34 * e; // lean forward as it speeds up
        body.userData.flightSquash = 1 + 0.1 * e; // stretch in the direction of travel
        if (t >= 1) {
          body.position.x = tx;
          body.position.z = tz;
          body.userData.starImpactX = tx;
          body.userData.starImpactZ = tz;
          body.userData.starPhase = 'ascend';
          body.userData.starPhaseT = 0;
          body.userData.starImpactFlash = true;
          delete body.userData.starDashFromX;
          delete body.userData.starDashFromZ;
        }
        setBodyCollisions(body, false);
        break;
      }

      // 2) Wall hit + continuous elevation in one arc (no plateau between kicks).
      case 'ascend': {
        body.userData.slamming = false;
        const t = clamp01(body.userData.starPhaseT / STAR_ASCEND_DUR);
        const ix = body.userData.starImpactX ?? body.position.x;
        const iz = body.userData.starImpactZ ?? body.position.z;
        const nx = body.userData.starWallNx ?? 0;
        const nz = body.userData.starWallNz ?? 0;
        const wallFrac = STAR_WALL_IMPACT_DUR / STAR_ASCEND_DUR;

        // Horizontal recoil + squash only during the opening wall-contact window.
        if (t < wallFrac) {
          const wt = clamp01(t / wallFrac);
          const recoil = easeOutBack(wt) * STAR_WALL_RECOIL;
          body.position.x = ix + nx * recoil;
          body.position.z = iz + nz * recoil;
          const compress = Math.sin(clamp01(wt / 0.4) * Math.PI * 0.5);
          const release = clamp01((wt - 0.4) / 0.6);
          body.userData.flightSquash = 1 - 0.42 * compress + 0.3 * easeOutQuad(release);
          body.userData.flightTilt = -0.7 * Math.sin(wt * Math.PI);
          body.userData.starImpactFlash = wt < 0.45;
        } else {
          body.position.x = ix + nx * STAR_WALL_RECOIL;
          body.position.z = iz + nz * STAR_WALL_RECOIL;
          body.userData.starImpactFlash = false;
          body.userData.flightSquash = 1 + 0.12 * (1 - t);
        }

        // Single smooth lift curve: starts moving up immediately off the wall,
        // eases into the apex, then hands straight off to the dive.
        body.userData.flightLift = STAR_APEX * Math.sin(t * Math.PI * 0.5);
        if (t > wallFrac) {
          body.userData.flightTilt = -0.45 * (1 - t);
        }
        body.userData.flightRoll = 0;
        homingXZ(body, opp, Math.min(1, (3 + 5 * t) * dt));

        if (t >= 1) {
          body.userData.starPhase = 'dive';
          body.userData.starPhaseT = 0;
        }
        setBodyCollisions(body, false);
        break;
      }

      // 3) Accelerating plunge, pitched to show the underside, homing onto foe.
      case 'dive': {
        body.userData.slamming = true;
        const t = clamp01(body.userData.starPhaseT / STAR_DIVE_DUR);
        const e = easeInQuad(t); // gentler, slower-looking acceleration
        homingXZ(body, opp, 8 * dt);
        body.userData.flightLift = STAR_APEX * (1 - e);
        body.userData.flightTilt = STAR_FALL_PITCH * easeOutQuad(t);
        body.userData.flightRoll = STAR_FALL_ROLL * easeOutQuad(t);
        body.userData.flightSquash = 1 + 0.24 * e; // elongates as it speeds up
        if (e >= 1 || body.userData.flightLift <= STAR_LAND_LIFT) {
          body.userData.flightLift = 0;
          body.userData.starVY = STAR_BOUNCE_VELOCITY;
          body.userData.starBouncePulseT = 0;
          applyStarBounceKnockback(body, opp, STAR_BOUNCE_VELOCITY);
          if (starBlastOverlap(body, opp)) markStarBlastHit(state, side, body, opp);
          body.userData.starPhase = 'bounce';
          body.userData.starPhaseT = 0;
          setBodyCollisions(body, true);
        } else {
          setBodyCollisions(body, false);
        }
        break;
      }

      // 6) Real decaying bounces: integrate velocity + gravity, squash on each
      //    contact, and progressively right itself to upright.
      case 'bounce': {
        body.userData.slamming = body.userData.starVY > 0; // only damages going up off the slam
        let vy = body.userData.starVY ?? 0;
        vy -= STAR_BOUNCE_GRAVITY * dt;
        let lift = (body.userData.flightLift ?? 0) + vy * dt;
        body.userData.starBouncePulseT = (body.userData.starBouncePulseT ?? 0) + dt;

        if (lift <= 0) {
          lift = 0;
          const contactSpeed = Math.abs(vy);
          if (contactSpeed < STAR_BOUNCE_MIN_V) {
            // Too slow to bounce again — settle upright.
            body.userData.flightLift = 0;
            body.userData.starSettleTilt = body.userData.flightTilt ?? 0;
            body.userData.starSettleRoll = body.userData.flightRoll ?? 0;
            body.userData.starPhase = 'settle';
            body.userData.starPhaseT = 0;
            body.userData.slamming = false;
            break;
          }
          vy = contactSpeed * STAR_BOUNCE_RESTITUTION;
          body.userData.starBouncePulseT = 0;
          body.userData.flightTilt = (body.userData.flightTilt ?? 0) * 0.45;
          body.userData.flightRoll = (body.userData.flightRoll ?? 0) * 0.45;

          // Modest knockback away from the opponent on each bounce.
          applyStarBounceKnockback(body, opp, contactSpeed);
        }

        body.userData.starVY = vy;
        body.userData.flightLift = lift;

        // Squash pulse driven off each ground contact: flatten hard on impact,
        // spring back through a slight stretch, then settle to neutral.
        const pulse = clamp01(body.userData.starBouncePulseT / STAR_BOUNCE_PULSE_DUR);
        const stretch = 0.12 * Math.sin(pulse * Math.PI) *
          clamp01(Math.abs(vy) / STAR_BOUNCE_VELOCITY);
        body.userData.flightSquash = 1 - 0.4 * (1 - pulse) + stretch;

        const rightRate = 1 - Math.pow(STAR_BOUNCE_UPRIGHT_RATE, dt);
        body.userData.flightTilt *= 1 - rightRate;
        body.userData.flightRoll *= 1 - rightRate;
        setBodyCollisions(body, true);
        break;
      }

      // 7) Regain balance: a few little decaying hops with a slow, gentle sway.
      case 'settle': {
        body.userData.slamming = false;
        const t = clamp01(body.userData.starPhaseT / STAR_SETTLE_DUR);
        const decay = (1 - t) * (1 - t); // amplitude eases smoothly to zero

        // Little hops that get shorter each time (|sin| gives evenly spaced arches).
        const hops = Math.abs(Math.sin(t * Math.PI * STAR_SETTLE_HOPS)) *
          STAR_SETTLE_HOP_HEIGHT * decay;
        body.userData.flightLift = hops;

        // Slow sway that decays, plus any residual tilt easing back to upright.
        const sway = Math.sin(t * Math.PI * STAR_SETTLE_WOBBLES) *
          STAR_SETTLE_WOBBLE_AMP * decay;
        const settleEase = 1 - easeOutCubic(t);
        body.userData.flightTilt = (body.userData.starSettleTilt ?? 0) * settleEase + sway;
        body.userData.flightRoll = (body.userData.starSettleRoll ?? 0) * settleEase;

        // Squat a touch each time a hop taps the floor.
        const grounded = 1 - clamp01(hops / (STAR_SETTLE_HOP_HEIGHT * 0.35));
        body.userData.flightSquash = 1 - 0.1 * grounded * decay;

        setBodyCollisions(body, true);
        if (t >= 1) {
          body.userData.flightLift = 0;
          body.userData.flightTilt = 0;
          body.userData.flightRoll = 0;
          body.userData.flightSquash = 1;
          finishStarBlast(state, side, slot, body, dt);
        }
        break;
      }

      default:
        body.userData.starPhase = 'dash';
        body.userData.starPhaseT = 0;
        break;
    }

    integrateStarKnockback(body, dt);

    // Failsafe: move slot ended but controls/physics still cinematic.
    if (!slot.active && slot.windupRemaining <= 0 && body.userData.controlLocked) {
      resolveStarBlastOutcome(state, side, body);
      releaseStarBlastControl(body);
    }
  }
}

// ---- Leone cinematic visual driver (render rate) ----------------------------

const LEONE_DIG_DUR = 0.25;       // squash-down window at anchor start
const LEONE_SQUASH_HOLD = 0.82;   // squash scale while anchored
const LEONE_SHAKE_AMP = 0.04;     // tilt shake amplitude while planted

/**
 * Per-frame visual animation for Rock Leone's two abilities.
 * Mutates body.userData cinematic fields consumed by syncTopVisual.
 * Called from tickAbilityVisuals, runs at render rate.
 */
export function tickLeoneAbilityVisuals(state, dt) {
  if (!state.abilities) return;
  for (const side of ['player', 'ai']) {
    const body = side === 'player' ? state.playerBody : state.aiBody;
    if (!body) continue;
    const runtime = state.abilities[side];
    if (!runtime) continue;

    // --- Wide Ball Anchor (power) ---
    const pwSlot = runtime.power;
    if (pwSlot?.active && pwSlot.ability.id === 'leone_wide_ball') {
      const t = body.userData.leoneAnchorT ?? 0;
      body.userData.leoneAnchorT = t + dt;

      if (t < LEONE_DIG_DUR) {
        // Dig-in: squash rapidly toward planted shape.
        const e = easeOutQuad(t / LEONE_DIG_DUR);
        body.userData.flightSquash = 1 - (1 - LEONE_SQUASH_HOLD) * e;
        body.userData.flightTilt = 0.06 * e;
      } else {
        // Hold: squash locked, slow micro-shake to feel grounded.
        body.userData.flightSquash = LEONE_SQUASH_HOLD;
        const shake = Math.sin(t * 38) * LEONE_SHAKE_AMP * 0.6
                    + Math.sin(t * 21) * LEONE_SHAKE_AMP * 0.4;
        body.userData.flightTilt = 0.06 + shake;
        body.userData.flightRoll = Math.sin(t * 27) * LEONE_SHAKE_AMP * 0.35;
      }
      continue;
    }

    // --- Lion Gale Force Wall (special) ---
    const spSlot = runtime.special;
    if (!spSlot || spSlot.ability.id !== 'leone_lion_wall') continue;

    const inWindup = spSlot.windupRemaining > 0;
    const inActive = spSlot.active;
    if (!inWindup && !inActive) continue;

    if (inWindup) {
      const windup = slotWindupTotal(spSlot, 0.45);
      const t = clamp01(1 - spSlot.windupRemaining / windup);
      const rise = easeOutQuad(t);
      // Rise into the gale during windup.
      body.userData.contactLift = LEONE_WALL_HOVER_BASE * rise;
      body.userData.flightSquash = 1 - 0.12 * rise;
      body.userData.flightTilt = 0.08 * rise;
      body.userData.flightRoll = 0;
      body.userData.flightLift = body.userData.contactLift;
    } else {
      // Active: high hover + slow bob — out of ground contact range.
      const wt = body.userData.lionWallT ?? 0;
      body.userData.lionWallT = wt + dt;
      const dur = spSlot.ability.duration || LEONE_WALL_DURATION;
      const progress = clamp01(1 - spSlot.activeRemaining / dur);
      const fadeIn = easeOutQuad(Math.min(1, wt / 0.25));
      const fadeOut = progress > 0.8 ? easeOutQuad((1 - progress) / 0.2) : 1;
      const env = fadeIn * fadeOut;
      const bob = Math.sin(wt * 4.2) * LEONE_WALL_HOVER_BOB * env;

      body.userData.contactLift = LEONE_WALL_HOVER_BASE * env + bob;
      body.userData.flightSquash = 1 - 0.14 * env;
      body.userData.flightLift = body.userData.contactLift;
      body.userData.flightRoll = Math.sin(wt * 2.8) * 0.11 * env;
      body.userData.flightTilt = 0.06 * env;

      // Decay the burst signal each frame so VFX has a timed window to read it.
      if (body.userData.lionWallBurstT != null) {
        body.userData.lionWallBurstT -= dt * 8;
        if (body.userData.lionWallBurstT <= 0) delete body.userData.lionWallBurstT;
      }
    }
  }
}

/**
 * Per-frame visual animation for Dark Bull's stampede and uppercut.
 */
export function tickBullAbilityVisuals(state, dt) {
  if (!state.abilities) return;

  for (const side of ['player', 'ai']) {
    const body = side === 'player' ? state.playerBody : state.aiBody;
    const opp = side === 'player' ? state.aiBody : state.playerBody;
    if (!body) continue;
    const runtime = state.abilities[side];
    if (!runtime) continue;

    const pwSlot = runtime.power;
    if (pwSlot?.active && pwSlot.ability.id === 'bull_maximum_stampede') {
      const t = body.userData.stampedeT ?? 0;
      body.userData.stampedeT = t + dt;
      const pulse = 0.5 + 0.5 * Math.sin(t * 9);
      body.userData.flightSquash = 1 - 0.05 * pulse;
      body.userData.flightTilt = 0.04 * pulse;
    }

    const spSlot = runtime.special;
    if (!spSlot || spSlot.ability.id !== 'bull_red_horn_uppercut') continue;

    const inMove =
      spSlot.windupRemaining > 0 ||
      spSlot.active ||
      body.userData.bullUpperPhase != null;
    if (!inMove) continue;

    const floor = groundY(body);
    body.position.y = floor;
    body.velocity.set(0, 0, 0);
    setBodyCollisions(body, false);
    if (body.type !== CANNON.Body.KINEMATIC) setAirborneKinematic(body);

    if (body.userData.bullImpactFlash) {
      body.userData.bullImpactFlashT = (body.userData.bullImpactFlashT ?? 0) + dt;
      if (body.userData.bullImpactFlashT > 0.15) {
        body.userData.bullImpactFlash = false;
        delete body.userData.bullImpactFlashT;
      }
    }

    if (spSlot.windupRemaining > 0) {
      body.userData.bullUpperPhase = 'windup';
      const windup = slotWindupTotal(spSlot, BULL_UPPERCUT_WINDUP);
      const t = clamp01(1 - spSlot.windupRemaining / windup);
      const e = easeInOutCubic(t);
      body.userData.flightLift = 0;
      body.userData.bullWindupEndTilt = 0.12 * easeOutCubic(t);
      body.userData.flightTilt = body.userData.bullWindupEndTilt;
      body.userData.flightRoll = Math.sin(t * Math.PI) * 0.025;
      body.userData.flightSquash = 1 - 0.14 * e;
      continue;
    }

    if (!spSlot.active && body.userData.bullUpperPhase !== 'dash') continue;

    const phase = body.userData.bullUpperPhase ?? 'dash';

    switch (phase) {
      case 'dash': {
        body.userData.bullUpperSlamming = true;
        const phaseT = body.userData.bullUpperPhaseT ?? 0;
        const build = easeOutCubic(clamp01(phaseT / BULL_DASH_BUILD_DUR));
        const fromTilt = body.userData.bullWindupEndTilt ?? 0.12;
        body.userData.flightTilt = fromTilt + (BULL_DASH_LEAN - fromTilt) * build;
        body.userData.flightSquash = 1 + 0.05 * build;
        body.userData.flightRoll = (body.userData.bullCoastNz ?? 0) * 0.045 * build;

        if (body.userData.bullDashDone) {
          delete body.userData.bullDashDone;
          body.userData.bullUpperSlamming = false;
          finishBullUppercut(state, side, spSlot, body, dt);
        }
        break;
      }
      default:
        break;
    }

    // Failsafe: slot ended but attacker still cinematic / locked.
    if (!spSlot.active && spSlot.windupRemaining <= 0 && body.userData.controlLocked) {
      resolveBullUppercutOutcome(state, side, body);
      releaseBullUppercutControl(body);
    }
  }
}

// ---- Libra cinematic visual driver (render rate) ----------------------------

/**
 * Per-frame body animation for Flame Libra's Sonic Shield and Sonic Buster.
 */
export function tickLibraAbilityVisuals(state, dt) {
  if (!state.abilities) return;
  stepLibraBusterChannel(state, dt);
  for (const side of ['player', 'ai']) {
    const body = side === 'player' ? state.playerBody : state.aiBody;
    if (!body) continue;
    const runtime = state.abilities[side];
    if (!runtime) continue;

    const pwSlot = runtime.power;
    if (pwSlot?.active && pwSlot.ability.id === 'libra_sonic_shield') {
      const t = body.userData.sonicShieldT ?? 0;
      body.userData.sonicShieldT = t + dt;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5.2);
      body.userData.flightSquash = 1 - 0.06 * pulse;
      body.userData.flightRoll = Math.sin(t * 3.4) * 0.04;
      body.userData.flightTilt = 0.03 * pulse;
      if (body.userData.sonicShieldBurstT != null) {
        body.userData.sonicShieldBurstT -= dt * 7;
        if (body.userData.sonicShieldBurstT <= 0) delete body.userData.sonicShieldBurstT;
      }
      continue;
    }

    const spSlot = runtime.special;
    if (!spSlot || spSlot.ability.id !== 'libra_sonic_buster') continue;

    const inWindup = spSlot.windupRemaining > 0 || body.userData.sonicBusterWindup;
    const inActive = spSlot.active;
    if (!inWindup && !inActive) continue;

    const vt = (body.userData.sonicBusterVibrateT ?? 0) + dt;
    body.userData.sonicBusterVibrateT = vt;
    const w = LIBRA_BUSTER_VIBRATE_HZ * Math.PI * 2;
    const phase = vt * w;
    const bob = Math.sin(phase);
    body.userData.sonicBusterVisualSpinMult = LIBRA_BUSTER_VISUAL_SPIN;
    body.userData.flightLift = bob * LIBRA_BUSTER_VIBRATE_LIFT;
    body.userData.flightSquash = 1 - bob * 0.1;
    body.userData.flightOffsetX = Math.sin(phase) * LIBRA_BUSTER_VIBRATE_XY;
    body.userData.flightOffsetZ = Math.sin(phase + Math.PI * 0.5) * LIBRA_BUSTER_VIBRATE_XY;
    body.userData.flightTilt = 0;
    body.userData.flightRoll = 0;
  }
}

// ---- L-Drago cinematic visual driver (render rate) --------------------------

/**
 * Per-frame body animation for L-Drago Spin Steal and Supreme Flight.
 */
export function tickLdragoAbilityVisuals(state, dt) {
  if (!state.abilities) return;
  for (const side of ['player', 'ai']) {
    const body = side === 'player' ? state.playerBody : state.aiBody;
    if (!body) continue;
    const runtime = state.abilities[side];
    if (!runtime) continue;

    // --- Spin Steal (power) ---
    const pwSlot = runtime.power;
    if (pwSlot?.active && pwSlot.ability.id === 'ldrago_spin_steal') {
      body.userData.spinStealT = (body.userData.spinStealT ?? 0) + dt;
      body.userData.flightRoll = Math.sin(body.userData.spinStealT * 4.5) * 0.05;
      if (body.userData.spinStealBurstT != null) {
        body.userData.spinStealBurstT -= dt * 6;
        if (body.userData.spinStealBurstT <= 0) {
          delete body.userData.spinStealBurstT;
          delete body.userData.spinStealFromX;
          delete body.userData.spinStealFromZ;
        }
      }
      continue;
    }

    // --- Supreme Flight (special) ---
    const spSlot = runtime.special;
    if (!spSlot || spSlot.ability.id !== 'ldrago_supreme_flight') continue;

    const inWindup = spSlot.windupRemaining > 0;
    const inActive = spSlot.active;
    if (!inWindup && !inActive && !body.userData.ldragoFlightWindup) continue;

    if (inWindup || body.userData.ldragoFlightWindup) {
      const windup = slotWindupTotal(spSlot, LDRAGO_FLIGHT_WINDUP);
      const t = clamp01(1 - spSlot.windupRemaining / windup);
      body.userData.flightSquash = 1 - 0.14 * easeOutQuad(t);
      body.userData.flightTilt = 0.16 * easeOutQuad(t);
      body.userData.flightRoll = Math.sin(t * Math.PI * 3) * 0.04;
      body.userData.flightLift = 0;
    } else if (inActive) {
      const ft = body.userData.ldragoFlightT ?? 0;
      const dur = spSlot.ability.duration || LDRAGO_FLIGHT_DURATION;
      const remaining = spSlot.activeRemaining;
      const inLand = remaining <= LDRAGO_FLIGHT_LAND_DUR;
      const reriseStart = LDRAGO_FLIGHT_LAUNCH_DUR;
      const reriseEnd = reriseStart + LDRAGO_LIGHTNING_CHARGE_DUR;
      const inLaunch = !inLand && ft < LDRAGO_FLIGHT_LAUNCH_DUR;
      const inRerise = !inLand && ft >= reriseStart && ft < reriseEnd;

      if (inLaunch) {
        const t = easeOutQuad(clamp01(ft / LDRAGO_FLIGHT_LAUNCH_DUR));
        body.userData.flightLift = LDRAGO_FLIGHT_APEX * LDRAGO_FLIGHT_LAUNCH_PEAK * t;
        body.userData.flightSquash = 1 + 0.06 * t;
        body.userData.flightTilt = -0.08 * easeOutQuad(t);
        body.userData.flightRoll = Math.sin(ft * 2.4) * 0.04 * t;
      } else if (inRerise) {
        const t = easeOutQuad(clamp01((ft - reriseStart) / LDRAGO_LIGHTNING_CHARGE_DUR));
        const peak = LDRAGO_FLIGHT_LAUNCH_PEAK + (1 - LDRAGO_FLIGHT_LAUNCH_PEAK) * t;
        body.userData.flightLift = LDRAGO_FLIGHT_APEX * peak;
        body.userData.flightSquash = 1 + 0.04 * (1 - t);
        body.userData.flightTilt = -0.06 * (1 - t);
        body.userData.flightRoll = Math.sin(ft * 2.2) * 0.06;
      } else if (inLand) {
        const landT = clamp01(remaining / LDRAGO_FLIGHT_LAND_DUR);
        body.userData.flightLift = LDRAGO_FLIGHT_APEX * easeOutQuad(landT);
        body.userData.flightSquash = 1 - 0.22 * (1 - landT);
        body.userData.flightTilt = 0.04 * landT;
        body.userData.flightRoll = Math.sin(landT * Math.PI) * 0.08 * landT;
      } else {
        const bob = Math.sin(ft * 2.6) * LDRAGO_FLIGHT_BOB;
        body.userData.flightLift = LDRAGO_FLIGHT_APEX + bob;
        body.userData.flightSquash = 1 - 0.08;
        body.userData.flightRoll = Math.sin(ft * 2.0) * 0.1;
        body.userData.flightTilt = 0.06 + Math.sin(ft * 1.8) * 0.03;
      }

      if (body.userData.flightRepulseT != null) {
        body.userData.flightRepulseT -= dt * 5;
        if (body.userData.flightRepulseT <= 0) delete body.userData.flightRepulseT;
      }
      if (body.userData.ldragoFlightLaunchT != null) {
        body.userData.ldragoFlightLaunchT -= dt * 2;
        if (body.userData.ldragoFlightLaunchT <= 0) delete body.userData.ldragoFlightLaunchT;
      }

      const chargeStart = LDRAGO_FLIGHT_LAUNCH_DUR;
      const chargeEnd = chargeStart + LDRAGO_LIGHTNING_CHARGE_DUR;
      body.userData.ldragoLightningCharging = ft >= chargeStart && ft < chargeEnd;
      body.userData.ldragoFlightRerising = inRerise;
    }
  }
}

/** True while Pegasus Star Blast should show the blue emissive glow. */
export function shouldStarBlastGlow(body) {
  if (!body) return false;
  const phase = body.userData.starPhase;
  return phase === 'windup' || phase === 'dash' || phase === 'ascend' || phase === 'dive';
}

/** Max visual flight height across both tops — used for other cinematic camera lift. */
export function getCinematicFlightLift(state) {
  let lift = 0;
  for (const body of [state.playerBody, state.aiBody]) {
    if (!body) continue;
    lift = Math.max(lift, body.userData.flightLift ?? 0);
  }
  return lift;
}

let _camSmoothLift = 0;
let _camStadiumT = 0;
let _camFocusX = 0;
let _camFocusZ = 0;
let _camFocusReady = false;

function koWinnerFocus(state) {
  if (!state.pendingKo) return null;
  const winner = state.pendingKo.loser === 1 ? state.aiBody : state.playerBody;
  if (!winner) return null;
  return { x: winner.position.x, z: winner.position.z };
}

function normalCameraFocus(state) {
  const positions = [];
  if (state.playerBody && !state.playerBody.userData.ringOut) {
    positions.push(state.playerBody.position);
  }
  if (state.aiBody && !state.aiBody.userData.ringOut) {
    positions.push(state.aiBody.position);
  }
  if (positions.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const p of positions) {
    x += p.x;
    z += p.z;
  }
  return { x: x / positions.length, z: z / positions.length };
}

function findActiveStarBlast(state) {
  for (const side of ['player', 'ai']) {
    const slot = state.abilities?.[side]?.special;
    if (!slot || slot.ability?.id !== 'pegasus_star_blast') continue;
    const body = side === 'player' ? state.playerBody : state.aiBody;
    if (!body) continue;
    const inMove =
      slot.windupRemaining > 0 || slot.active || body.userData.starPhase != null;
    if (!inMove) continue;
    return true;
  }
  return false;
}

/** Stadium overview while Star Blast plays; eases back to normal tracking afterward. */
export function getCameraCue(state, dt, mode) {
  const starBlast = findActiveStarBlast(state);
  const koActive = !!state.pendingKo;

  const stadiumTarget = starBlast ? 1 : 0;
  const stadiumRate = starBlast ? 6 : 3.5;
  _camStadiumT += (stadiumTarget - _camStadiumT) * (1 - Math.exp(-stadiumRate * dt));

  const targetLift = starBlast ? 0 : getCinematicFlightLift(state);
  const liftRate = starBlast ? 10 : 8;
  _camSmoothLift += (targetLift - _camSmoothLift) * (1 - Math.exp(-liftRate * dt));

  const duelFocus = normalCameraFocus(state);
  const winnerFocus = koWinnerFocus(state);
  let targetX = duelFocus.x;
  let targetZ = duelFocus.z;
  if (winnerFocus) {
    targetX = winnerFocus.x;
    targetZ = winnerFocus.z;
  }

  if (!_camFocusReady) {
    _camFocusX = targetX;
    _camFocusZ = targetZ;
    _camFocusReady = true;
  }

  const focusRate = koActive ? 1.5 : 5.5;
  const focusStep = 1 - Math.exp(-focusRate * dt);
  _camFocusX += (targetX - _camFocusX) * focusStep;
  _camFocusZ += (targetZ - _camFocusZ) * focusStep;

  const t = _camStadiumT;
  const focusX = _camFocusX * (1 - t);
  const focusZ = _camFocusZ * (1 - t);

  const baseCamY = 24 + _camSmoothLift * 0.5;
  const baseCamZ = 20 + _camSmoothLift * 0.1;
  const baseLookY = _camSmoothLift * 0.38;

  return {
    focusX,
    focusZ,
    camY: baseCamY + (STAR_BLAST_CAM_Y - baseCamY) * t,
    camZ: baseCamZ + (STAR_BLAST_CAM_Z - baseCamZ) * t,
    lookY: baseLookY + (STAR_BLAST_CAM_LOOK_Y - baseLookY) * t,
    stabilized: starBlast && t > 0.04,
    koCinematic: koActive,
  };
}

export function resetStarBlastCamera() {
  _camSmoothLift = 0;
  _camStadiumT = 0;
  _camFocusReady = false;
}

/** Per frame: advance cooldown, windup (then activate), and active duration. */
export function tickAbilityTimers(state, dt) {
  if (!state.abilities) return;
  for (const side of ['player', 'ai']) {
    const runtime = state.abilities[side];
    if (!runtime) continue;
    for (const slotName of ['power', 'special']) {
      const slot = runtime[slotName];
      if (!slot) continue;
      if (slot.cooldownRemaining > 0) {
        slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - dt);
      }
      if (slot.windupRemaining > 0) {
        slot.windupRemaining = Math.max(0, slot.windupRemaining - dt);
        if (slot.windupRemaining === 0) activateSlot(state, side, slot);
      } else if (slot.active) {
        if (slot.ability.id === 'pegasus_star_blast') {
          // Phase machine in tickAbilityVisuals ends this move.
          slot.activeRemaining = Math.max(0, slot.activeRemaining - dt);
          if (slot.activeRemaining === 0 && slot.active) {
            const body = side === 'player' ? state.playerBody : state.aiBody;
            if (body) finishStarBlast(state, side, slot, body, dt);
          }
        } else if (slot.ability.id === 'bull_red_horn_uppercut') {
          // Phase machine in tickBullAbilityVisuals ends this move.
          slot.activeRemaining = Math.max(0, slot.activeRemaining - dt);
          if (slot.activeRemaining === 0 && slot.active) {
            const body = side === 'player' ? state.playerBody : state.aiBody;
            const phase = body?.userData.bullUpperPhase;
            if (body && phase == null) {
              finishBullUppercut(state, side, slot, body, dt);
            } else if (body && (phase === 'dash' || body.userData.bullDashDone)) {
              releaseBullUppercutControl(body);
              finishBullUppercut(state, side, slot, body, dt);
            }
          }
        } else {
          slot.activeRemaining = Math.max(0, slot.activeRemaining - dt);
          if (slot.activeRemaining === 0) {
            if (slot.ability.onEnd) slot.ability.onEnd(makeCtx(state, side, dt));
            slot.active = false;
          }
        }
      }
    }
  }
}

// ---- contact resolution -----------------------------------------------------
function applyGuard(impact, guardBody, guardTag, attackerTag) {
  if (!guardBody.userData.guarding) return;
  impact['impulse' + attackerTag] *= GUARD_IMPULSE_MULT;
  impact['impulse' + guardTag] *= GUARD_SELF_IMPULSE;
  impact['spinDelta' + attackerTag] *= GUARD_SPIN_MULT; // more negative = bigger loss
  impact['spinDelta' + guardTag] = 0; // guard takes no spin loss
  if (guardBody.userData.invulnerable) {
    guardBody.userData.flightRepulseT = 1;
  }
  if (guardBody.userData.sonicShield) {
    guardBody.userData.sonicShieldBurstT = 1;
  }
}

function applyStarBlastSlam(impact, slamBody, slamTag, victimTag) {
  if (!slamBody.userData.slamming) return false;
  const phase = slamBody.userData.starPhase;
  if (phase !== 'dive' && phase !== 'bounce') return false;

  if (!slamBody.userData.starBlastHit) {
    slamBody.userData.starBlastHit = true;
    impact['spinDelta' + victimTag] = -STAR_BLAST_HIT_SPIN;
  } else {
    impact['spinDelta' + victimTag] = 0;
  }
  impact['spinDelta' + slamTag] *= 0.15;
  impact['impulse' + victimTag] = Math.max(
    impact['impulse' + victimTag] * STAR_BLAST_IMPULSE_MULT,
    9.5
  );
  impact['impulse' + slamTag] *= SLAM_SELF_IMPULSE;
  return true;
}

function applyBullUppercutSlam(state, impact, slamBody, slamTag, victimTag) {
  if (!slamBody?.userData?.bullUpperSlamming) return false;
  const victim = impact['body' + victimTag];
  if (victim?.userData?.bullFlipPhase) {
    impact['impulse' + slamTag] *= SLAM_SELF_IMPULSE;
    return true;
  }
  if (bullUppercutVictimImmune(state, slamBody, victim)) {
    impact['impulse' + slamTag] *= SLAM_SELF_IMPULSE;
    return true;
  }
  impact['impulse' + victimTag] = Math.max(
    impact['impulse' + victimTag] * BULL_UPPERCUT_SLAM_MULT,
    2.2
  );
  impact['impulse' + slamTag] *= SLAM_SELF_IMPULSE;
  impact['spinDelta' + victimTag] = Math.min(
    impact['spinDelta' + victimTag],
    -bullUppercutSpinLoss(victim)
  );
  return true;
}

function applySlam(impact, slamBody, slamTag, victimTag, state) {
  if (applyStarBlastSlam(impact, slamBody, slamTag, victimTag)) return;
  if (applyBullUppercutSlam(state, impact, slamBody, slamTag, victimTag)) return;
  if (!slamBody.userData.slamming) return;
  impact['impulse' + victimTag] *= SLAM_IMPULSE_MULT;
  impact['impulse' + slamTag] *= SLAM_SELF_IMPULSE;
  impact['spinDelta' + victimTag] *= SLAM_SPIN_MULT;
}

function isSpinStealActive(state, side, body) {
  const power = state.abilities?.[side]?.power;
  return (
    power?.active &&
    power.ability?.id === 'ldrago_spin_steal' &&
    body?.userData.spinStealing
  );
}

function trySteal(state, impact, selfTag, oppTag) {
  if (!isSpinStealActive(state, impact['side' + selfTag], impact['body' + selfTag])) return;

  const oppDelta = impact['spinDelta' + oppTag];
  const oppLoss = Math.max(0, -oppDelta);
  if (oppLoss <= 0) return;

  // No spin loss for L-Drago — absorb whatever the opponent lost on this hit.
  impact['spinDelta' + selfTag] = Math.max(0, impact['spinDelta' + selfTag]) + oppLoss;

  const stealBody = impact['body' + selfTag];
  const oppBody = impact['body' + oppTag];
  stealBody.userData.spinStealBurstT = clamp01(oppLoss * 10);
  stealBody.userData.spinStealFromX = oppBody.position.x;
  stealBody.userData.spinStealFromZ = oppBody.position.z;
}

/** While Spin Steal is up, soften every collision L-Drago is in by 60%. */
function applySpinStealKnockback(state, impact) {
  for (const tag of ['A', 'B']) {
    if (!isSpinStealActive(state, impact['side' + tag], impact['body' + tag])) continue;
    impact.impulseA *= SPIN_STEAL_KB_MULT;
    impact.impulseB *= SPIN_STEAL_KB_MULT;
    return;
  }
}

/** Blocks spin loss (negative deltas) while a body is invulnerable (Supreme Flight). */
function applyInvulnerability(impact) {
  for (const tag of ['A', 'B']) {
    const body = impact['body' + tag];
    if (!body?.userData?.invulnerable) continue;
    const delta = impact['spinDelta' + tag];
    if (delta < 0) impact['spinDelta' + tag] = 0;
  }
}

function applyBullStampede(impact, body, selfTag, oppTag) {
  if (!body?.userData?.stampeding) return;
  impact['impulse' + oppTag] *= BULL_STAMPEDE_KB_OUT;
}

function applyLeoneAnchor(impact, body, selfTag, oppTag) {
  if (!body?.userData?.anchoring) return;
  impact['impulse' + selfTag] *= LEONE_ANCHOR_DAMAGE_TAKEN;
  impact['impulse' + oppTag] *= LEONE_ANCHOR_KB_OUT;
  const delta = impact['spinDelta' + selfTag];
  if (delta < 0) impact['spinDelta' + selfTag] = 0;
}

function applyLeoneSpinResist(impact) {
  for (const tag of ['A', 'B']) {
    const body = impact['body' + tag];
    if (body?.userData?.beyStats?.id !== 'leone') continue;
    const delta = impact['spinDelta' + tag];
    if (delta < 0) impact['spinDelta' + tag] = delta * LEONE_SPIN_LOSS_TAKEN;
  }
}

/** Sonic Buster — Libra takes only 10% of bey-vs-bey knockback and spin loss. */
function applyLibraBusterMitigation(state, impact) {
  for (const tag of ['A', 'B']) {
    const body = impact['body' + tag];
    if (!isLibraBusterChannelingBody(state, body)) continue;
    impact['impulse' + tag] *= LIBRA_BUSTER_DAMAGE_TAKEN;
    const delta = impact['spinDelta' + tag];
    if (delta < 0) impact['spinDelta' + tag] = delta * LIBRA_BUSTER_DAMAGE_TAKEN;
  }
}

/**
 * Mutates a base impact object in place to apply ability effects.
 * impact = { bodyA, bodyB, sideA, sideB, closingSpeed,
 *            impulseA, impulseB,        // scalar magnitudes along the normal
 *            spinDeltaA, spinDeltaB }   // negative = spin lost by that side
 */
export function resolveContactAbilities(state, impact) {
  applyGuard(impact, impact.bodyA, 'A', 'B');
  applyGuard(impact, impact.bodyB, 'B', 'A');
  applySlam(impact, impact.bodyA, 'A', 'B', state);
  applySlam(impact, impact.bodyB, 'B', 'A', state);
  trySteal(state, impact, 'A', 'B');
  trySteal(state, impact, 'B', 'A');
  applySpinStealKnockback(state, impact);
  applyInvulnerability(impact);
  // Run last so slams/guards can't re-apply knockback to an anchored Leone.
  applyLeoneAnchor(impact, impact.bodyA, 'A', 'B');
  applyLeoneAnchor(impact, impact.bodyB, 'B', 'A');
  applyBullStampede(impact, impact.bodyA, 'A', 'B');
  applyBullStampede(impact, impact.bodyB, 'B', 'A');
  applyLibraBusterMitigation(state, impact);
  applyLeoneSpinResist(impact);
}

export { isLibraBusterChannelingBody };

/** True while a bey is executing an active special / power move. */
export function isBodyInSpecialMove(body, state) {
  if (!body?.userData) return false;
  const ud = body.userData;
  return !!(
    ud.slamming ||
    ud.airborne ||
    ud.stampeding ||
    ud.bullUpperSlamming ||
    ud.boosting ||
    ud.spinStealing ||
    ud.guarding ||
    ud.anchoring ||
    ud.lionWall ||
    ud.starPhase != null ||
    (state && isLibraBusterChannelingBody(state, body))
  );
}

function contactLift(body) {
  return readContactLift(body);
}

function isAerialStriker(body) {
  if (!body) return false;
  if (body.userData.bullUpperSlamming) return true;
  if (!body.userData.slamming) return false;
  const phase = body.userData.starPhase;
  return phase === 'dive' || phase === 'bounce';
}

/** True when two tops are close enough vertically for bey-vs-bey contact. */
export function canTopsContactVertically(bodyA, bodyB) {
  if (!bodyA || !bodyB) return true;
  let liftA = contactLift(bodyA);
  let liftB = contactLift(bodyB);
  // Dive slams reach down to the target's elevation.
  if (isAerialStriker(bodyA)) liftA = Math.min(liftA, liftB);
  if (isAerialStriker(bodyB)) liftB = Math.min(liftB, liftA);
  const rA = bodyA.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const rB = bodyB.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const reach = (rA + rB) * 0.78;
  return Math.abs(liftA - liftB) <= reach;
}

/** Clears all per-body ability flags (used on spawn / round reset). */
export function clearAbilityFlags(body) {
  if (!body) return;
  body.userData.steerMult = 1;
  body.userData.controlLocked = false;
  body.userData.airborne = false;
  body.userData.boosting = false;
  body.userData.slamming = false;
  body.userData.guarding = false;
  body.userData.anchoring = false;
  body.userData.lionWall = false;
  body.userData.sonicShield = false;
  body.userData.sonicBuster = false;
  body.userData.sonicSandBoost = false;
  body.userData.spinStealing = false;
  body.userData.stampeding = false;
  body.userData.invulnerable = false;
  body.userData.flightLift = 0;
  body.userData.flightTilt = 0;
  body.userData.flightRoll = 0;
  body.userData.flightSquash = 1;
  delete body.userData.contactLift;
  delete body.userData.starPhase;
  delete body.userData.starPhaseT;
  delete body.userData.starImpactFlash;
  delete body.userData.starBlastHit;
  delete body.userData.starBlastResolved;
  delete body.userData.starWallX;
  delete body.userData.starWallZ;
  delete body.userData.lionWallPulse;
  delete body.userData.leoneAnchorT;
  delete body.userData.lionWallT;
  delete body.userData.lionWallBurstT;
  delete body.userData.lionWallReach;
  delete body.userData.sonicShieldPulse;
  delete body.userData.sonicShieldT;
  delete body.userData.sonicShieldBurstT;
  delete body.userData.sonicShieldReach;
  delete body.userData.sonicBusterT;
  delete body.userData.sonicBusterX;
  delete body.userData.sonicBusterZ;
  delete body.userData.sonicBusterReach;
  delete body.userData.sonicBusterSpread;
  delete body.userData._sonicSandBaseSteer;
  delete body.userData.boostT;
  delete body.userData.spinStealT;
  delete body.userData.spinStealBurstT;
  delete body.userData.spinStealFromX;
  delete body.userData.spinStealFromZ;
  delete body.userData.stampedeT;
  if (body.userData.bullFlipPhase) {
    releaseBullFlipVictim(body, false);
  }
  delete body.userData.bullUpperSlamming;
  delete body.userData.bullImpactFlash;
  delete body.userData.bullImpactFlashT;
  clearBullUppercutMotion(body);
  delete body.userData.ldragoFlightT;
  delete body.userData.ldragoFlightLaunchT;
  delete body.userData.flightRepulseT;
  delete body.userData.ldragoLightningSpots;
  delete body.userData.ldragoLightningFired;
  body.userData.lionWallWindup = false;
  body.userData.ldragoFlightWindup = false;
  body.userData.sonicBusterWindup = false;
  clearSonicSlow(body);
  clearLibraSandBoost(body);
  clearLibraBusterVibrate(body);
  if (body.type === CANNON.Body.KINEMATIC) {
    restoreDynamicBody(body);
  }
  setBodyCollisions(body, true);
}
