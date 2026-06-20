import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { clamp01 } from '../utils/math.js';
import { matchRandom } from '../utils/seededRng.js';
import {
  resetTopWobble,
  decaySpin,
  launchSpinScale,
  stabilizeTop,
  clampLaunchSpeed,
  finishLaunchDrop,
  beginLaunchDrop,
  stepLaunchDrop,
  settleSleepingTop,
  pinTopToFloor,
  createTopPhysicsBody,
  applyCenterPull,
  updateTopCollisions,
  setBodyCollisions,
  settleSpawnedTops,
  stepSleepOutTimers,
} from './topPhysics.js';

export {
  resetTopWobble,
  decaySpin,
  launchSpinScale,
  stabilizeTop,
  clampLaunchSpeed,
  finishLaunchDrop,
  beginLaunchDrop,
  stepLaunchDrop,
  settleSleepingTop,
  pinTopToFloor,
  createTopPhysicsBody,
  applyCenterPull,
  updateTopCollisions,
  setBodyCollisions,
  settleSpawnedTops,
  stepSleepOutTimers,
};

const _spinQuatA = new THREE.Quaternion();
const _spinQuatB = new THREE.Quaternion();
const _spinQuatC = new THREE.Quaternion();
const _spinEuler = new THREE.Euler();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

const TIP_OVER_RAD = (42 * Math.PI) / 180;

function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function wobbleBuild(t) {
  return Math.pow(clamp01(t), 3.15);
}

function tipEase(t) {
  return easeInOutCubic(Math.pow(clamp01(t), 1.75));
}

function lerpAngle(a, b, t) {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return a + d * clamp01(t);
}

function applyTopOrientation(group, spinYaw, precessionDir, tiltRad) {
  _spinQuatA.setFromAxisAngle(_axisY, precessionDir);
  _spinQuatB.setFromAxisAngle(_axisX, tiltRad);
  _spinQuatC.setFromAxisAngle(_axisY, spinYaw);
  group.quaternion.copy(_spinQuatA).multiply(_spinQuatB).multiply(_spinQuatC);
}

function applyPrecessionOrbit(group, body, tiltRad, precessionDir, strength) {
  if (strength <= 0.001 || tiltRad <= 0.001) return;
  const r = (body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS) * 0.32;
  const orbit = Math.sin(tiltRad) * r * strength;
  group.position.x += Math.cos(precessionDir) * orbit;
  group.position.z += Math.sin(precessionDir) * orbit;
}

function getVisualSpinMult(spinPct, wobbleActive, dead) {
  if (dead) return 0;
  const slowStart = CONFIG.VISUAL_SPIN_SLOW_START;
  if (spinPct >= slowStart) return 1;

  if (wobbleActive) {
    const t = clamp01(spinPct / CONFIG.WOBBLE_SPIN_START);
    return 0.48 + t * 0.32;
  }

  const span = slowStart - CONFIG.WOBBLE_SPIN_START;
  const t = span > 0 ? clamp01((spinPct - CONFIG.WOBBLE_SPIN_START) / span) : 0;
  return 0.38 + t * 0.62;
}

function tiltFloorLift(body, tiltRad) {
  if (tiltRad <= 0.001) return 0;
  const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const h = Math.max(body.userData.visualYOffset ?? 0, CONFIG.TOP_HEIGHT * 0.25);
  return h * (1 - Math.cos(tiltRad)) + r * Math.sin(tiltRad) * 0.75;
}

