import { CONFIG } from '../config.js';
import { createPhysicsWorld } from '../physics/world.js';
import { createArenaPhysics } from '../physics/arena.js';
import { setupContactHandlers } from '../physics/contact.js';
import {
  createTopPhysicsBody,
  resetTopWobble,
  stabilizeTop,
  beginLaunchDrop,
  updateTopCollisions,
} from '../physics/top.js';
import { createGameState, resetRoundState } from './state.js';
import { createAbilityRuntime } from './abilities.js';
import { beyColorHex } from './beys.js';
import { createSeededRng, hashSeed } from '../utils/seededRng.js';
import { applySteerForce } from '../physics/steer.js';
import { triggerAbility as triggerAbilityCore } from './abilities.js';
import { stepSimulation } from './simulation.js';
import { decaySpin, stepSleepOutTimers } from '../physics/top.js';
import {
  cancelAbilitiesOnSpinStop,
  tickAbilityTimers,
  tickAbilityVisuals,
  tickLeoneAbilityVisuals,
  tickLdragoAbilityVisuals,
  tickLibraAbilityVisuals,
  tickBullAbilityVisuals,
} from './abilities.js';
import { evaluateWin } from './rules.js';
import { beginRingOut, isRingOutCinematicDone } from '../physics/ringOut.js';
import { clearAbilityFlags } from './abilities.js';

const STEER_OPTS = { minSpin: CONFIG.SLEEP_THRESHOLD, skipKinematic: true, normalize: false };

/** userData keys replicated to clients for VFX / abilities */
export const SYNC_USER_DATA_KEYS = [
  'outerRadius', 'visualYOffset', 'side', 'beyColor', 'playerId',
  'controlLocked', 'invulnerable', 'collisionsDisabled',
  'ringOut', 'ringOutT', 'launching', 'launchFloorY', 'launchDropProgress',
  'precessionAngle', 'tipAngle', 'deathAnimT', 'sleepOutDelay',
  'lastWobbleAmp', 'lastSpinMult', 'deathBaseSpin',
  'flightLift', 'flightTilt', 'flightRoll', 'flightOffsetX', 'flightOffsetZ', 'flightSquash',
  'steerMult', 'airborne', 'boosting', 'slamming', 'guarding',
  'anchoring', 'lionWall', 'lionWallWindup', 'lionWallT', 'lionWallBurstT',
  'lionWallReach', 'lionWallPulse', 'leoneAnchorT', 'contactLift',
  'spinStealing', 'spinStealT', 'spinStealBurstT', 'spinStealFromX', 'spinStealFromZ',
  'stampeding', 'stampedeT',
  'ldragoFlightWindup', 'ldragoFlightLaunchT', 'ldragoFlightRerising',
  'ldragoLightningCharging', 'flightRepulseT',
  'sonicSlow', 'sonicPull', 'sonicShieldBurstT', 'sonicBusterVisualSpinMult',
  'sonicShield', 'sonicShieldReach',
  'sonicBuster', 'sonicBusterWindup', 'sonicBusterReach', 'sonicBusterSpread',
  'sonicBusterFromX', 'sonicBusterFromZ',
  'starPhase', 'starPhaseT', 'starImpactFlash', 'starWallX', 'starWallZ', 'starWallNx', 'starWallNz',
  'starKnockbackVX', 'starKnockbackVZ', 'starBlastHit', 'starBlastResolved',
  'ldragoFlightT', 'ldragoLightningSpots', 'ldragoLightningFired',
  'bullFlipPhase', 'bullUpperPhase', 'bullUpperPhaseT', 'bullUpperSlamming', 'bullDashDone',
  'bullCoastNx', 'bullCoastNz', 'bullCoastTargetX', 'bullCoastTargetZ', 'bullCoastDist',
  'bullChargeFromX', 'bullChargeFromZ',
  'leoneGuardT', 'leoneGuardActive',
];

function stampBeyStats(body, bey, side) {
  body.userData.beyStats = {
    id: bey.id,
    atk: bey.atk ?? 50,
    move: bey.move ?? bey.atk ?? 50,
    def: bey.def ?? 50,
    sta: bey.sta ?? 50,
  };
  body.userData.beyColor = beyColorHex(bey.color);
  body.userData.side = side;
}

export function spawnRoundBodies(state, world, topMaterial) {
  if (state.playerBody) world.removeBody(state.playerBody);
  if (state.aiBody) world.removeBody(state.aiBody);

  resetRoundState(state);
  const spawnAngle = 0.7;

  state.playerBody = createTopPhysicsBody(
    world,
    topMaterial,
    -Math.cos(spawnAngle) * CONFIG.SPAWN_OFFSET,
    -Math.sin(spawnAngle) * CONFIG.SPAWN_OFFSET,
    CONFIG.COLLISION_PLAYER,
    1
  );
  state.aiBody = createTopPhysicsBody(
    world,
    topMaterial,
    Math.cos(spawnAngle) * CONFIG.SPAWN_OFFSET,
    Math.sin(spawnAngle) * CONFIG.SPAWN_OFFSET,
    CONFIG.COLLISION_AI,
    2
  );

  stampBeyStats(state.playerBody, state.playerBey, 'player');
  stampBeyStats(state.aiBody, state.aiBey, 'ai');

  resetTopWobble(state.playerBody);
  resetTopWobble(state.aiBody);
  state.abilities = {
    player: createAbilityRuntime(state.playerBey),
    ai: createAbilityRuntime(state.aiBey),
  };

  stabilizeTop(state.playerBody, 0.15, 1, state.launchGrace);
  stabilizeTop(state.aiBody, 0.15, -0.95, state.launchGrace);
  beginLaunchDrop(state.playerBody);
  beginLaunchDrop(state.aiBody);
  updateTopCollisions(state);
}

