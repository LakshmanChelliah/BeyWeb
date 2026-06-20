import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { atkCombatMult, defMult, spinDefMult } from '../game/stats.js';
import {
  resolveContactAbilities,
  canTopsContactVertically,
} from '../game/abilities.js';
import { createCollisionSparkEmitter, isSpecialClash } from './collisionSparks.js';
import { topOuterRadius } from './arenaGeometry.js';

const _impulse = new CANNON.Vec3();

function sideOf(body) {
  if (body.userData.side) return body.userData.side;
  return body.userData.playerId === 1 ? 'player' : 'ai';
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
      nx = bodyA.userData.lastContactNx ?? 1;
      nz = bodyA.userData.lastContactNz ?? 0;
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

/** Custom 2D disc collision for bey-vs-bey, run once per physics step. */
export function createClashResolver(getState, sparks, applySpinDelta) {
  let clashCooldown = 0;
  let clashSparkTimer = 0;
  const sustainInterval = () => CONFIG.COLLISION_SPARK_SUSTAIN_INTERVAL;

  function tickClashSpark(bodyA, bodyB, nx, nz, closingSpeed, special) {
    if (clashSparkTimer > 0) return;
    clashSparkTimer = sustainInterval();
    sparks.clash(bodyA, bodyB, nx, nz, closingSpeed, special, true);
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
    const rA = topOuterRadius(bodyA);
    const rB = topOuterRadius(bodyB);
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

  return { resolve };
}

export { createCollisionSparkEmitter };
