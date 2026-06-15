import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { atkCombatMult, defMult, spinDefMult } from '../game/stats.js';
import { resolveContactAbilities } from '../game/abilities.js';
import { clamp01 } from '../utils/math.js';

const _impulse = new CANNON.Vec3();

/** Maps rim impact speed to a 3–7% spin loss. */
function wallSpinLossFromSpeed(speed) {
  const span = CONFIG.WALL_IMPACT_HARD - CONFIG.WALL_IMPACT_SOFT;
  const t = span > 0 ? clamp01((speed - CONFIG.WALL_IMPACT_SOFT) / span) : 1;
  return CONFIG.WALL_SPIN_LOSS_MIN + t * (CONFIG.WALL_SPIN_LOSS_MAX - CONFIG.WALL_SPIN_LOSS_MIN);
}

function isAtPocketAngle(angle) {
  for (const pocket of CONFIG.POCKET_ANGLES) {
    let delta = Math.abs(angle - pocket);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta <= CONFIG.POCKET_HALF_WIDTH * 1.5) return true;
  }
  return false;
}

function topFromContact(contact) {
  if (contact.bi?.userData?.isTop) return contact.bi;
  if (contact.bj?.userData?.isTop) return contact.bj;
  return null;
}

/** Rim contact (not floor): static segment with a mostly horizontal normal. */
function isWallContact(contact) {
  const top = topFromContact(contact);
  if (!top) return false;
  const other = top === contact.bi ? contact.bj : contact.bi;
  if (other?.type !== CANNON.Body.STATIC) return false;
  return Math.abs(contact.ni.y) < 0.45;
}

/**
 * Custom 2D disc collision for bey-vs-bey, run once per physics step.
 *
 * Cannon-es no longer resolves top-top contact (see updateTopCollisions), so
 * this owns the entire bey-vs-bey interaction:
 *   - "Touch" is defined purely by the horizontal radii, so contact happens
 *     exactly when the visible discs meet.
 *   - Overlap is corrected positionally each step (no clipping).
 *   - Every contact applies a radial knockback (along the line of centres) with
 *     a guaranteed minimum impulse, so beys always pop apart instead of grinding
 *     and rolling around each other.
 *   - Spin loss + abilities reuse the existing stat-scaling logic.
 */
