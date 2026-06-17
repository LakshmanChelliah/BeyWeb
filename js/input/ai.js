import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { applySteerForce, computeSteerForce } from '../physics/steer.js';
import { isAtPocketAngle } from '../physics/arena.js';

const _force = new CANNON.Vec3();

/** Per-tier tuning — tier index 0 is easiest. */
const AI_TIERS = [
  { forceMult: 0.84, decisionInterval: 0.30, specialReach: 4.2, powerReach: 6.4, leadSkill: 0.15, edgeSkill: 0.55 },
  { forceMult: 0.98, decisionInterval: 0.23, specialReach: 5.0, powerReach: 7.4, leadSkill: 0.35, edgeSkill: 0.68 },
  { forceMult: 1.10, decisionInterval: 0.18, specialReach: 5.8, powerReach: 8.4, leadSkill: 0.52, edgeSkill: 0.80 },
  { forceMult: 1.22, decisionInterval: 0.14, specialReach: 6.6, powerReach: 9.4, leadSkill: 0.70, edgeSkill: 0.90 },
  { forceMult: 1.36, decisionInterval: 0.10, specialReach: 7.6, powerReach: 10.4, leadSkill: 0.85, edgeSkill: 1.0 },
];

export const AI_TIER_MAX = AI_TIERS.length - 1;

export const AI_DIFFICULTIES = Object.freeze([
  { tier: 0, label: 'Easy' },
  { tier: 1, label: 'Normal' },
  { tier: 2, label: 'Hard' },
  { tier: 3, label: 'Expert' },
  { tier: 4, label: 'Extreme' },
]);

export function getDifficultyLabel(tier) {
  return AI_DIFFICULTIES[Math.max(0, Math.min(tier, AI_TIER_MAX))]?.label ?? 'Normal';
}

let _tier = 1;
let _tournament = false;
let _steerDecisionT = 0;
let _abilityDecisionT = 0;
let _steerMode = 'chase';
let _orbitDir = 1;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function tierConfig() {
  return AI_TIERS[Math.min(_tier, AI_TIERS.length - 1)] ?? AI_TIERS[1];
}

/** Tournament opponents think one tier sharper without raw force spike. */
function decisionTier() {
  const bonus = _tournament ? 1 : 0;
  return Math.min(_tier + bonus, AI_TIER_MAX);
}

function decisionConfig() {
  return AI_TIERS[decisionTier()] ?? AI_TIERS[AI_TIER_MAX];
}

function edgeFracForBody(body) {
  const cr = Math.hypot(body.position.x, body.position.z);
  const outerR = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  return (cr + outerR * 0.45) / CONFIG.WALL_RADIUS;
}

function isNearPocket(body, toleranceMult = 1.35) {
  const cr = Math.hypot(body.position.x, body.position.z);
  if (cr < 0.01) return false;
  return isAtPocketAngle(Math.atan2(body.position.z, body.position.x), toleranceMult);
}

