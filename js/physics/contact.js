import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { atkCombatMult, defMult, spinDefMult } from '../game/stats.js';
import {
  resolveContactAbilities,
  isLibraBusterChannelingBody,
  canTopsContactVertically,
  isBodyInSpecialMove,
} from '../game/abilities.js';
import { createCollisionSparkEmitter, isSpecialClash } from './collisionSparks.js';
import { isAtPocketAngle } from './arena.js';
import { clamp01 } from '../utils/math.js';

const _impulse = new CANNON.Vec3();

function wallSpinLossFromSpeed(speed) {
  const span = CONFIG.WALL_IMPACT_HARD - CONFIG.WALL_IMPACT_SOFT;
  const t = span > 0 ? clamp01((speed - CONFIG.WALL_IMPACT_SOFT) / span) : 1;
  return CONFIG.WALL_SPIN_LOSS_MIN + t * (CONFIG.WALL_SPIN_LOSS_MAX - CONFIG.WALL_SPIN_LOSS_MIN);
}

function topFromContact(contact) {
  if (contact.bi?.userData?.isTop) return contact.bi;
  if (contact.bj?.userData?.isTop) return contact.bj;
  return null;
}

function isWallContact(contact) {
  const top = topFromContact(contact);
  if (!top) return false;
  const other = top === contact.bi ? contact.bj : contact.bi;
  if (other?.type !== CANNON.Body.STATIC) return false;
  return Math.abs(contact.ni.y) < 0.45;
}

function sideOf(body) {
  if (body.userData.side) return body.userData.side;
  return body.userData.playerId === 1 ? 'player' : 'ai';
}

function outwardWallNormal(contact, top) {
  let nx = contact.ni.x;
  let nz = contact.ni.z;
  if (nx * top.position.x + nz * top.position.z < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz };
}

function computeClashFrame(bodyA, bodyB, dx, dz, dist2) {
  let nx;
  let nz;
  let dist;

  if (dist2 < 1e-6) {
    const relVx = bodyA.velocity.x - bodyB.velocity.x;
    const relVz = bodyA.velocity.z - bodyB.velocity.z;
    const relSpeed = Math.hypot(relVx, relVz);
    if (relSpeed > 1e-4) {
      nx = relVx / relSpeed;
      nz = relVz / relSpeed;
    } else {
      const storedNx = bodyA.userData.lastContactNx;
      const storedNz = bodyA.userData.lastContactNz;
      nx = storedNx ?? 1;
      nz = storedNz ?? 0;
    }
    dist = 0;
  } else {
    dist = Math.sqrt(dist2);
    nx = dx / dist;
    nz = dz / dist;
  }

  bodyA.userData.lastContactNx = nx;
  bodyA.userData.lastContactNz = nz;
  bodyB.userData.lastContactNx = -nx;
  bodyB.userData.lastContactNz = -nz;

  const relVx = bodyA.velocity.x - bodyB.velocity.x;
  const relVz = bodyA.velocity.z - bodyB.velocity.z;
  const closingSpeed = Math.max(0, -(relVx * nx + relVz * nz));

  return { nx, nz, dist, closingSpeed };
}

function separateTops(bodyA, bodyB, nx, nz, overlap) {
  if (bodyA.userData.anchoring && !bodyB.userData.anchoring) {
    bodyB.position.x -= nx * overlap;
    bodyB.position.z -= nz * overlap;
    return;
  }
  if (bodyB.userData.anchoring && !bodyA.userData.anchoring) {
    bodyA.position.x += nx * overlap;
    bodyA.position.z += nz * overlap;
    return;
  }
  const push = overlap * 0.5;
  bodyA.position.x += nx * push;
  bodyA.position.z += nz * push;
  bodyB.position.x -= nx * push;
  bodyB.position.z -= nz * push;
}

function applySpinDelta(state, side, delta, body) {
  if (!delta) return;
  const top = body ?? (side === 'player' ? state.playerBody : state.aiBody);
  if (delta < 0 && top?.userData?.invulnerable) return;
  if (delta < 0 && isLibraBusterChannelingBody(state, top)) {
    delta *= 0.1;
    if (!delta) return;
  }
  const key = side === 'player' ? 'playerSpin' : 'aiSpin';
  state[key] = Math.max(0, Math.min(1, state[key] + delta));
}

