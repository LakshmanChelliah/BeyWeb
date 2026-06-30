import { CONFIG } from '../config.js';
import { stepAbilities } from './abilities.js';
import { stepRingOutBodies } from '../physics/ringOut.js';
import {
  stabilizeTop,
  clampLaunchSpeed,
  pinTopToFloor,
  settleSleepingTop,
  stepLaunchDrop,
  applyCenterPull,
  applyOrbitDrift,
  resolveWallClipping,
} from '../physics/top.js';

function playerSpinSign(body) {
  return body?.userData?.spinSign ?? 1;
}

function aiSpinSign(body) {
  return body?.userData?.spinSign ?? -0.95;
}

/**
 * One fixed-timestep physics tick matching pre-online engine stepPhysics (e08af1c).
 */
export function stepSimulation({
  state,
  world,
  contacts,
  input,
}) {
  stepRingOutBodies(state);

  if (state.playerBody) {
    if (!state.playerBody.userData.ringOut) {
      settleSleepingTop(state.playerBody, state.playerSpin);
    }
    stabilizeTop(state.playerBody, state.playerSpin, playerSpinSign(state.playerBody), state.launchGrace);
    pinTopToFloor(state.playerBody);
  }
  if (state.aiBody) {
    if (!state.aiBody.userData.ringOut) {
      settleSleepingTop(state.aiBody, state.aiSpin);
    }
    stabilizeTop(state.aiBody, state.aiSpin, aiSpinSign(state.aiBody), state.launchGrace);
    pinTopToFloor(state.aiBody);
  }

  if (!state.pendingKo) {
    input.applySteering?.(state);
    applyCenterPull(state.playerBody, state.playerSpin);
    applyCenterPull(state.aiBody, state.aiSpin);
    applyOrbitDrift(state.playerBody, state.playerSpin);
    applyOrbitDrift(state.aiBody, state.aiSpin);
  }

  world.step(CONFIG.FIXED_DT);

  stepLaunchDrop(state.playerBody, state.launchGrace);
  stepLaunchDrop(state.aiBody, state.launchGrace);

  contacts.resolve(state, CONFIG.FIXED_DT);
  contacts.resolveWallContacts(state, CONFIG.FIXED_DT);
  contacts.resolveWallClipSpin(state, state.playerBody, state.aiBody);
  resolveWallClipping(state.playerBody, state.aiBody, contacts.emitWallImpact);

  stepAbilities(state, CONFIG.FIXED_DT);

  if (state.playerBody) {
    clampLaunchSpeed(state.playerBody, state.launchGrace);
    stabilizeTop(state.playerBody, state.playerSpin, playerSpinSign(state.playerBody), state.launchGrace);
    pinTopToFloor(state.playerBody);
    if (!state.playerBody.userData.ringOut) {
      settleSleepingTop(state.playerBody, state.playerSpin);
    }
  }
  if (state.aiBody) {
    clampLaunchSpeed(state.aiBody, state.launchGrace);
    stabilizeTop(state.aiBody, state.aiSpin, aiSpinSign(state.aiBody), state.launchGrace);
    pinTopToFloor(state.aiBody);
    if (!state.aiBody.userData.ringOut) {
      settleSleepingTop(state.aiBody, state.aiSpin);
    }
  }
}
