import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { staMult } from '../game/stats.js';
import { isAtPocketAngle } from './arena.js';
import { clamp01 } from '../utils/math.js';

const _spinQuatA = new THREE.Quaternion();
const _spinQuatB = new THREE.Quaternion();
const _spinQuatC = new THREE.Quaternion();
const _spinEuler = new THREE.Euler();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

/** Center-pull scaling during Libra buster quicksand (see CONFIG.SONIC_QUICKSAND_PULL_MULT). */
const SONIC_QUICKSAND_PULL_MULT = CONFIG.SONIC_QUICKSAND_PULL_MULT;

function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

const TIP_OVER_RAD = (42 * Math.PI) / 180;

/** Spin-drain progress during wobble: 0 at WOBBLE_SPIN_START, 1 near spin-out. */
function wobbleBuild(t) {
  return Math.pow(clamp01(t), 3.15);
}

/** Extra-gentle ease for the tip-over blend. */
function tipEase(t) {
  return easeInOutCubic(Math.pow(clamp01(t), 1.75));
}

function lerpAngle(a, b, t) {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return a + d * clamp01(t);
}

/** Spinning-top orientation: precession → tilt → spin (Y–X–Y). */
function applyTopOrientation(group, spinYaw, precessionDir, tiltRad) {
  _spinQuatA.setFromAxisAngle(_axisY, precessionDir);
  _spinQuatB.setFromAxisAngle(_axisX, tiltRad);
  _spinQuatC.setFromAxisAngle(_axisY, spinYaw);
  group.quaternion.copy(_spinQuatA).multiply(_spinQuatB).multiply(_spinQuatC);
}

/** Contact point traces a small circle as the axis precesses. */
function applyPrecessionOrbit(group, body, tiltRad, precessionDir, strength) {
  if (strength <= 0.001 || tiltRad <= 0.001) return;
  const r = (body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS) * 0.32;
  const orbit = Math.sin(tiltRad) * r * strength;
  group.position.x += Math.cos(precessionDir) * orbit;
  group.position.z += Math.sin(precessionDir) * orbit;
}

/** Visual rotation speed multiplier — full rate until 60%, boosted during wobble. */
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

/** Clears death-wobble state when a bey respawns. */
export function resetTopWobble(body) {
  if (!body) return;
  delete body.userData.precessionAngle;
  delete body.userData.sleepOutDelay;
  delete body.userData.tipAngle;
  delete body.userData.deathAnimT;
  delete body.userData.lastWobbleAmp;
  delete body.userData.lastSpinMult;
  delete body.userData.deathBaseSpin;
  delete body.userData.ringOut;
  delete body.userData.ringOutT;
  delete body.userData.launching;
  delete body.userData.launchFloorY;
  delete body.userData.launchDropProgress;
}

/**
 * Decays spin each frame. Higher stamina (0–100) slows the decay rate.
 * See staMult in stats.js: sta=100 → 0.5×, sta=0 → 1.5×.
 */
export function decaySpin(spin, dt, sta = 50, slowRate = 1) {
  const m = staMult(sta);
  const rateMult = slowRate > 1 ? slowRate : 1;
  const rate =
    spin > CONFIG.STABLE_SPIN
      ? CONFIG.SPIN_DECAY * 0.5 * m * rateMult
      : CONFIG.SPIN_DECAY * 2.4 * m * rateMult;
  return Math.max(0, spin - rate * dt);
}

export function launchSpinScale(launchGrace) {
  if (launchGrace <= 0) return 1;
  return 0.2 + 0.8 * (1 - launchGrace / CONFIG.LAUNCH_GRACE);
}

export function stabilizeTop(body, spinPct, spinSign, launchGrace) {
  if (body?.userData?.bullFlipPhase || body?.userData?.ringOut) return;
  const scaledSpin = spinPct * launchSpinScale(launchGrace);
  const targetRate = CONFIG.MAX_SPIN * scaledSpin * spinSign;

  _spinEuler.setFromQuaternion(
    _spinQuatA.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    ),
    'YXZ'
  );
  body.quaternion.setFromEuler(0, _spinEuler.y, 0);
  body.angularVelocity.set(0, targetRate, 0);

  if (spinPct >= CONFIG.STABLE_SPIN) {
    body.fixedRotation = true;
    body.angularFactor.set(0, 1, 0);
    body.angularDamping = 0.02;
    return;
  }

  body.fixedRotation = false;
  body.angularFactor.set(0, 1, 0);
  body.angularDamping = 0.25 + (CONFIG.STABLE_SPIN - spinPct) * 6;
}

