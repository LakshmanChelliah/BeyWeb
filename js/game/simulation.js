import { CONFIG } from '../config.js';
import { stepAbilities } from './abilities.js';
import { isRingOutActive } from './bodyFlags.js';
import { resolveWallClipping } from '../physics/wall.js';
import { stepRingOutBodies } from '../physics/ringOut.js';
import {
  stabilizeTop,
  clampLaunchSpeed,
  pinTopToFloor,
  settleSleepingTop,
  stepLaunchDrop,
  applyCenterPull,
} from '../physics/topPhysics.js';
/**
 * One fixed-timestep physics tick: forces, cannon step, contacts, abilities, rim correction.
 */
export function stepSimulation({
  state,
  world,
  contacts,
  input,
}) {
  stepRingOutBodies(state);

  if (state.playerBody) {
    if (!isRingOutActive(state.playerBody)) {
      settleSleepingTop(state.playerBody, state.playerSpin);
    }
    stabilizeTop(state.playerBody, state.playerSpin, 1, state.launchGrace);
    pinTopToFloor(state.playerBody);
  }
  if (state.aiBody) {
    if (!isRingOutActive(state.aiBody)) {
      settleSleepingTop(state.aiBody, state.aiSpin);
    }
    stabilizeTop(state.aiBody, state.aiSpin, -0.95, state.launchGrace);
    pinTopToFloor(state.aiBody);
  }

  if (!state.pendingKo) {
    input.applySteering?.(state);
    applyCenterPull(state.playerBody, state.playerSpin);
    applyCenterPull(state.aiBody, state.aiSpin);
  }

  world.step(CONFIG.FIXED_DT);

  stepLaunchDrop(state.playerBody, state.launchGrace);
  stepLaunchDrop(state.aiBody, state.launchGrace);

  contacts.resolve(state, CONFIG.FIXED_DT);
  contacts.resolveWallContacts(state, CONFIG.FIXED_DT);

  // After cannon + clash so cinematic moves are not overwritten in the same step.
  stepAbilities(state, CONFIG.FIXED_DT);

  contacts.resolveWallClipSpin(state, state.playerBody, state.aiBody);
  resolveWallClipping(state.playerBody, state.aiBody, contacts.emitWallImpact);

  if (state.playerBody) {
    clampLaunchSpeed(state.playerBody, state.launchGrace);
    stabilizeTop(state.playerBody, state.playerSpin, 1, state.launchGrace);
    pinTopToFloor(state.playerBody);
    if (!isRingOutActive(state.playerBody)) {
      settleSleepingTop(state.playerBody, state.playerSpin);
    }
  }
  if (state.aiBody) {
    clampLaunchSpeed(state.aiBody, state.launchGrace);
    stabilizeTop(state.aiBody, state.aiSpin, -0.95, state.launchGrace);
    pinTopToFloor(state.aiBody);
    if (!isRingOutActive(state.aiBody)) {
      settleSleepingTop(state.aiBody, state.aiSpin);
    }
  }
}
