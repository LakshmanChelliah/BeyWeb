import { CONFIG } from '../config.js';

/** Visual rim mesh radius — matches render/arena.js `radius`. */
export const ARENA_MESH_WALL_R = CONFIG.WALL_RADIUS + 0.1;
/** Inner dish-facing radius of the navy wedge (render/arena.js wedge innerX = 0.62). */
export const WALL_INNER_R = ARENA_MESH_WALL_R - 0.62;
export const WALL_SPARK_INSET = 0.07;
export const WALL_SPARK_MAX_R = WALL_INNER_R - 0.04;
export const WALL_CLIP_NEAR_MARGIN = 0.12;

/** Pocket-angle tolerance multipliers used across physics, abilities, and AI. */
export const POCKET_TOLERANCE = Object.freeze({
  clip: 1,
  spin: 1,
  ability: 1.15,
  ai: 1.35,
  aiEscape: 1.05,
});

export function topOuterRadius(body) {
  return body?.userData?.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
}

/** Returns true when angle is within a KO pocket gap. */
export function isAtPocketAngle(angle, toleranceMult = 1) {
  for (const pocket of CONFIG.POCKET_ANGLES) {
    let delta = Math.abs(angle - pocket);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta <= CONFIG.POCKET_HALF_WIDTH * toleranceMult) return true;
  }
  return false;
}

/** Returns true when a bey's center has exited through a KO pocket. */
export function isRingOut(x, z, outerRadius) {
  const r = Math.hypot(x, z);
  if (r < CONFIG.POCKET_EXIT_RADIUS) return false;
  return isAtPocketAngle(Math.atan2(z, x), POCKET_TOLERANCE.spin);
}

/** Returns true when a bey has left the white outer platform. */
export function isPlatformOut(x, z, outerRadius) {
  return Math.hypot(x, z) + outerRadius > CONFIG.PLATFORM_OUTER_RADIUS;
}

/** Returns true when bey is still inside the playable flat ring. */
export function isInsideRing(x, z, outerRadius) {
  return Math.hypot(x, z) + outerRadius < CONFIG.WALL_RADIUS;
}

/**
 * Max center radius for a top with disc radius `outerR`.
 * - collision: inner face of physics wall segments
 * - ability: dash / special target point (slightly inside visual rim)
 * - spark: arena-side inner rim for impact VFX
 */
export function playableCenterRadius(outerR, mode = 'collision') {
  switch (mode) {
    case 'ability':
      return CONFIG.WALL_RADIUS - outerR - 0.04;
    case 'spark':
      return WALL_INNER_R - WALL_SPARK_INSET;
    case 'collision':
    default:
      return CONFIG.WALL_RADIUS - CONFIG.WALL_SEGMENT_THICKNESS - outerR;
  }
}

/** Iterates each solid wall arc between KO pockets. */
export function iterateWallArcs(callback) {
  for (let i = 0; i < CONFIG.POCKET_ANGLES.length; i++) {
    const pocketStart = CONFIG.POCKET_ANGLES[i];
    const pocketEnd = CONFIG.POCKET_ANGLES[(i + 1) % CONFIG.POCKET_ANGLES.length];
    let wallStart = pocketStart + CONFIG.POCKET_HALF_WIDTH;
    let wallEnd = pocketEnd - CONFIG.POCKET_HALF_WIDTH;
    if (wallEnd < wallStart) wallEnd += Math.PI * 2;
    callback({ wallStart, wallEnd, span: wallEnd - wallStart, index: i });
  }
}

/** Nearest solid-wall meridian when `fromAngle` falls inside a KO pocket. */
export function nearestSolidWallAngle(fromAngle) {
  if (!isAtPocketAngle(fromAngle, POCKET_TOLERANCE.ability)) return fromAngle;

  let best = fromAngle;
  let bestDist = Infinity;
  iterateWallArcs(({ wallStart, wallEnd }) => {
    const mid = (wallStart + wallEnd) * 0.5;
    let delta = Math.abs(fromAngle - mid);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta < bestDist) {
      bestDist = delta;
      best = mid;
    }
  });
  return best;
}

/** Outward unit normal from arena center at (x, z), with optional override. */
export function outwardNormal(x, z, overrideNx, overrideNz) {
  if (overrideNx != null && overrideNz != null) {
    const len = Math.hypot(overrideNx, overrideNz) || 1;
    return { nx: overrideNx / len, nz: overrideNz / len };
  }
  const dist = Math.hypot(x, z) || 1;
  return { nx: x / dist, nz: z / dist };
}

/**
 * Wall spark point on the inner rim circle. Always uses the bey's radial meridian
 * so sparks stay on the wall where the disc meets it (segment normals are ignored
 * for position — they are not radial and would land on the wrong arc).
 */
export function innerRimContact(cx, cz, outerR = 0) {
  const dist = Math.hypot(cx, cz);
  if (dist <= 0.001) {
    return { x: 0, z: 0, nx: 0, nz: -1 };
  }
  const radNx = cx / dist;
  const radNz = cz / dist;
  const rimX = cx + radNx * outerR;
  const rimZ = cz + radNz * outerR;
  const angle = Math.atan2(rimZ, rimX);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const sparkR = playableCenterRadius(0, 'spark');
  return {
    x: cos * sparkR,
    z: sin * sparkR,
    nx: -cos,
    nz: -sin,
  };
}
