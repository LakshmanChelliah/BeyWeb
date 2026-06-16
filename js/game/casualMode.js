import { getBeyById } from './beys.js';
import { getAiTierForOpponentId } from './campaign.js';

/** Single-match fights against a chosen CPU rival. */
export function createCasualMode() {
  let opponentId = null;
  let active = false;

  return {
    start(opponentBey) {
      opponentId = opponentBey?.id ?? null;
      active = Boolean(opponentId);
    },

    reset() {
      opponentId = null;
      active = false;
    },

    isActive() {
      return active;
    },

    getAiTier() {
      return getAiTierForOpponentId(opponentId);
    },

    getCurrentOpponent() {
      return getBeyById(opponentId);
    },
  };
}