export function syncTopVisual(group, body, spinPct, visualYaw, dt, spinSign = 1) {
  const yOff = body.userData.visualYOffset ?? 0;
  const flightLift = body.userData.flightLift ?? 0;
  const flightTilt = body.userData.flightTilt ?? 0;
  const flightRoll = body.userData.flightRoll ?? 0;
  const flightOffsetX = body.userData.flightOffsetX ?? 0;
  const flightOffsetZ = body.userData.flightOffsetZ ?? 0;
  group.position.set(
    body.position.x + flightOffsetX,
    body.position.y + yOff + flightLift,
    body.position.z + flightOffsetZ
  );

  const scaleBoost = 1 + Math.min(0.35, (flightLift / 38) * 0.35);
  // Squash & stretch along the bey's spin axis (local Y). >1 stretches tall,
  // <1 flattens; keep XZ volume-ish so contacts read as a real impact.
  const squash = body.userData.flightSquash ?? 1;
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

  // Hold yaw during cinematic moves (abilities, bull-flip knockdown, etc.).
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

  const dead = spinPct <= CONFIG.SPIN_STOPPED;
  const wobbleActive =
    !inCinematic && !dead &&
    spinPct <= CONFIG.WOBBLE_SPIN_START &&
    spinPct > CONFIG.SPIN_STOPPED;

  if (wobbleActive) {
    if (body.userData.precessionAngle == null) {
      body.userData.precessionAngle = Math.random() * Math.PI * 2;
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
    if (body.userData.deathAnimT == null) {
      body.userData.deathAnimT = 0;
      body.userData.tipAngle = body.userData.precessionAngle ?? Math.random() * Math.PI * 2;
      body.userData.deathBaseSpin = body.userData.lastSpinMult ?? 0.55;
      if (body.userData.precessionAngle == null) {
        body.userData.precessionAngle = body.userData.tipAngle;
      }
    }
    body.userData.deathAnimT += dt;

    const animDur = CONFIG.DEATH_ANIM_DUR;
    const animT = Math.min(body.userData.deathAnimT, animDur);
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

    if (body.userData.deathAnimT >= animDur) {
      tipGrow = 1;
      precessionDir = body.userData.tipAngle;
      tiltRad = TIP_OVER_RAD;
      orbitStrength = 0;
      if (body.userData.sleepOutDelay == null) {
        body.userData.sleepOutDelay = CONFIG.SLEEP_OUT_DELAY;
      }
      body.userData.sleepOutDelay = Math.max(0, body.userData.sleepOutDelay - dt);
    }
  } else {
    delete body.userData.tipAngle;
    delete body.userData.deathAnimT;
    delete body.userData.deathBaseSpin;
    delete body.userData.sleepOutDelay;
    if (!wobbleActive) {
      delete body.userData.precessionAngle;
      delete body.userData.lastWobbleAmp;
      delete body.userData.lastSpinMult;
    }
  }

  if (body.userData.starPhase !== 'dive') {
    let spinMult = 0;
    if (dead && body.userData.deathAnimT < CONFIG.DEATH_ANIM_DUR) {
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

export function clampLaunchSpeed(body, launchGrace) {
  if (launchGrace <= 0) return;
  const t = 1 - launchGrace / CONFIG.LAUNCH_GRACE;
  const maxSpeed = Math.max(CONFIG.LAUNCH_INWARD_SPEED, 2 + t * 14);
  const vx = body.velocity.x;
  const vz = body.velocity.z;
  const speed = Math.hypot(vx, vz);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    body.velocity.x = vx * scale;
    body.velocity.z = vz * scale;
  }
}

function syncBodyY(body, y) {
  body.position.y = y;
  body.previousPosition.y = y;
  body.velocity.y = 0;
}

/** Snaps a bey to the floor and clears launch state for normal physics. */
export function finishLaunchDrop(body) {
  if (!body?.userData.launching) return;
  const floorY = body.userData.launchFloorY ?? topFloorY(body);
  syncBodyY(body, floorY);
  body.previousPosition.x = body.position.x;
  body.previousPosition.z = body.position.z;
  delete body.userData.launching;
  delete body.userData.launchFloorY;
  delete body.userData.launchDropProgress;
}

function topFloorY(body) {
  const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  return CONFIG.FLOOR_Y + r + CONFIG.FLOOR_EPSILON;
}

/** Elevates a freshly spawned bey and gives it inward launch velocity. */
export function beginLaunchDrop(body) {
  if (!body) return;
  const floorY = topFloorY(body);
  body.userData.launching = true;
  body.userData.launchFloorY = floorY;
  body.userData.launchDropProgress = 0;
  const startY = floorY + CONFIG.LAUNCH_DROP_HEIGHT;
  body.position.y = startY;
  body.previousPosition.y = startY;
  body.velocity.y = 0;

  const x = body.position.x;
  const z = body.position.z;
  const dist = Math.hypot(x, z);
  if (dist > 0.01) {
    const speed = CONFIG.LAUNCH_INWARD_SPEED;
    body.velocity.x = (-x / dist) * speed;
    body.velocity.z = (-z / dist) * speed;
  } else {
    body.velocity.x = 0;
    body.velocity.z = 0;
  }
}

/** Scripted ease-in drop during launch grace; clears launching when landed. */
export function stepLaunchDrop(body, launchGrace) {
  if (!body) return;
  if (launchGrace <= 0) {
    finishLaunchDrop(body);
    return;
  }
  if (!body.userData.launching) return;

  const floorY = body.userData.launchFloorY ?? topFloorY(body);
  const startY = floorY + CONFIG.LAUNCH_DROP_HEIGHT;
  const t = clamp01(1 - launchGrace / CONFIG.LAUNCH_GRACE);
  const ease = t * t * t;
  body.userData.launchDropProgress = ease;
  syncBodyY(body, startY + (floorY - startY) * ease);

  if (body.position.y <= floorY + 0.001) {
    finishLaunchDrop(body);
  }
}

/** Bleeds XZ drift as spin runs out; fully locks once spin hits 0%. */
export function settleSleepingTop(body, spinPct) {
  if (!body || body.userData.airborne || body.userData.bullFlipPhase) return;

  if (spinPct <= CONFIG.SPIN_STOPPED) {
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    return;
  }

  if (spinPct <= CONFIG.WOBBLE_SPIN_START) {
    body.velocity.x *= 0.82;
    body.velocity.z *= 0.82;
    const speed = Math.hypot(body.velocity.x, body.velocity.z);
    if (speed < 0.12) {
      body.velocity.x = 0;
      body.velocity.z = 0;
    }
  }
}

/** Keeps flat-disc tops resting on the arena floor */
export function pinTopToFloor(body) {
  if (body.userData.airborne || body.userData.bullFlipPhase || body.userData.ringOut || body.userData.launching) return;
  const radius = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const targetY = CONFIG.FLOOR_Y + radius + CONFIG.FLOOR_EPSILON;
  if (body.position.y < targetY) {
    body.position.y = targetY;
    if (body.velocity.y < 0) body.velocity.y = 0;
  }
}

/**
 * Refits the physics shape to a sphere matching the model's outer disc radius.
 * Sphere-based collision is the most stable narrow-phase in cannon-es.
 * Because the sphere sits with its centre well above the floor, the visual model
 * is offset downward (visualYOffset) so its bottom edge rests on the floor while
 * the XZ of the visual and the sphere remain aligned — collision fires exactly
 * when the visible disc circumferences meet.
 */
export function fitColliderToModel(body, modelHolder) {
  const box = new THREE.Box3().setFromObject(modelHolder);
  const size = box.getSize(new THREE.Vector3());
  const outerRadius = Math.max(size.x, size.z) * 0.5 * CONFIG.COLLIDER_INSET;

  while (body.shapes.length > 0) {
    body.removeShape(body.shapes[0], body.shapeOffsets[0], body.shapeOrientations[0]);
  }

  body.addShape(new CANNON.Sphere(outerRadius));
  body.userData.outerRadius = outerRadius;
  // Shift visual down so its bottom sits at floor level while XZ matches the sphere.
  body.userData.visualYOffset = size.y * 0.5 - outerRadius;
  const floorY = CONFIG.FLOOR_Y + outerRadius + CONFIG.FLOOR_EPSILON;
  if (body.userData.launching) {
    body.userData.launchFloorY = floorY;
    const progress = body.userData.launchDropProgress ?? 0;
    const startY = floorY + CONFIG.LAUNCH_DROP_HEIGHT;
    syncBodyY(body, startY + (floorY - startY) * progress);
  } else {
    body.position.y = floorY;
  }
  return outerRadius;
}

export function createTopPhysicsBody(world, topMaterial, x, z, collisionGroup, playerId) {
  const r = CONFIG.DEFAULT_OUTER_RADIUS;
  const body = new CANNON.Body({
    mass: CONFIG.TOP_MASS,
    material: topMaterial,
    shape: new CANNON.Sphere(r),
  });

  body.collisionFilterGroup = collisionGroup;
  body.collisionFilterMask = CONFIG.COLLISION_BOWL;
  body.position.set(x, CONFIG.FLOOR_Y + r + CONFIG.FLOOR_EPSILON, z);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.linearDamping = CONFIG.LINEAR_DAMPING;
  body.angularDamping = 0.2;
  body.userData = {
    isTop: true,
    playerId,
    outerRadius: r,
    // Default offset before the model loads: visual bottom flush with floor.
    visualYOffset: CONFIG.TOP_HEIGHT * 0.5 - r,
  };

  world.addBody(body);
  return body;
}

/**
 * Applies a gentle inward force proportional to distance from centre,
 * simulating the curved bowl of a real Beyblade stadium.
 * Force scales from zero at the centre to CENTER_PULL_FORCE at the rim.
 */
export function applyCenterPull(body, spin) {
  if (!body || spin < CONFIG.SLEEP_THRESHOLD) return;
  if (body.userData.airborne || body.userData.ringOut) return;
  const x = body.position.x;
  const z = body.position.z;
  const r = Math.hypot(x, z);
  const slow = body.userData.sonicSlow ?? 0;
  const pull = body.userData.sonicPull ?? slow;
  if (r < 0.01 && slow <= 0) return;

  let strength = CONFIG.CENTER_PULL_FORCE * (r / CONFIG.ARENA_RADIUS);
  if (slow > 0) {
    // Quicksand: minimum inward suck even at the pit center; scales up with depth in sand.
    const depthPull = CONFIG.CENTER_PULL_FORCE * (0.3 + pull * 0.7);
    strength = Math.max(strength, depthPull);
    strength *= 1 + pull * SONIC_QUICKSAND_PULL_MULT;
  }

  const pullR = r < 0.12 ? 0.12 : r;
  body.applyForce(
    new CANNON.Vec3((-x / pullR) * strength, 0, (-z / pullR) * strength),
    body.position
  );
}

export function updateTopCollisions(state) {
  // Tops only ever collide with the bowl/walls in cannon-es. Bey-vs-bey is
  // handled by the custom 2D resolver (resolveTopContact) so cannon never
  // applies the tangential contact that made spinning tops roll around
  // each other. During launch grace all collisions are off.
  const mask = state.launchGrace > 0 ? 0 : CONFIG.COLLISION_BOWL;
  for (const body of [state.playerBody, state.aiBody]) {
    if (!body) continue;
    body.collisionFilterMask = body.userData.collisionsDisabled ? 0 : mask;
  }
}

/** Toggle cannon bowl/wall collisions for a top (bey-vs-bey is handled separately). */
export function setBodyCollisions(body, enabled) {
  if (!body) return;
  const on = !!enabled;
  if (!!body.userData.collisionsDisabled === !on) return;
  body.userData.collisionsDisabled = !on;
  body.collisionFilterMask = on ? CONFIG.COLLISION_BOWL : 0;
}

export function settleSpawnedTops(world, state) {
  for (let i = 0; i < 16; i++) {
    if (state.playerBody) {
      stabilizeTop(state.playerBody, 0.15, 1, state.launchGrace);
      pinTopToFloor(state.playerBody);
    }
    if (state.aiBody) {
      stabilizeTop(state.aiBody, 0.15, -0.95, state.launchGrace);
      pinTopToFloor(state.aiBody);
    }
    world.step(CONFIG.FIXED_DT);
  }

  if (state.playerBody) {
    state.playerBody.velocity.set(0, 0, 0);
    stabilizeTop(state.playerBody, 0.15, 1, state.launchGrace);
  }
  if (state.aiBody) {
    state.aiBody.velocity.set(0, 0, 0);
    stabilizeTop(state.aiBody, 0.15, -0.95, state.launchGrace);
  }
}

/**
 * Hard positional correction run after every physics step to stop beys from
 * tunnelling through the rim wall. Bey-vs-bey contact (separation + knockback)
 * is handled by the custom resolver in contact.js.
 */
export function resolveWallClipping(bodyA, bodyB, emitWallImpact) {
  for (const body of [bodyA, bodyB]) {
    if (!body || body.userData.collisionsDisabled || body.userData.ringOut || body.userData.launching) continue;
    const x = body.position.x;
    const z = body.position.z;
    const r = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
    const dist = Math.hypot(x, z);
    const maxR = CONFIG.WALL_RADIUS - r;
    if (dist > maxR && dist > 0.001) {
      if (!isAtPocketAngle(Math.atan2(z, x), 1.5)) {
        const scale = maxR / dist;
        body.position.x = x * scale;
        body.position.z = z * scale;
        // Kill any outward radial velocity to stop beys tunnelling on the next step.
        const nx = x / dist;
        const nz = z / dist;
        const vOut = body.velocity.x * nx + body.velocity.z * nz;
        if (vOut > 0) {
          emitWallImpact?.(body, vOut, nx, nz);
          body.velocity.x -= vOut * nx;
          body.velocity.z -= vOut * nz;
        }
      }
    }
  }
}