function buildImpact(bodyA, bodyB, closingSpeed) {
  const mAtkA = atkCombatMult(bodyA.userData.beyStats);
  const mDefA = defMult(bodyA.userData.beyStats);
  const mAtkB = atkCombatMult(bodyB.userData.beyStats);
  const mDefB = defMult(bodyB.userData.beyStats);
  const mSpinDefA = spinDefMult(bodyA.userData.beyStats);
  const mSpinDefB = spinDefMult(bodyB.userData.beyStats);
  const reducedMass = (bodyA.mass * bodyB.mass) / (bodyA.mass + bodyB.mass);
  const baseImpulse =
    Math.max(CONFIG.MIN_KNOCKBACK, closingSpeed * CONFIG.KNOCKBACK_SCALE) * reducedMass;
  const baseSpinLoss = Math.min(
    CONFIG.MAX_SPIN_LOSS,
    Math.max(CONFIG.MIN_SPIN_LOSS, closingSpeed * CONFIG.SPIN_LOSS_SCALE)
  );

  return {
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
}

function applyImpact(impact, nx, nz) {
  _impulse.set(nx * impact.impulseA, 0, nz * impact.impulseA);
  impact.bodyA.applyImpulse(_impulse, impact.bodyA.position);
  _impulse.set(-nx * impact.impulseB, 0, -nz * impact.impulseB);
  impact.bodyB.applyImpulse(_impulse, impact.bodyB.position);
}

/**
 * Custom 2D disc collision for bey-vs-bey, run once per physics step.
 * Spark emission is delegated to collisionSparks.js via createCollisionSparkEmitter.
 */
export function setupContactHandlers(world, getState, spawnImpact) {
  let clashCooldown = 0;
  let clashSparkTimer = 0;
  const wallCooldown = { player: 0, ai: 0 };
  const wallSparkTimer = { player: 0, ai: 0 };
  const sparks = createCollisionSparkEmitter(getState, spawnImpact);
  const sustainInterval = () => CONFIG.COLLISION_SPARK_SUSTAIN_INTERVAL;

  function tickClashSpark(bodyA, bodyB, nx, nz, closingSpeed, special) {
    if (clashSparkTimer > 0) return;
    clashSparkTimer = sustainInterval();
    sparks.clash(bodyA, bodyB, nx, nz, closingSpeed, special, true);
  }

  function tickWallSpark(body, impactSpeed, nx, nz) {
    const state = getState();
    const side = sideOf(body);
    if (wallSparkTimer[side] > 0) return;
    wallSparkTimer[side] = sustainInterval();
    const special = isBodyInSpecialMove(body, state);
    const speed = Math.max(impactSpeed, CONFIG.COLLISION_SPARK_BASELINE_SPEED * (special ? 0.5 : 0.35));
    sparks.wall(body, speed, nx, nz, true);
  }

  function emitWallImpact(body, impactSpeed, nx, nz) {
    const state = getState();
    if (state.launchGrace > 0) return;
    if (!body || body.userData.collisionsDisabled || body.userData.ringOut) return;

    const special = isBodyInSpecialMove(body, state);
    const canApplySpin =
      !body.userData.airborne &&
      !body.userData.invulnerable &&
      !body.userData.anchoring &&
      !isLibraBusterChannelingBody(state, body) &&
      impactSpeed >= CONFIG.WALL_IMPACT_SOFT;

    const side = sideOf(body);
    const cooled = wallCooldown[side] > 0;

    if (canApplySpin && !cooled) {
      applySpinDelta(state, side, -wallSpinLossFromSpeed(impactSpeed));
      wallCooldown[side] = CONFIG.WALL_IMPACT_COOLDOWN;
      sparks.wall(body, impactSpeed, nx, nz, false);
      wallSparkTimer[side] = sustainInterval();
      return;
    }

    if (special && !cooled && impactSpeed > 0) {
      wallCooldown[side] = CONFIG.WALL_IMPACT_COOLDOWN;
      sparks.wall(body, impactSpeed, nx, nz, false);
      wallSparkTimer[side] = sustainInterval();
    }
  }

  function resolveWallContacts(state, dt) {
    if (state.launchGrace > 0) return;

    wallCooldown.player = Math.max(0, wallCooldown.player - dt);
    wallCooldown.ai = Math.max(0, wallCooldown.ai - dt);
    wallSparkTimer.player = Math.max(0, wallSparkTimer.player - dt);
    wallSparkTimer.ai = Math.max(0, wallSparkTimer.ai - dt);

    for (const contact of world.contacts) {
      if (!isWallContact(contact)) continue;
      const top = topFromContact(contact);
      if (!top || top.userData.collisionsDisabled || top.userData.ringOut) continue;
      const impactSpeed = Math.abs(contact.getImpactVelocityAlongNormal());
      const { nx, nz } = outwardWallNormal(contact, top);
      emitWallImpact(top, impactSpeed, nx, nz);
      tickWallSpark(top, impactSpeed, nx, nz);
    }
  }

  function resolveWallClipSpin(state, bodyA, bodyB) {
    if (state.launchGrace > 0) return;

    for (const body of [bodyA, bodyB]) {
      if (!body || body.userData.collisionsDisabled) continue;
      const x = body.position.x;
      const z = body.position.z;
      const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const dist = Math.hypot(x, z);
      const maxR = CONFIG.WALL_RADIUS - r;
      if (dist <= 0.001) continue;
      if (isAtPocketAngle(Math.atan2(z, x), 1.5)) continue;

      const nx = x / dist;
      const nz = z / dist;
      const vOut = body.velocity.x * nx + body.velocity.z * nz;

      if (dist > maxR) {
        if (vOut > 0) emitWallImpact(body, vOut, nx, nz);
      } else if (dist >= maxR - 0.12) {
        const grindSpeed = Math.max(vOut, Math.hypot(body.velocity.x, body.velocity.z) * 0.35);
        tickWallSpark(body, grindSpeed, nx, nz);
      }
    }
  }

  function resolve(state, dt) {
    if (state.launchGrace > 0) return;

    const bodyA = state.playerBody;
    const bodyB = state.aiBody;
    if (!bodyA || !bodyB) return;
    if (bodyA.userData.collisionsDisabled || bodyB.userData.collisionsDisabled) return;

    if (clashCooldown > 0) clashCooldown = Math.max(0, clashCooldown - dt);
    clashSparkTimer = Math.max(0, clashSparkTimer - dt);

    const dx = bodyA.position.x - bodyB.position.x;
    const dz = bodyA.position.z - bodyB.position.z;
    const dist2 = dx * dx + dz * dz;
    const rA = bodyA.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const rB = bodyB.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const minDist = rA + rB;
    if (dist2 >= minDist * minDist) return;

    const verticalContact = canTopsContactVertically(bodyA, bodyB);
    const specialActive = isSpecialClash(state, bodyA, bodyB);
    if (!verticalContact && !specialActive) return;

    const { nx, nz, dist, closingSpeed } = computeClashFrame(bodyA, bodyB, dx, dz, dist2);

    if (!verticalContact) {
      if (clashCooldown > 0) {
        tickClashSpark(bodyA, bodyB, nx, nz, closingSpeed, true);
        return;
      }
      clashCooldown = CONFIG.IMPACT_COOLDOWN;
      sparks.clash(bodyA, bodyB, nx, nz, closingSpeed, true, false);
      clashSparkTimer = sustainInterval();
      return;
    }

    separateTops(bodyA, bodyB, nx, nz, minDist - dist);

    if (clashCooldown > 0) {
      tickClashSpark(bodyA, bodyB, nx, nz, closingSpeed, specialActive);
      return;
    }

    clashCooldown = CONFIG.IMPACT_COOLDOWN;

    const impact = buildImpact(bodyA, bodyB, closingSpeed);
    resolveContactAbilities(state, impact);
    applyImpact(impact, nx, nz);
    applySpinDelta(state, impact.sideA, impact.spinDeltaA, impact.bodyA);
    applySpinDelta(state, impact.sideB, impact.spinDeltaB, impact.bodyB);
    sparks.clash(bodyA, bodyB, nx, nz, closingSpeed, specialActive, false);
    clashSparkTimer = sustainInterval();
  }

  return {
    resolve,
    resolveWallContacts,
    resolveWallClipSpin,
    emitWallImpact,
  };
}
