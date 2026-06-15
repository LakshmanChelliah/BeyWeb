import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { applySteerForce, computeSteerForce } from '../physics/steer.js';

const _force = new CANNON.Vec3();

export function applyAISteering(aiBody, playerBody, spin) {
  if (!aiBody || !playerBody || spin < 0.05 || aiBody.userData.controlLocked) return;

  const dx = playerBody.position.x - aiBody.position.x;
  const dz = playerBody.position.z - aiBody.position.z;
  applySteerForce(aiBody, dx, dz, spin, CONFIG.AI_FORCE, { minSpin: 0.05 });

  const force = computeSteerForce(aiBody, spin, CONFIG.AI_FORCE);
  const cr = Math.hypot(aiBody.position.x, aiBody.position.z);
  if (cr > CONFIG.ARENA_RADIUS * 0.65) {
    _force.set(
      (-aiBody.position.x / cr) * force * 0.45,
      0,
      (-aiBody.position.z / cr) * force * 0.45
    );
    aiBody.applyForce(_force, aiBody.position);
  }
}
