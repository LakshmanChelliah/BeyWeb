import { CONFIG } from '../config.js';
import { applySteerForce } from '../physics/steer.js';
import { normalizeSteer } from './inputBuffer.js';
import { TICK_RATE } from './protocol.js';

const STEER_OPTS = { minSpin: CONFIG.SLEEP_THRESHOLD, skipKinematic: true };
const SEND_INTERVAL_MS = 1000 / TICK_RATE;

/**
 * Local steering feel during online play (server is authoritative).
 * Sends inputs at 60 Hz; predicts local motion every render frame.
 */
export function createRemoteInput({ localSlot, inputBuffer, netClient, isOnline }) {
  let lastSendAt = 0;

  return {
    applySteering(state) {
      if (!isOnline()) return;

      const body = localSlot() === 0 ? state.playerBody : state.aiBody;
      const spin = localSlot() === 0 ? state.playerSpin : state.aiSpin;
      const steer = inputBuffer.getSteer();

      if (body) {
        applySteerForce(
          body,
          steer.x,
          steer.y,
          spin,
          CONFIG.STEER_FORCE,
          STEER_OPTS
        );
      }

      const now = performance.now();
      if (now - lastSendAt < SEND_INTERVAL_MS) return;
      lastSendAt = now;

      const input = inputBuffer.consume();
      netClient.sendInput(input.tick, input.steer, input.ability);
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
    },
  };
}
