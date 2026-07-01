import { CONFIG } from '../config.js';
import { applySteerForce } from '../physics/steer.js';
import { applyCenterPull, applyOrbitDrift } from '../physics/top.js';
import { normalizeSteer } from './inputBuffer.js';
import { TICK_RATE } from './protocol.js?v=22';

const SEND_INTERVAL_MS = 1000 / TICK_RATE;
const STEER_OPTS = { minSpin: CONFIG.SLEEP_THRESHOLD, skipKinematic: true, normalize: false };

/**
 * Local steering feel during online play (server is authoritative).
 * Sends inputs at 60 Hz and applies client-side steer prediction between snapshots.
 */
export function createRemoteInput({ localSlot, inputBuffer, netClient, isOnline }) {
  let lastSendAt = 0;
  let lastSentSteer = { x: 0, y: 0 };

  function localBodies(state) {
    const slot = typeof localSlot === 'function' ? localSlot() : localSlot;
    return {
      slot,
      body: slot === 0 ? state.playerBody : state.aiBody,
      spin: slot === 0 ? state.playerSpin : state.aiSpin,
    };
  }

  return {
    getSteerMag() {
      const s = inputBuffer.getSteer();
      return Math.hypot(s.x, s.y);
    },

    getSteer() {
      return inputBuffer.getSteer();
    },

    applySteering(state) {
      if (!isOnline()) return;

      const steer = inputBuffer.getSteer();
      const now = performance.now();
      const steerDelta = Math.hypot(steer.x - lastSentSteer.x, steer.y - lastSentSteer.y);
      const steering = Math.hypot(steer.x, steer.y) > 0.04;
      const due = now - lastSendAt >= SEND_INTERVAL_MS;

      if (!due && steerDelta < 0.02 && !steering) return;

      lastSendAt = now;
      lastSentSteer = { ...steer };

      const input = inputBuffer.consume();
      netClient.sendInput(input.tick, input.steer, input.ability);
    },

    /** Apply steer/orbit/center forces to the local bey before a client physics step. */
    predictLocalForces(state) {
      if (!isOnline()) return false;
      if (state.pendingKo || state.launchGrace > 0) return false;

      const { body, spin } = localBodies(state);
      if (!body || body.userData.controlLocked || body.userData.eagleDivePhase != null) {
        return false;
      }

      const steer = inputBuffer.getSteer();
      const steering = Math.hypot(steer.x, steer.y) > 0.04;
      if (steering) {
        applySteerForce(body, steer.x, steer.y, spin, CONFIG.GYRO_FORCE, STEER_OPTS);
      }
      applyOrbitDrift(body, spin);
      applyCenterPull(body, spin);
      return steering;
    },

    setSteerFromDir(dirX, dirZ) {
      const s = normalizeSteer(dirX, dirZ);
      inputBuffer.setSteer(s.x, s.y);
    },

    queueAbility(slot) {
      inputBuffer.queueAbility(slot);
    },

    reset() {
      lastSendAt = 0;
      lastSentSteer = { x: 0, y: 0 };
    },
  };
}
