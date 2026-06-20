import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import {
  isRingOut,
  isInsideRing,
  iterateWallArcs,
} from './arenaGeometry.js';

export {
  isAtPocketAngle,
  isRingOut,
  isPlatformOut,
  isInsideRing,
  iterateWallArcs,
  nearestSolidWallAngle,
  playableCenterRadius,
  innerRimContact,
  POCKET_TOLERANCE,
  WALL_INNER_R,
  WALL_SPARK_MAX_R,
} from './arenaGeometry.js';

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
  iterateWallArcs(({ wallStart, span }) => {
    for (let j = 0; j <= CONFIG.WALL_SEGMENTS_PER_ARC; j++) {
      const t = j / CONFIG.WALL_SEGMENTS_PER_ARC;
      const angle = wallStart + span * t;
      wallBodies.push(addWallSegment(world, wallMaterial, angle, CONFIG.WALL_RADIUS));
    }
  });

  return { floorBody, wallBodies, isRingOut, isInsideRing };
}