export function setupContactHandlers(world, getState) {
  let cooldown = 0;
  const wallCooldown = { player: 0, ai: 0 };

  function sideOf(body) {
    if (body.userData.side) return body.userData.side;
    return body.userData.playerId === 1 ? 'player' : 'ai';
  }

  function applySpinDelta(state, side, delta, body) {
    if (!delta) return;
    const top = body ?? (side === 'player' ? state.playerBody : state.aiBody);
    if (delta < 0 && top?.userData?.invulnerable) return;
    const key = side === 'player' ? 'playerSpin' : 'aiSpin';
    state[key] = Math.max(0, Math.min(1, state[key] + delta));
  }

  function applyWallSpinLoss(state, body, impactSpeed) {
    if (!body || body.userData.collisionsDisabled || body.userData.airborne) return;
    if (body.userData.invulnerable) return;
    if (impactSpeed < CONFIG.WALL_IMPACT_SOFT) return;

    const side = sideOf(body);
    if (wallCooldown[side] > 0) return;

    applySpinDelta(state, side, -wallSpinLossFromSpeed(impactSpeed));
    wallCooldown[side] = CONFIG.WALL_IMPACT_COOLDOWN;
  }

  function resolveWallContacts(state, dt) {
    if (state.launchGrace > 0) return;

    wallCooldown.player = Math.max(0, wallCooldown.player - dt);
    wallCooldown.ai = Math.max(0, wallCooldown.ai - dt);

    for (const contact of world.contacts) {
      if (!isWallContact(contact)) continue;
      const top = topFromContact(contact);
      const impactSpeed = Math.abs(contact.getImpactVelocityAlongNormal());
      applyWallSpinLoss(state, top, impactSpeed);
    }
  }

  /** Positional wall clip (tunnel guard) — run before velocity is zeroed. */
  function resolveWallClipSpin(state, bodyA, bodyB) {
    if (state.launchGrace > 0) return;

    for (const body of [bodyA, bodyB]) {
      if (!body || body.userData.collisionsDisabled) continue;
      const x = body.position.x;
      const z = body.position.z;
      const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const dist = Math.hypot(x, z);
      const maxR = CONFIG.WALL_RADIUS - r;
      if (dist <= maxR || dist <= 0.001) continue;
      if (isAtPocketAngle(Math.atan2(z, x))) continue;

      const nx = x / dist;
      const nz = z / dist;
      const vOut = body.velocity.x * nx + body.velocity.z * nz;
      if (vOut > 0) applyWallSpinLoss(state, body, vOut);
    }
  }

  function resolve(state, dt) {
    if (state.launchGrace > 0) return;
    const bodyA = state.playerBody;
    const bodyB = state.aiBody;
    if (!bodyA || !bodyB) return;
    if (bodyA.userData.collisionsDisabled || bodyB.userData.collisionsDisabled) return;

    if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);

    // --- 2D overlap test in the horizontal plane ---
    const dx = bodyA.position.x - bodyB.position.x;
    const dz = bodyA.position.z - bodyB.position.z;
    const dist2 = dx * dx + dz * dz;
    const rA = bodyA.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const rB = bodyB.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const minDist = rA + rB;
    if (dist2 >= minDist * minDist || dist2 < 1e-6) return;

    const dist = Math.sqrt(dist2);
    // Normal points from B toward A (the direction A is pushed away).
    const nx = dx / dist;
    const nz = dz / dist;

    // --- Positional separation so the discs never interpenetrate ---
    const overlap = minDist - dist;
    if (bodyA.userData.anchoring && !bodyB.userData.anchoring) {
      bodyB.position.x -= nx * overlap;
      bodyB.position.z -= nz * overlap;
    } else if (bodyB.userData.anchoring && !bodyA.userData.anchoring) {
      bodyA.position.x += nx * overlap;
      bodyA.position.z += nz * overlap;
    } else {
      const push = overlap * 0.5;
      bodyA.position.x += nx * push;
      bodyA.position.z += nz * push;
      bodyB.position.x -= nx * push;
      bodyB.position.z -= nz * push;
    }

    // One impact per contact window; positions are still corrected every step.
    if (cooldown > 0) return;

    // --- Closing speed along the line of centres ---
    const relVx = bodyA.velocity.x - bodyB.velocity.x;
    const relVz = bodyA.velocity.z - bodyB.velocity.z;
    const closingSpeed = Math.max(0, -(relVx * nx + relVz * nz));

    cooldown = CONFIG.IMPACT_COOLDOWN;

    const mAtkA = atkCombatMult(bodyA.userData.beyStats);
    const mDefA = defMult(bodyA.userData.beyStats);
    const mAtkB = atkCombatMult(bodyB.userData.beyStats);
    const mDefB = defMult(bodyB.userData.beyStats);
    const mSpinDefA = spinDefMult(bodyA.userData.beyStats);
    const mSpinDefB = spinDefMult(bodyB.userData.beyStats);

    const reducedMass = (bodyA.mass * bodyB.mass) / (bodyA.mass + bodyB.mass);
    // Floor keeps slow center-pull contacts from grinding: they still pop apart.
    const baseImpulse = Math.max(
      CONFIG.MIN_KNOCKBACK,
      closingSpeed * CONFIG.KNOCKBACK_SCALE
    ) * reducedMass;

    const baseSpinLoss = Math.min(
      CONFIG.MAX_SPIN_LOSS,
      Math.max(CONFIG.MIN_SPIN_LOSS, closingSpeed * CONFIG.SPIN_LOSS_SCALE)
    );

    // Each bey receives impulse / spin loss scaled by the opponent's ATK and
    // its own DEF. spinDelta is negative (= spin lost).
    const impact = {
      bodyA,
      bodyB,
      sideA: sideOf(bodyA),
      sideB: sideOf(bodyB),
      closingSpeed,
      impulseA: (baseImpulse * mAtkB) / mDefA,
      impulseB: (baseImpulse * mAtkA) / mDefB,
      spinDeltaA: -Math.min(CONFIG.MAX_SPIN_LOSS, (baseSpinLoss * mAtkB) / mSpinDefA),
      spinDeltaB: -Math.min(CONFIG.MAX_SPIN_LOSS, (baseSpinLoss * mAtkA) / mSpinDefB),
    };

    // Let active/passive gimmicks reshape the impact (spin-steal, slam, guard).
    resolveContactAbilities(state, impact);

    // A is pushed along +normal, B along -normal (purely radial = no rolling).
    _impulse.set(nx * impact.impulseA, 0, nz * impact.impulseA);
    bodyA.applyImpulse(_impulse, bodyA.position);

    _impulse.set(-nx * impact.impulseB, 0, -nz * impact.impulseB);
    bodyB.applyImpulse(_impulse, bodyB.position);

    applySpinDelta(state, impact.sideA, impact.spinDeltaA, impact.bodyA);
    applySpinDelta(state, impact.sideB, impact.spinDeltaB, impact.bodyB);
  }

  return {
    resolve,
    resolveWallContacts,
    resolveWallClipSpin,
    // Kept for API compatibility with the engine's spawn/despawn calls.
    attach() {},
    detach() {},
  };
}