function analyzeBey(beyStats) {
  const move = beyStats?.move ?? beyStats?.atk ?? 50;
  const def = beyStats?.def ?? 50;
  const sta = beyStats?.sta ?? 50;
  return {
    move,
    def,
    sta,
    /** Attack / speed types chase harder — edge safety scales up to match their velocity. */
    aggression: clamp01((move - 38) / 58),
    caution: clamp01((def - 28) / 68),
    patience: clamp01((sta - 28) / 68),
  };
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

export function setAIContext({ tournament = false } = {}) {
  _tournament = Boolean(tournament);
}

export function resetAIController() {
  _steerDecisionT = 0;
  _abilityDecisionT = 0;
  _steerMode = 'chase';
  _orbitDir = Math.random() < 0.5 ? -1 : 1;
}

function pickSteerMode(persona, dist, spin, playerSpin, aiBody) {
  const skill = decisionTier() / AI_TIER_MAX;
  const edgeFrac = edgeFracForBody(aiBody);
  const inPocket = edgeFrac > 0.54 && isNearPocket(aiBody);

  if (inPocket || edgeFrac > 0.74) {
    return 'center';
  }

  if (edgeFrac > 0.62) {
    return dist < 3.2 && spin > 0.28 ? 'intercept' : 'center';
  }

  if (persona.aggression > 0.55) {
    if (edgeFrac > 0.52) return dist < 3.5 ? 'intercept' : 'center';
    return skill > 0.4 ? 'intercept' : 'chase';
  }

  if (persona.patience > 0.55) {
    if (dist > 6.5 && spin > 0.28) return skill > 0.35 ? 'orbit' : 'center';
    if (dist < 4.5 && playerSpin < spin + 0.08) return 'chase';
    return dist > 5 ? 'center' : 'chase';
  }

  if (persona.caution > 0.55) {
    if (dist > 6.5) return 'center';
    if (dist < 3.8 && spin > 0.25) return 'chase';
    return skill > 0.45 ? 'intercept' : 'center';
  }

  return skill > 0.4 ? 'intercept' : 'chase';
}

function computeChaseDir(aiBody, playerBody, leadSkill) {
  const ax = aiBody.position.x;
  const az = aiBody.position.z;
  const px = playerBody.position.x;
  const pz = playerBody.position.z;
  let tx = px;
  let tz = pz;

  if (leadSkill > 0.05) {
    const leadT = 0.14 + leadSkill * 0.32;
    tx += playerBody.velocity.x * leadT;
    tz += playerBody.velocity.z * leadT;
  }

  return { dx: tx - ax, dz: tz - az };
}

/** Blend chase toward center when rim-riding — stronger for fast beys that overshoot. */
function blendEdgeSafeDir(aiBody, dx, dz, persona) {
  const ax = aiBody.position.x;
  const az = aiBody.position.z;
  const cr = Math.hypot(ax, az);
  if (cr < 0.01) return { dx, dz };

  const edgeFrac = edgeFracForBody(aiBody);
  if (edgeFrac < 0.46) return { dx, dz };

  const { edgeSkill } = decisionConfig();
  const inPocket = edgeFrac > 0.54 && isNearPocket(aiBody);
  const edgeT = clamp01((edgeFrac - 0.46) / 0.34);

  let centerBlend = edgeT * (0.42 + edgeSkill * 0.38);
  if (persona.aggression > 0.5) {
    centerBlend += edgeT * (0.18 + persona.aggression * 0.22);
  }
  if (inPocket) {
    centerBlend = Math.max(centerBlend, 0.62 + edgeSkill * 0.28);
  }
  centerBlend = clamp01(centerBlend);

  const cx = (-ax / cr);
  const cz = (-az / cr);
  return {
    dx: dx * (1 - centerBlend) + cx * centerBlend,
    dz: dz * (1 - centerBlend) + cz * centerBlend,
  };
}

function computeSteerDir(aiBody, playerBody, persona) {
  const { leadSkill } = decisionConfig();
  const ax = aiBody.position.x;
  const az = aiBody.position.z;
  const cr = Math.hypot(ax, az) || 1;
  const dist = Math.hypot(
    playerBody.position.x - ax,
    playerBody.position.z - az
  );

  let dx;
  let dz;

  if (_steerMode === 'center') {
    const centerWeight = 0.72 + persona.caution * 0.22;
    const chase = computeChaseDir(aiBody, playerBody, leadSkill * 0.25);
    if (dist < 3.6 && edgeFracForBody(aiBody) < 0.58) {
      ({ dx, dz } = chase);
    } else {
      dx = -ax * centerWeight + chase.dx * (1 - centerWeight);
      dz = -az * centerWeight + chase.dz * (1 - centerWeight);
    }
  } else if (_steerMode === 'orbit') {
    const tangX = (-az / cr) * _orbitDir;
    const tangZ = (ax / cr) * _orbitDir;
    const pull = 0.22 + persona.patience * 0.24;
    if (dist < 4) {
      const chase = computeChaseDir(aiBody, playerBody, leadSkill * 0.5);
      dx = chase.dx * 0.6 + tangX * 0.4;
      dz = chase.dz * 0.6 + tangZ * 0.4;
    } else {
      dx = tangX + (-ax / cr) * pull;
      dz = tangZ + (-az / cr) * pull;
    }
  } else if (_steerMode === 'intercept') {
    ({ dx, dz } = computeChaseDir(aiBody, playerBody, leadSkill));
  } else {
    ({ dx, dz } = computeChaseDir(aiBody, playerBody, leadSkill * 0.2));
  }

  return blendEdgeSafeDir(aiBody, dx, dz, persona);
}

function applyEdgeSafety(aiBody, spin, aiForce, persona) {
  const ax = aiBody.position.x;
  const az = aiBody.position.z;
  const cr = Math.hypot(ax, az);
  if (cr < 0.01) return;

  const edgeFrac = edgeFracForBody(aiBody);
  if (edgeFrac < 0.48) return;

  const { edgeSkill } = decisionConfig();
  const inPocket = edgeFrac > 0.54 && isNearPocket(aiBody);

  const basePull = 0.38 + persona.caution * 0.42 + edgeSkill * 0.48;
  const speedComp = persona.aggression * (0.35 + edgeSkill * 0.4);
  const pocketUrgency = inPocket ? 1.55 + edgeSkill * 0.55 : 1;
  const edgeT = clamp01((edgeFrac - 0.48) / 0.36);
  const pull = edgeT * (basePull + speedComp) * pocketUrgency;

  const force = computeSteerForce(aiBody, spin, aiForce);
  _force.set((-ax / cr) * force * pull, 0, (-az / cr) * force * pull);
  aiBody.applyForce(_force, aiBody.position);

  if (inPocket || edgeFrac > 0.64) {
    const escape = (0.25 + edgeSkill * 0.55 + persona.aggression * 0.2) * (inPocket ? 1.35 : 0.85);
    const tangX = -az / cr;
    const tangZ = ax / cr;
    const pocketBias = isNearPocket(aiBody, 1.05) ? _orbitDir : -_orbitDir;
    _force.set(tangX * force * escape * 0.65 * pocketBias, 0, tangZ * force * escape * 0.65 * pocketBias);
    aiBody.applyForce(_force, aiBody.position);
  }
}

function tickSteerDecisions(aiBody, playerBody, spin, playerSpin) {
  const { decisionInterval } = decisionConfig();
  _steerDecisionT -= CONFIG.FIXED_DT;
  if (_steerDecisionT > 0) return;
  _steerDecisionT = decisionInterval * (0.9 + Math.random() * 0.18);

  const persona = analyzeBey(aiBody.userData.beyStats);
  const dist = Math.hypot(
    playerBody.position.x - aiBody.position.x,
    playerBody.position.z - aiBody.position.z
  );
  _steerMode = pickSteerMode(persona, dist, spin, playerSpin, aiBody);

  if (_steerMode === 'orbit' && Math.random() < 0.14) {
    _orbitDir *= -1;
  }
}

/** Fast beys need less raw steer near the rim — physics move mult already makes them quick. */
function steerForceScale(persona, aiBody) {
  const edgeFrac = edgeFracForBody(aiBody);
  if (persona.aggression < 0.45) return 1;
  if (edgeFrac > 0.58) return 0.72 - persona.aggression * 0.08;
  if (edgeFrac > 0.48) return 0.88 - persona.aggression * 0.06;
  return 1;
}

export function applyAISteering(aiBody, playerBody, spin, playerSpin = 1) {
  if (!aiBody || !playerBody || spin < 0.05 || aiBody.userData.controlLocked) return;

  tickSteerDecisions(aiBody, playerBody, spin, playerSpin);

  const { forceMult } = tierConfig();
  const persona = analyzeBey(aiBody.userData.beyStats);
  const aiForce = CONFIG.AI_FORCE * forceMult * steerForceScale(persona, aiBody);
  const { dx, dz } = computeSteerDir(aiBody, playerBody, persona);

  applySteerForce(aiBody, dx, dz, spin, aiForce, { minSpin: 0.05 });
  applyEdgeSafety(aiBody, spin, CONFIG.AI_FORCE * forceMult, persona);
}

/** Periodically triggers CPU power/special when conditions are favorable. */
export function tickAIAbilities(state, onTrigger) {
  if (!state.abilities?.ai || state.launchGrace > 0 || !state.gameRunning || state.gameFrozen) {
    return;
  }
  if (CONFIG.ABILITY_TEST_NO_DELAYS) return;

  const { decisionInterval, specialReach, powerReach } = decisionConfig();

  _abilityDecisionT -= CONFIG.FIXED_DT;
  if (_abilityDecisionT > 0) return;
  _abilityDecisionT = decisionInterval;

  const spin = state.aiSpin;
  const aiBody = state.aiBody;
  const playerBody = state.playerBody;
  if (!aiBody || !playerBody || spin < CONFIG.SLEEP_THRESHOLD || aiBody.userData.controlLocked) {
    return;
  }

  const persona = analyzeBey(aiBody.userData.beyStats);
  const ax = aiBody.position.x;
  const az = aiBody.position.z;
  const dx = playerBody.position.x - ax;
  const dz = playerBody.position.z - az;
  const dist = Math.hypot(dx, dz);
  const playerSpin = state.playerSpin;
  const runtime = state.abilities.ai;
  const aiEdge = edgeFracForBody(aiBody);
  const playerEdge = edgeFracForBody(playerBody);
  const aiInPocket = aiEdge > 0.54 && isNearPocket(aiBody);
  const aiRimDanger = aiEdge > 0.56 || aiInPocket;
  const playerClosing =
    playerBody.velocity.x * dx + playerBody.velocity.z * dz > 0.8;

  const specialSlot = runtime.special;
  if (canTriggerSlot(specialSlot, spin)) {
    let useSpecial =
      (dist < specialReach && playerSpin < 0.42) ||
      dist < specialReach * 0.72 ||
      (dist < specialReach * 1.1 && spin > playerSpin + 0.1);

    if (persona.caution > 0.5 && dist < specialReach && playerClosing) {
      useSpecial = true;
    }
    if (persona.aggression > 0.5 && dist < specialReach * 1.15 && playerEdge > 0.58 && !aiRimDanger) {
      useSpecial = true;
    }
    if (persona.patience > 0.55 && dist < specialReach * 0.9 && spin > 0.35) {
      useSpecial = true;
    }
    if (aiBody.userData.beyStats?.id === 'bull' && aiEdge > 0.58 && dist < specialReach * 1.15 && !aiInPocket) {
      useSpecial = true;
    }

    if (useSpecial && aiInPocket) {
      useSpecial = false;
    }

    if (useSpecial) {
      onTrigger('special');
      return;
    }
  }

  const powerSlot = runtime.power;
  if (canTriggerSlot(powerSlot, spin)) {
    let usePower = dist < powerReach && dist > 1.4 && spin > 0.2 && !aiRimDanger;

    if (persona.aggression > 0.5 && dist < powerReach * 1.1 && dist > 1.2 && !aiRimDanger) {
      usePower = true;
    }
    if (persona.patience > 0.5 && dist < powerReach * 0.85 && playerClosing && !aiRimDanger) {
      usePower = true;
    }
    if (persona.caution > 0.5 && dist < powerReach * 0.75 && playerClosing && spin > 0.3) {
      usePower = true;
    }

    if (usePower) onTrigger('power');
  }
}
