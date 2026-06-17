import { CONFIG } from '../config.js';
import { isBodyInSpecialMove } from '../game/abilities.js';

const DEFAULT_COLOR = 0xffffff;

export function beySparkColor(body) {
  return body?.userData?.beyColor ?? DEFAULT_COLOR;
}

export function isSpecialClash(state, bodyA, bodyB) {
  return isBodyInSpecialMove(bodyA, state) || isBodyInSpecialMove(bodyB, state);
}

/** Maps impact speed to a baseline-heavy value used by the spark VFX scaler. */
export function sparkSpeedFromClash(bodyA, bodyB, closingSpeed) {
  const relVx = bodyA.velocity.x - bodyB.velocity.x;
  const relVz = bodyA.velocity.z - bodyB.velocity.z;
  const relSpeed = Math.hypot(relVx, relVz);
  return Math.max(closingSpeed, relSpeed, CONFIG.COLLISION_SPARK_BASELINE_SPEED);
}

export function sparkSpeedFromWall(impactSpeed, special) {
  const floor = CONFIG.COLLISION_SPARK_BASELINE_SPEED * (special ? 0.5 : 0.25);
  return Math.max(impactSpeed, floor);
}

/** Rim contact point + outward normal for wall sparks. */
export function rimSparkContact(body, nx, nz) {
  const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const dist = Math.hypot(body.position.x, body.position.z) || 1;
  const radialX = body.position.x / dist;
  const radialZ = body.position.z / dist;
  const rimDist = CONFIG.WALL_RADIUS - r * 0.2;
  return {
    x: radialX * rimDist,
    z: radialZ * rimDist,
    nx: nx ?? radialX,
    nz: nz ?? radialZ,
  };
}

/** Rim point on the face of `body` that touches the other bey. */
function clashRimPoint(body, nx, nz, sign) {
  const r = (body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS) * 0.92;
  return {
    x: body.position.x + nx * r * sign,
    z: body.position.z + nz * r * sign,
  };
}

/** Two mirrored bursts — one from each bey's rim, normals opposed 180°. */
export function buildClashSparkEvents(bodyA, bodyB, nx, nz, closingSpeed, special, sustained = false) {
  const speed = sparkSpeedFromClash(bodyA, bodyB, closingSpeed);
  const shared = { speed, kind: 'clash', special, sustained, countMult: 0.5 };
  const pointA = clashRimPoint(bodyA, nx, nz, -1);
  const pointB = clashRimPoint(bodyB, nx, nz, 1);
  const colorA = beySparkColor(bodyA);
  const colorB = beySparkColor(bodyB);

  return [
    {
      ...shared,
      x: pointA.x,
      z: pointA.z,
      nx,
      nz,
      colorA,
      colorB: colorA,
    },
    {
      ...shared,
      x: pointB.x,
      z: pointB.z,
      nx: -nx,
      nz: -nz,
      colorA: colorB,
      colorB,
    },
  ];
}

export function buildWallSparkEvent(body, impactSpeed, nx, nz, state, sustained = false) {
  const special = isBodyInSpecialMove(body, state);
  const contact = rimSparkContact(body, nx, nz);
  return {
    x: contact.x,
    z: contact.z,
    nx: contact.nx,
    nz: contact.nz,
    speed: sparkSpeedFromWall(impactSpeed, special),
    colorA: beySparkColor(body),
    kind: 'wall',
    special,
    sustained,
  };
}

/**
 * Thin adapter between physics contact handlers and collisionSparksVfx.spawn.
 * Keeps contact.js free of VFX payload details.
 */
export function createCollisionSparkEmitter(getState, spawn) {
  function emit(event) {
    if (spawn) spawn(event);
  }

  return {
    clash(bodyA, bodyB, nx, nz, closingSpeed, special, sustained = false) {
      if (!bodyA || !bodyB || bodyA.userData.ringOut || bodyB.userData.ringOut) return;
      for (const event of buildClashSparkEvents(
        bodyA,
        bodyB,
        nx,
        nz,
        closingSpeed,
        special,
        sustained
      )) {
        emit(event);
      }
    },
    wall(body, impactSpeed, nx, nz, sustained = false) {
      if (!body || body.userData.ringOut) return;
      emit(buildWallSparkEvent(body, impactSpeed, nx, nz, getState(), sustained));
    },
  };
}
