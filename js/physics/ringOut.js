import { CONFIG } from '../config.js';
import { setBodyCollisions } from './top.js';

/**
 * Starts the ring-out slide: preserve exit momentum, nudge outward if slow.
 * No upward pop — the bey should carry its line off the stadium.
 */
export function beginRingOut(body) {
  if (!body || body.userData.ringOut) return;

  body.userData.ringOut = true;
  body.userData.ringOutT = 0;
  setBodyCollisions(body, false);

  const x = body.position.x;
  const z = body.position.z;
  const dist = Math.hypot(x, z) || 1;
  const nx = x / dist;
  const nz = z / dist;

  let vx = body.velocity.x;
  let vz = body.velocity.z;
  const radialOut = vx * nx + vz * nz;

  if (radialOut < CONFIG.RING_OUT_MIN_SPEED) {
    const boost = CONFIG.RING_OUT_MIN_SPEED - radialOut;
    vx += nx * boost;
    vz += nz * boost;
  } else {
    const scale = CONFIG.RING_OUT_SPEED_MULT;
    vx += nx * radialOut * (scale - 1);
    vz += nz * radialOut * (scale - 1);
  }

  body.velocity.x = vx;
  body.velocity.z = vz;
  if (body.velocity.y < 0) body.velocity.y = 0;
}

/** Platform slide + soft floor while ring-out is active. */
export function stepRingOutBodies(state) {
  for (const body of [state.playerBody, state.aiBody]) {
    if (!body?.userData.ringOut) continue;
    body.userData.ringOutT = (body.userData.ringOutT ?? 0) + CONFIG.FIXED_DT;

    const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const dist = Math.hypot(body.position.x, body.position.z);
    const onPlatform = dist + r <= CONFIG.PLATFORM_OUTER_RADIUS;
    body.collisionFilterMask = onPlatform ? CONFIG.COLLISION_BOWL : 0;

    const floorY = CONFIG.FLOOR_Y + r + CONFIG.FLOOR_EPSILON;
    if (onPlatform && body.position.y < floorY && body.velocity.y <= 0) {
      body.position.y = floorY;
      body.velocity.y = 0;
    }
  }
}

/** True once the bey has fallen off the white platform into the void. */
export function isRingOutFallen(body) {
  if (!body?.userData.ringOut) return false;

  const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const dist = Math.hypot(body.position.x, body.position.z);
  const offEdge = dist + r > CONFIG.PLATFORM_OUTER_RADIUS;

  if (body.position.y < CONFIG.PLATFORM_FALL_Y) return true;
  if (offEdge && body.position.y < CONFIG.FLOOR_Y + r * 0.4) return true;
  return false;
}

export function isRingOutCinematicDone(body, elapsed) {
  if (!body?.userData.ringOut) return true;
  if (isRingOutFallen(body)) return true;
  return elapsed >= CONFIG.RING_OUT_MAX_DUR;
}

export function clearRingOut(body) {
  if (!body) return;
  delete body.userData.ringOut;
  delete body.userData.ringOutT;
}
