import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { shouldBypassWallConstraint } from '../game/bodyFlags.js';
import { isLibraBusterChannelingBody, isBodyInSpecialMove } from '../game/abilities.js';
import {
  isAtPocketAngle,
  playableCenterRadius,
  POCKET_TOLERANCE,
  topOuterRadius,
  WALL_CLIP_NEAR_MARGIN,
} from './arenaGeometry.js';
import { clamp01 } from '../utils/math.js';

function syncBodyXZ(body, x, z) {
  body.position.x = x;
  body.position.z = z;
  body.previousPosition.x = x;
  body.previousPosition.z = z;
}

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

function outwardWallNormal(contact, top) {
  let nx = contact.ni.x;
  let nz = contact.ni.z;
  if (nx * top.position.x + nz * top.position.z < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { nx, nz };
}

function sideOf(body) {
  if (body.userData.side) return body.userData.side;
  return body.userData.playerId === 1 ? 'player' : 'ai';
}

/**
 * Hard positional correction after movement to stop beys tunnelling through rim gaps.
 * Bey-vs-bey separation is handled separately in clash.js.
 */
export function resolveWallClipping(bodyA, bodyB, emitWallImpact, dt = CONFIG.FIXED_DT) {
  for (const body of [bodyA, bodyB]) {
    if (shouldBypassWallConstraint(body)) continue;

    const x = body.position.x;
    const z = body.position.z;
    const r = topOuterRadius(body);
    const dist = Math.hypot(x, z);
    if (dist <= 0.001) continue;

    if (isAtPocketAngle(Math.atan2(z, x), POCKET_TOLERANCE.clip)) continue;

    const maxR = playableCenterRadius(r, 'collision');
    const nx = x / dist;
    const nz = z / dist;
    const vOut = body.velocity.x * nx + body.velocity.z * nz;
    const predDist = Math.hypot(x + body.velocity.x * dt, z + body.velocity.z * dt);
    const pastWall = dist > maxR;
    const willTunnel = predDist > maxR;
    const nearWall = dist > maxR - WALL_CLIP_NEAR_MARGIN;

    if (!pastWall && !willTunnel && !(nearWall && vOut > 0)) continue;

    if (pastWall) {
      const scale = maxR / dist;
      syncBodyXZ(body, x * scale, z * scale);
    }

    if (vOut > 0) {
      emitWallImpact?.(body, vOut, nx, nz);
      body.velocity.x -= vOut * nx;
      body.velocity.z -= vOut * nz;
    }
  }
}

/** Cannon contact + positional rim grind — spin loss and wall sparks. */
export function createWallHandlers(world, getState, sparks, applySpinDelta) {
  const wallCooldown = { player: 0, ai: 0 };
  const wallSparkTimer = { player: 0, ai: 0 };
  const sustainInterval = () => CONFIG.COLLISION_SPARK_SUSTAIN_INTERVAL;

  function tickWallSpark(body, impactSpeed, nx, nz) {
    const state = getState();
    const side = sideOf(body);
    if (wallSparkTimer[side] > 0) return;
    wallSparkTimer[side] = sustainInterval();
    const special = isBodyInSpecialMove(body, state);
    const speed = Math.max(
      impactSpeed,
      CONFIG.COLLISION_SPARK_BASELINE_SPEED * (special ? 0.5 : 0.35)
    );
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
      const r = topOuterRadius(body);
      const dist = Math.hypot(x, z);
      const maxR = playableCenterRadius(r, 'collision');
      if (dist <= 0.001) continue;
      if (isAtPocketAngle(Math.atan2(z, x), POCKET_TOLERANCE.clip)) continue;

      const nx = x / dist;
      const nz = z / dist;
      const vOut = body.velocity.x * nx + body.velocity.z * nz;

      if (dist > maxR) {
        if (vOut > 0) emitWallImpact(body, vOut, nx, nz);
      } else if (dist >= maxR - WALL_CLIP_NEAR_MARGIN) {
        const grindSpeed = Math.max(vOut, Math.hypot(body.velocity.x, body.velocity.z) * 0.35);
        tickWallSpark(body, grindSpeed, nx, nz);
      }
    }
  }

  return { resolveWallContacts, resolveWallClipSpin, emitWallImpact };
}
