import { CONFIG } from '../config.js';
import { getBeyById } from './beys.js';

/** Creates the mutable runtime game state object */
export function createGameState() {
  return {
    gameRunning: false,
    gameFrozen: false,
    pendingKo: null,
    playerSpin: 1.0,
    aiSpin: 1.0,
    playerVisualYaw: 0,
    aiVisualYaw: 0,
    launchGrace: 0,
    firstSleeper: null,
    lastOutcome: null,
    playerBody: null,
    aiBody: null,
    accumulator: 0,
    // Per-bey ability runtimes { player, ai }, rebuilt on each spawn.
    abilities: null,
    // Selected beys (overwritten by the selection screen before launch).
    playerBey: getBeyById('pegasus'),
    aiBey: getBeyById('ldrago'),
  };
}

/** Resets spin-related fields when a new round starts */
export function resetRoundState(state) {
  state.playerSpin = 1.0;
  state.aiSpin = 1.0;
  state.playerVisualYaw = 0;
  state.aiVisualYaw = 0;
  state.launchGrace = CONFIG.LAUNCH_GRACE;
  state.firstSleeper = null;
  state.lastOutcome = null;
  state.pendingKo = null;
}
