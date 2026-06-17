import { getBeyById } from './beys.js';

/** Opponents in rising difficulty (easiest → hardest). */
export const CAMPAIGN_OPPONENT_IDS = Object.freeze([
  'bull',    // Dark Bull
  'libra',   // Flame Libra
  'leone',   // Rock Leone
  'pegasus', // Storm Pegasus
  'ldrago',  // Meteo L-Drago
]);

export const CAMPAIGN_STAGE_COUNT = CAMPAIGN_OPPONENT_IDS.length;

/** Maps a roster id to the campaign AI tier (difficulty scales with stage order). */
export function getAiTierForOpponentId(opponentId) {
  const idx = CAMPAIGN_OPPONENT_IDS.indexOf(opponentId);
  return idx >= 0 ? idx : CAMPAIGN_OPPONENT_IDS.length - 1;
}

/** Opponent for a tournament stage (fixed order, skips the player's bey). */
export function pickTournamentOpponent(stageIndex, excludeBey) {
  const excludeId = typeof excludeBey === 'string' ? excludeBey : excludeBey?.id;
  const start = Math.max(0, Math.min(stageIndex, CAMPAIGN_OPPONENT_IDS.length - 1));
  for (let step = 0; step < CAMPAIGN_OPPONENT_IDS.length; step++) {
    const id = CAMPAIGN_OPPONENT_IDS[(start + step) % CAMPAIGN_OPPONENT_IDS.length];
    const bey = getBeyById(id);
    if (bey && bey.id !== excludeId) return bey;
  }
  return getBeyById(CAMPAIGN_OPPONENT_IDS[start]);
}

/** Random rival from the tournament roster (excludes the player's bey). */
export function pickRandomRival(excludeBey) {
  const excludeId = typeof excludeBey === 'string' ? excludeBey : excludeBey?.id;
  const pool = CAMPAIGN_OPPONENT_IDS.map((id) => getBeyById(id)).filter(
    (b) => b && b.id !== excludeId
  );
  if (pool.length === 0) return getBeyById(CAMPAIGN_OPPONENT_IDS[0]);
  return pool[Math.floor(Math.random() * pool.length)];
}

const WINS_NEEDED = 2;

export function createCampaign() {
  let opponentIndex = 0;
  let playerWins = 0;
  let cpuWins = 0;
  let active = false;
  let currentOpponentId = null;

  return {
    start() {
      opponentIndex = 0;
      playerWins = 0;
      cpuWins = 0;
      active = true;
      currentOpponentId = null;
    },

    reset() {
      opponentIndex = 0;
      playerWins = 0;
      cpuWins = 0;
      active = false;
      currentOpponentId = null;
    },

    isActive() {
      return active;
    },

    getOpponentIndex() {
      return opponentIndex;
    },

    getAiTier() {
      return opponentIndex;
    },

    setOpponent(bey) {
      currentOpponentId = bey?.id ?? null;
    },

    getCurrentOpponent() {
      if (currentOpponentId) return getBeyById(currentOpponentId);
      return getBeyById(CAMPAIGN_OPPONENT_IDS[opponentIndex]);
    },

    getSeriesScore() {
      return { player: playerWins, cpu: cpuWins };
    },

    /** @returns {'ongoing'|'player'|'cpu'} */
    getSeriesStatus() {
      if (playerWins >= WINS_NEEDED) return 'player';
      if (cpuWins >= WINS_NEEDED) return 'cpu';
      return 'ongoing';
    },

    recordMatch(winner) {
      if (winner === 1) playerWins += 1;
      else if (winner === 2) cpuWins += 1;
    },

    hasNextOpponent() {
      return opponentIndex < CAMPAIGN_OPPONENT_IDS.length - 1;
    },

    advanceOpponent() {
      if (opponentIndex >= CAMPAIGN_OPPONENT_IDS.length - 1) return false;
      opponentIndex += 1;
      playerWins = 0;
      cpuWins = 0;
      currentOpponentId = null;
      return true;
    },

    isCampaignComplete() {
      return (
        opponentIndex >= CAMPAIGN_OPPONENT_IDS.length - 1 &&
        playerWins >= WINS_NEEDED
      );
    },
  };
}
