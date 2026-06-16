import { CONFIG } from '../config.js';
import { setBodyCollisions } from './top.js';

/** Starts the ring-out flight: outward pop + arc onto the marble platform. */
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
  const radialOut = body.velocity.x * nx + body.velocity.z * nz;
  const speed = Math.max(CONFIG.RING_OUT_MIN_SPEED, radialOut * CONFIG.RING_OUT_SPEED_MULT);
  body.velocity.x = nx * speed;
  body.velocity.z = nz * speed;
  body.velocity.y = CONFIG.RING_OUT_LAUNCH_UP;
}

/** Keeps ring-out beys on the platform floor until they cross the outer edge. */
export function stepRingOutBodies(state) {
  for (const body of [state.playerBody, state.aiBody]) {
    if (!body?.userData.ringOut) continue;
    body.userData.ringOutT = (body.userData.ringOutT ?? 0) + CONFIG.FIXED_DT;

    const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const dist = Math.hypot(body.position.x, body.position.z);
    const onPlatform = dist + r <= CONFIG.PLATFORM_OUTER_RADIUS;
    body.collisionFilterMask = onPlatform ? CONFIG.COLLISION_BOWL : 0;
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
