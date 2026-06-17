import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';

/** Returns true when angle is within a KO pocket gap (toleranceMult widens for wall-clip/spin-loss). */
export function isAtPocketAngle(angle, toleranceMult = 1) {
  for (const pocket of CONFIG.POCKET_ANGLES) {
    let delta = Math.abs(angle - pocket);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta <= CONFIG.POCKET_HALF_WIDTH * toleranceMult) return true;
  }
  return false;
}

/** Returns true when a bey's center has exited through a KO pocket (majority of bey outside) */
export function isRingOut(x, z, outerRadius) {
  const r = Math.hypot(x, z);
  if (r < CONFIG.POCKET_EXIT_RADIUS) return false;

  return isAtPocketAngle(Math.atan2(z, x), 1);
}

/** Returns true when a bey has left the white outer platform. */
export function isPlatformOut(x, z, outerRadius) {
  return Math.hypot(x, z) + outerRadius > CONFIG.PLATFORM_OUTER_RADIUS;
}

/** Returns true when bey is still inside the playable flat ring */
export function isInsideRing(x, z, outerRadius) {
  return Math.hypot(x, z) + outerRadius < CONFIG.WALL_RADIUS;
}

function addWallSegment(world, wallMaterial, angle, radius) {
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const wall = new CANNON.Body({ mass: 0, material: wallMaterial });
  wall.addShape(
    new CANNON.Box(
      new CANNON.Vec3(
        CONFIG.WALL_SEGMENT_THICKNESS,
        CONFIG.WALL_HEIGHT * 0.5,
        CONFIG.WALL_SEGMENT_THICKNESS
      )
    )
  );
  wall.position.set(x, CONFIG.WALL_HEIGHT * 0.5, z);
  wall.quaternion.setFromEuler(0, -angle, 0);
  wall.collisionFilterGroup = CONFIG.COLLISION_BOWL;
  world.addBody(wall);
  return wall;
}

/** Flat floor plus segmented rim walls with three KO pocket gaps */
export function createArenaPhysics(world, bowlMaterial, wallMaterial) {
  const floorBody = new CANNON.Body({ mass: 0, material: bowlMaterial });
  floorBody.addShape(new CANNON.Plane());
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  floorBody.position.set(0, CONFIG.FLOOR_Y, 0);
  floorBody.collisionFilterGroup = CONFIG.COLLISION_BOWL;
  world.addBody(floorBody);

  const wallBodies = [];
  for (let i = 0; i < CONFIG.POCKET_ANGLES.length; i++) {
    const pocketStart = CONFIG.POCKET_ANGLES[i];
    const pocketEnd = CONFIG.POCKET_ANGLES[(i + 1) % CONFIG.POCKET_ANGLES.length];
    let wallStart = pocketStart + CONFIG.POCKET_HALF_WIDTH;
    let wallEnd = pocketEnd - CONFIG.POCKET_HALF_WIDTH;
    if (wallEnd < wallStart) wallEnd += Math.PI * 2;

    const span = wallEnd - wallStart;
    for (let j = 0; j <= CONFIG.WALL_SEGMENTS_PER_ARC; j++) {
      const t = j / CONFIG.WALL_SEGMENTS_PER_ARC;
      const angle = wallStart + span * t;
      wallBodies.push(addWallSegment(world, wallMaterial, angle, CONFIG.WALL_RADIUS));
    }
  }

  return { floorBody, wallBodies, isRingOut, isInsideRing };
}