export function syncTopVisual(group, body, spinPct, visualYaw, dt, spinSign = 1, state = null) {
  const yOff = body.userData.visualYOffset ?? 0;
  const flightLift = body.userData.flightLift ?? 0;
  const flightTilt = body.userData.flightTilt ?? 0;
  const flightRoll = body.userData.flightRoll ?? 0;
  const flightOffsetX = body.userData.flightOffsetX ?? 0;
  const flightOffsetZ = body.userData.flightOffsetZ ?? 0;
  group.position.x = body.position.x + flightOffsetX;
  group.position.z = body.position.z + flightOffsetZ;

  const dead = spinPct <= CONFIG.SPIN_STOPPED;
  const inAbilityMove = !!(
    body.userData.lionWall ||
    body.userData.lionWallWindup ||
    body.userData.anchoring ||
    body.userData.airborne ||
    body.userData.boosting ||
    body.userData.spinStealing ||
    body.userData.stampeding ||
    body.userData.starPhase != null ||
    body.userData.bullFlipPhase != null
  );

  const scaleBoost = 1 + Math.min(0.35, (flightLift / 38) * 0.35);
  let squash = body.userData.flightSquash ?? 1;
  if (dead && !inAbilityMove) squash = 1;
  const sy = scaleBoost * squash;
  const sxz = scaleBoost / Math.sqrt(squash > 0.0001 ? squash : 0.0001);
  group.scale.set(sxz, sy, sxz);

  const airborneVisual = flightLift > 1.2;
  if (group.userData._airborneVisual !== airborneVisual) {
    group.userData._airborneVisual = airborneVisual;
    group.traverse((child) => {
      if (child.isMesh) child.castShadow = !airborneVisual;
    });
  }

  const inCinematic =
    body.userData.bullFlipPhase != null ||
    flightLift > 0.5 ||
    Math.abs(flightTilt) > 0.05 ||
    Math.abs(flightRoll) > 0.05;

  let tiltX = flightTilt;
  let tiltZ = flightRoll;
  let usePrecession = false;
  let precessionDir = 0;
  let tiltRad = 0;
  let orbitStrength = 0;

  const wobbleActive =
    !inCinematic && !dead &&
    spinPct <= CONFIG.WOBBLE_SPIN_START &&
    spinPct > CONFIG.SPIN_STOPPED;

  const rnd = () => matchRandom(state);

  if (wobbleActive) {
    if (body.userData.precessionAngle == null) {
      body.userData.precessionAngle = rnd() * Math.PI * 2;
    }

    const t = clamp01(1 - spinPct / CONFIG.WOBBLE_SPIN_START);
    const build = wobbleBuild(t);
    const precessionRate = (0.85 + build * 3.2) * (1 + build * 1.4);
    body.userData.precessionAngle += precessionRate * dt;

    tiltRad = build * 0.38;
    body.userData.lastWobbleAmp = tiltRad;
    body.userData.lastSpinMult = getVisualSpinMult(spinPct, true, false);
    precessionDir = body.userData.precessionAngle;
    orbitStrength = build;
    usePrecession = true;
  }

  let tipGrow = 0;

  if (dead) {
    if (body.userData.tipAngle == null) {
      body.userData.tipAngle = body.userData.precessionAngle ?? rnd() * Math.PI * 2;
      body.userData.deathBaseSpin = body.userData.lastSpinMult ?? 0.55;
      if (body.userData.precessionAngle == null) {
        body.userData.precessionAngle = body.userData.tipAngle;
      }
    }

    const animDur = CONFIG.DEATH_ANIM_DUR;
    const animT = Math.min(body.userData.deathAnimT ?? 0, animDur);
    const wobbleWindow = animDur * 0.82;
    const wobbleFade =
      animT < wobbleWindow ? 1 - easeInOutCubic(Math.pow(animT / wobbleWindow, 1.2)) : 0;
    const tipStart = animDur * 0.58;
    const tipEnd = animDur * 0.97;
    tipGrow = tipEase((animT - tipStart) / (tipEnd - tipStart));

    const wobbleTilt = (body.userData.lastWobbleAmp ?? 0.38) * wobbleFade;
    const precessionRate = (0.7 + wobbleFade * 2.8) * (1 - tipGrow * 0.55);
    body.userData.precessionAngle += precessionRate * dt;

    precessionDir = lerpAngle(body.userData.precessionAngle, body.userData.tipAngle, tipGrow);
    tiltRad = wobbleTilt + TIP_OVER_RAD * tipGrow;
    orbitStrength = 0;
    usePrecession = true;

    if ((body.userData.deathAnimT ?? 0) >= animDur) {
      tipGrow = 1;
      precessionDir = body.userData.tipAngle;
      tiltRad = TIP_OVER_RAD;
      orbitStrength = 0;
    }
  } else {
    delete body.userData.tipAngle;
    delete body.userData.deathBaseSpin;
    if (!wobbleActive) {
      delete body.userData.precessionAngle;
      delete body.userData.lastWobbleAmp;
      delete body.userData.lastSpinMult;
    }
  }

  let tiltLiftY = 0;
  if (usePrecession && tiltRad > 0.001) {
    tiltLiftY = tiltFloorLift(body, tiltRad);
  }
  group.position.y = body.position.y + yOff + flightLift + tiltLiftY;

  if (body.userData.starPhase !== 'dive') {
    let spinMult = 0;
    if (dead && (body.userData.deathAnimT ?? 0) < CONFIG.DEATH_ANIM_DUR) {
      const base = body.userData.deathBaseSpin ?? 0.55;
      spinMult = base * (1 - tipGrow * 0.88);
    } else if (!dead) {
      spinMult = getVisualSpinMult(spinPct, wobbleActive, false);
      spinMult *= body.userData.sonicBusterVisualSpinMult ?? 1;
    }
    visualYaw += CONFIG.MAX_SPIN * spinMult * spinSign * dt;
  }

  if (inCinematic) {
    group.rotation.set(flightTilt, visualYaw, flightRoll);
    return visualYaw;
  }

  if (usePrecession) {
    applyTopOrientation(group, visualYaw, precessionDir, tiltRad);
    applyPrecessionOrbit(group, body, tiltRad, precessionDir, orbitStrength);
    return visualYaw;
  }

  group.rotation.set(tiltX, visualYaw, tiltZ);
  return visualYaw;
}

export function fitColliderToModel(body, modelHolder) {
  const box = new THREE.Box3().setFromObject(modelHolder);
  const size = box.getSize(new THREE.Vector3());
  const outerRadius = Math.max(size.x, size.z) * 0.5 * CONFIG.COLLIDER_INSET;

  while (body.shapes.length > 0) {
    body.removeShape(body.shapes[0], body.shapeOffsets[0], body.shapeOrientations[0]);
  }

  body.addShape(new CANNON.Sphere(outerRadius));
  body.userData.outerRadius = outerRadius;
  body.userData.visualYOffset = size.y * 0.5 - outerRadius;
  const floorY = CONFIG.FLOOR_Y + outerRadius + CONFIG.FLOOR_EPSILON;
  if (body.userData.launching) {
    body.userData.launchFloorY = floorY;
    const progress = body.userData.launchDropProgress ?? 0;
    const startY = floorY + CONFIG.LAUNCH_DROP_HEIGHT;
    body.position.y = startY + (floorY - startY) * progress;
    body.previousPosition.y = body.position.y;
  } else {
    body.position.y = floorY;
  }
  return outerRadius;
}