/**
 * Creates an authoritative match environment (no rendering).
 */
export function createMatchEnvironment({ playerBey, aiBey, seed }) {
  const matchSeed = seed ?? hashSeed(playerBey.id, aiBey.id, Date.now());
  const state = createGameState();
  state.playerBey = playerBey;
  state.aiBey = aiBey;
  state.rng = createSeededRng(matchSeed);
  state.matchSeed = matchSeed;
  state.gameRunning = true;

  const { world, topMaterial, bowlMaterial, wallMaterial } = createPhysicsWorld();
  createArenaPhysics(world, bowlMaterial, wallMaterial);

  const frameEvents = [];

  const contacts = setupContactHandlers(
    world,
    () => state,
    (event) => {
      frameEvents.push({
        type: 'collision_spark',
        x: event.x,
        z: event.z,
        nx: event.nx,
        nz: event.nz,
        speed: event.speed,
        colorA: event.colorA,
        colorB: event.colorB,
        special: event.special,
        sustained: event.sustained,
      });
    }
  );

  spawnRoundBodies(state, world, topMaterial);

  return {
    state,
    world,
    contacts,
    topMaterial,
    getFrameEvents: () => {
      const ev = frameEvents.slice();
      frameEvents.length = 0;
      return ev;
    },
  };
}

export function createRemoteInputAdapter(getSlotInputs) {
  return {
    applySteering(state) {
      const inputs = getSlotInputs();
      const p = inputs[0] ?? { steer: { x: 0, y: 0 } };
      const a = inputs[1] ?? { steer: { x: 0, y: 0 } };
      applySteerForce(
        state.playerBody,
        p.steer.x,
        p.steer.y,
        state.playerSpin,
        CONFIG.GYRO_FORCE,
        STEER_OPTS
      );
      applySteerForce(
        state.aiBody,
        a.steer.x,
        a.steer.y,
        state.aiSpin,
        CONFIG.GYRO_FORCE,
        STEER_OPTS
      );
    },
  };
}

/** Apply one-tick ability intents; returns ability_trigger events. */
export function applyAbilityIntents(state, slotInputs) {
  const events = [];
  const sides = ['player', 'ai'];
  for (let slot = 0; slot < 2; slot++) {
    const ability = slotInputs[slot]?.ability;
    if (!ability) continue;
    const side = sides[slot];
    const fired = triggerAbilityCore(state, side, ability);
    if (fired) {
      events.push({
        type: 'ability_trigger',
        side: slot,
        slot: ability,
        abilityId: fired.id,
        glow: fired.glow,
      });
    }
  }
  return events;
}

/**
 * One authoritative server tick. Returns { events, winResult, koDone }.
 */
export function serverTick({
  match,
  slotInputs,
  dt = CONFIG.FIXED_DT,
}) {
  const { state, world, contacts, getFrameEvents } = match;
  const events = [];

  if (state.launchGrace > 0) {
    state.launchGrace = Math.max(0, state.launchGrace - dt);
  }
  updateTopCollisions(state);

  events.push(...applyAbilityIntents(state, slotInputs));

  const input = createRemoteInputAdapter(() => slotInputs);
  stepSimulation({ state, world, contacts, input });

  const playerSandMult =
    state.playerBody?.userData.sonicSlow > 0 ? 2 : 1;
  const aiSandMult =
    state.aiBody?.userData.sonicSlow > 0 ? 2 : 1;

  state.playerSpin = state.playerBody?.userData.controlLocked
    ? state.playerSpin
    : decaySpin(state.playerSpin, dt, state.playerBey.sta ?? 50, playerSandMult);
  state.aiSpin = state.aiBody?.userData.controlLocked
    ? state.aiSpin
    : decaySpin(state.aiSpin, dt, state.aiBey.sta ?? 50, aiSandMult);

  stepSleepOutTimers(state.playerBody, state.playerSpin, dt);
  stepSleepOutTimers(state.aiBody, state.aiSpin, dt);

  cancelAbilitiesOnSpinStop(state, dt);
  tickAbilityTimers(state, dt);
  // Authoritative cinematic motion (Star Blast, Bull uppercut, etc.) — must run on server
  // so snapshots carry position/phase; clients only interpolate.
  tickAbilityVisuals(state, dt);
  tickLeoneAbilityVisuals(state, dt);
  tickLdragoAbilityVisuals(state, dt);
  tickLibraAbilityVisuals(state, dt);
  tickBullAbilityVisuals(state, dt);

  events.push(...getFrameEvents());

  let winResult = null;
  if (!state.pendingKo) {
    const result = evaluateWin(state);
    if (result?.cinematic) {
      state.pendingKo = { ...result, elapsed: 0 };
      const loserBody = result.loser === 1 ? state.playerBody : state.aiBody;
      clearAbilityFlags(loserBody);
      beginRingOut(loserBody);
      events.push({ type: 'round_pending_ko', winner: result.winner, loser: result.loser });
    } else if (result) {
      winResult = result;
    }
  } else {
    state.pendingKo.elapsed += dt;
    const loserBody =
      state.pendingKo.loser === 1 ? state.playerBody : state.aiBody;
    if (isRingOutCinematicDone(loserBody, state.pendingKo.elapsed)) {
      winResult = state.pendingKo;
      state.pendingKo = null;
    }
  }

  return { events, winResult };
}

export function respawnRound(match) {
  const { state } = match;
  state.gameFrozen = false;
  state.pendingKo = null;
  state.gameRunning = true;
  spawnRoundBodies(state, match.world, match.topMaterial);
}
