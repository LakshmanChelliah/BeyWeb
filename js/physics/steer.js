import * as CANNON from 'cannon-es';
import { moveSpeedMult } from '../game/stats.js';

const _force = new CANNON.Vec3();

export function computeSteerForce(body, spin, baseForce) {
  const steerMult = body.userData.steerMult ?? 1;
  return baseForce * spin * moveSpeedMult(body.userData.beyStats) * steerMult;
}

export function applySteerForce(
  body,
  dirX,
  dirZ,
  spin,
  baseForce,
  { minSpin = 0, skipKinematic = false, normalize = true } = {}
) {
  if (!body || spin < minSpin || body.userData.controlLocked) return;
  if (skipKinematic && body.type === CANNON.Body.KINEMATIC) return;
  if (dirX === 0 && dirZ === 0) return;

  const force = computeSteerForce(body, spin, baseForce);

  let fx;
  let fz;
  if (normalize) {
    const len = Math.hypot(dirX, dirZ);
    fx = (dirX / len) * force;
    fz = (dirZ / len) * force;
  } else {
    fx = dirX * force;
    fz = dirZ * force;
  }

  _force.set(fx, 0, fz);
  body.applyForce(_force, body.position);
}
