import { getBeyById } from './beys.js';
import { pickRandomRival } from './campaign.js';

/** Single-match fights — CPU rival is rolled randomly each match. */
export function createCasualMode() {
  let opponentId = null;
  let difficultyTier = 1;
  let active = false;

  return {
    start(opponentBey, difficulty) {
      opponentId = opponentBey?.id ?? null;
      difficultyTier = difficulty ?? 1;
      active = Boolean(opponentId);
    },

    reset() {
      opponentId = null;
      difficultyTier = 1;
      active = false;
    },

    isActive() {
      return active;
    },

    getAiTier() {
      return difficultyTier;
    },

    setDifficulty(tier) {
      difficultyTier = tier;
    },

    rollOpponent(playerBey) {
      const opp = pickRandomRival(playerBey);
      opponentId = opp?.id ?? null;
      return opp;
    },

    getCurrentOpponent() {
      return getBeyById(opponentId);
    },
  };
}
