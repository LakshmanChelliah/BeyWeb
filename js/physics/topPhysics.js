import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { staMult } from '../game/stats.js';
import {
  shouldApplyCenterPull,
  shouldPinTopToFloor,
  shouldSettleSleep,
  shouldStabilizeSpin,
} from '../game/bodyFlags.js';
import { clamp01 } from '../utils/math.js';

const _axisY = new CANNON.Vec3(0, 1, 0);

const SONIC_QUICKSAND_PULL_MULT = CONFIG.SONIC_QUICKSAND_PULL_MULT;

function bodyYaw(body) {
  const q = body.quaternion;
  const siny = 2 * (q.w * q.y + q.x * q.z);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny, cosy);
}

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

export function decaySpin(spin, dt, sta = 50, slowRate = 1) {
  const m = staMult(sta);
  const rateMult = slowRate > 1 ? slowRate : 1;
  const rate =
    spin > CONFIG.STABLE_SPIN
      ? CONFIG.SPIN_DECAY * 0.5 * m * rateMult
      : CONFIG.SPIN_DECAY * 2.4 * m * rateMult;
  return Math.max(0, spin - rate * dt);
}

/** Advance tip-over + sleep-out timers (server + shared sim; visuals read userData). */
export function stepSleepOutTimers(body, spin, dt) {
  if (!body) return;
  const dead = spin <= CONFIG.SPIN_STOPPED;
  if (!dead) {
    delete body.userData.tipAngle;
    delete body.userData.deathAnimT;
    delete body.userData.deathBaseSpin;
    delete body.userData.sleepOutDelay;
    return;
  }
  if (body.userData.deathAnimT == null) {
    body.userData.deathAnimT = 0;
  }
  body.userData.deathAnimT += dt;
  if (body.userData.deathAnimT >= CONFIG.DEATH_ANIM_DUR) {
    if (body.userData.sleepOutDelay == null) {
      body.userData.sleepOutDelay = CONFIG.SLEEP_OUT_DELAY;
    }
    body.userData.sleepOutDelay = Math.max(0, body.userData.sleepOutDelay - dt);
  }
}

export function launchSpinScale(launchGrace) {
  if (launchGrace <= 0) return 1;
  return 0.2 + 0.8 * (1 - launchGrace / CONFIG.LAUNCH_GRACE);
}

export function stabilizeTop(body, spinPct, spinSign, launchGrace) {
  if (!shouldStabilizeSpin(body)) return;
  const scaledSpin = spinPct * launchSpinScale(launchGrace);
  const targetRate = CONFIG.MAX_SPIN * scaledSpin * spinSign;

  const yaw = bodyYaw(body);
  body.quaternion.setFromAxisAngle(_axisY, yaw);
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

export function settleSleepingTop(body, spinPct) {
  if (!shouldSettleSleep(body)) return;

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

export function pinTopToFloor(body) {
  if (!shouldPinTopToFloor(body)) return;
  const radius = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const targetY = CONFIG.FLOOR_Y + radius + CONFIG.FLOOR_EPSILON;
  if (body.position.y < targetY) {
    body.position.y = targetY;
    if (body.velocity.y < 0) body.velocity.y = 0;
  }
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
    visualYOffset: CONFIG.TOP_HEIGHT * 0.5 - r,
  };

  world.addBody(body);
  return body;
}

export function applyCenterPull(body, spin) {
  if (!shouldApplyCenterPull(body) || spin < CONFIG.SLEEP_THRESHOLD) return;
  const x = body.position.x;
  const z = body.position.z;
  const r = Math.hypot(x, z);
  const slow = body.userData.sonicSlow ?? 0;
  const pull = body.userData.sonicPull ?? slow;
  if (r < 0.01 && slow <= 0) return;

  let strength = CONFIG.CENTER_PULL_FORCE * (r / CONFIG.ARENA_RADIUS);
  if (slow > 0) {
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
  const mask = state.launchGrace > 0 ? 0 : CONFIG.COLLISION_BOWL;
  for (const body of [state.playerBody, state.aiBody]) {
    if (!body) continue;
    body.collisionFilterMask = body.userData.collisionsDisabled ? 0 : mask;
  }
}

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
