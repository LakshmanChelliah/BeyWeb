import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { applySteerForce, computeSteerForce } from '../physics/steer.js';

const _force = new CANNON.Vec3();

/** Per-tier tuning — opponent index 0 is easiest; one tier per campaign stage. */
const AI_TIERS = [
  { forceMult: 0.82, decisionInterval: 0.32, specialReach: 4.2, powerReach: 6.5 },
  { forceMult: 1.0, decisionInterval: 0.22, specialReach: 5.0, powerReach: 8.0 },
  { forceMult: 1.12, decisionInterval: 0.18, specialReach: 5.8, powerReach: 8.5 },
  { forceMult: 1.22, decisionInterval: 0.14, specialReach: 6.8, powerReach: 9.5 },
];

let _tier = 1;
let _decisionT = 0;

function tierConfig() {
  return AI_TIERS[Math.min(_tier, AI_TIERS.length - 1)] ?? AI_TIERS[1];
}

function canTriggerSlot(slot, spin) {
  if (!slot?.ability) return false;
  return (
    slot.cooldownRemaining <= 0 &&
    !slot.active &&
    slot.windupRemaining <= 0 &&
    spin >= CONFIG.SLEEP_THRESHOLD
  );
}

export function setAIDifficulty(tier) {
  _tier = Math.max(0, Math.min(tier, AI_TIERS.length - 1));
}

export function resetAIController() {
  _decisionT = 0;
}

export function applyAISteering(aiBody, playerBody, spin) {
  if (!aiBody || !playerBody || spin < 0.05 || aiBody.userData.controlLocked) return;

  const { forceMult } = tierConfig();
  const aiForce = CONFIG.AI_FORCE * forceMult;

  const dx = playerBody.position.x - aiBody.position.x;
  const dz = playerBody.position.z - aiBody.position.z;
  applySteerForce(aiBody, dx, dz, spin, aiForce, { minSpin: 0.05 });

  const force = computeSteerForce(aiBody, spin, aiForce);
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

/** Periodically triggers CPU power/special when conditions are favorable. */
export function tickAIAbilities(state, onTrigger) {
  if (!state.abilities?.ai || state.launchGrace > 0 || !state.gameRunning || state.gameFrozen) {
    return;
  }

  const { decisionInterval, specialReach, powerReach } = tierConfig();

  _decisionT -= CONFIG.FIXED_DT;
  if (_decisionT > 0) return;
  _decisionT = decisionInterval;

  const spin = state.aiSpin;
  const aiBody = state.aiBody;
  const playerBody = state.playerBody;
  if (!aiBody || !playerBody || spin < CONFIG.SLEEP_THRESHOLD || aiBody.userData.controlLocked) {
    return;
  }

  const dx = playerBody.position.x - aiBody.position.x;
  const dz = playerBody.position.z - aiBody.position.z;
  const dist = Math.hypot(dx, dz);
  const playerSpin = state.playerSpin;
  const runtime = state.abilities.ai;

  const specialSlot = runtime.special;
  if (canTriggerSlot(specialSlot, spin)) {
    const useSpecial =
      (dist < specialReach && playerSpin < 0.4) ||
      dist < specialReach * 0.75 ||
      (dist < specialReach * 1.15 && spin > playerSpin + 0.12);
    if (useSpecial) {
      onTrigger('special');
      return;
    }
  }

  const powerSlot = runtime.power;
  if (canTriggerSlot(powerSlot, spin)) {
    const usePower = dist < powerReach && dist > 1.5 && spin > 0.22;
    if (usePower) onTrigger('power');
  }
}
