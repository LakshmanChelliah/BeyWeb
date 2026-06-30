import { getBeyById } from './beys.js';

/** Bot tier for L-Drago — keep in sync with last entry in input/ai.js AI_TIERS. */
const BOT_AI_TIER = 6;

/** Show bladers — names, AI skill, and tournament-only stat boosts (harder to KO). */
export const TOURNAMENT_BLADERS = Object.freeze({
  bull: {
    name: 'Benkei',
    title: 'The Strong Arm',
    aiTier: 3,
    defBonus: 12,
    staBonus: 10,
  },
  libra: {
    name: 'Yu',
    title: 'The Balance Blader',
    aiTier: 3,
    defBonus: 14,
    staBonus: 16,
  },
  eagle: {
    name: 'Tsubasa',
    title: 'The Sky Hunter',
    aiTier: 4,
    defBonus: 16,
    staBonus: 14,
    moveBonus: 4,
  },
  leone: {
    name: 'Kyoya',
    title: 'The Lion King',
    aiTier: 5,
    defBonus: 22,
    staBonus: 16,
    atkBonus: 6,
    moveBonus: 4,
  },
  striker: {
    name: 'Masamune',
    title: 'The Blitz Striker',
    aiTier: 5,
    defBonus: 14,
    staBonus: 12,
    atkBonus: 8,
    moveBonus: 10,
  },
  pegasus: {
    name: 'Gingka',
    title: 'The Storm Blader',
    aiTier: 6,
    defBonus: 18,
    staBonus: 14,
    atkBonus: 8,
    moveBonus: 6,
  },
  meteo_ldrago: {
    name: 'Ryuga',
    title: 'The Dark Emperor',
    aiTier: BOT_AI_TIER,
    defBonus: 24,
    staBonus: 18,
    atkBonus: 10,
    moveBonus: 8,
  },
});

/** Opponents in rising difficulty (easiest → hardest). */
export const CAMPAIGN_OPPONENT_IDS = Object.freeze([
  'bull',    // Benkei — Dark Bull
  'libra',   // Yu — Flame Libra
  'eagle',   // Tsubasa — Earth Eagle
  'leone',   // Kyoya — Rock Leone
  'pegasus', // Gingka — Storm Pegasus
  'meteo_ldrago',  // Ryuga — Meteo L-Drago
  'striker', // Masamune — Ray Striker
]);

export const CAMPAIGN_STAGE_COUNT = CAMPAIGN_OPPONENT_IDS.length;

/** Opponents for this run — full order minus the player's bey (5 rivals when using a roster bey). */
export function getTournamentRoster(excludeBey) {
  const excludeId = typeof excludeBey === 'string' ? excludeBey : excludeBey?.id;
  if (!excludeId) return [...CAMPAIGN_OPPONENT_IDS];
  return CAMPAIGN_OPPONENT_IDS.filter((id) => id !== excludeId);
}

/** Tournament rival → CPU archetype tier (see AI_DIFFICULTIES in input/ai.js). */
const OPPONENT_AI_TIER = Object.freeze({
  bull: TOURNAMENT_BLADERS.bull.aiTier,
  libra: TOURNAMENT_BLADERS.libra.aiTier,
  eagle: TOURNAMENT_BLADERS.eagle.aiTier,
  leone: TOURNAMENT_BLADERS.leone.aiTier,
  striker: TOURNAMENT_BLADERS.striker.aiTier,
  pegasus: TOURNAMENT_BLADERS.pegasus.aiTier,
  meteo_ldrago: TOURNAMENT_BLADERS.meteo_ldrago.aiTier,
});

/** Show blader profile for a tournament opponent id. */
export function getTournamentBlader(opponentId) {
  return TOURNAMENT_BLADERS[opponentId] ?? null;
}

/** Display label: "Benkei · DARK BULL" or bey name alone. */
export function getBladerDisplayName(bey) {
  const blader = getTournamentBlader(bey?.id);
  if (!blader) return bey?.name ?? 'CPU';
  return `${blader.name} · ${bey.name}`;
}

/** Applies tournament CPU buffs and blader metadata onto a bey object for the engine. */
export function applyTournamentBladerProfile(bey) {
  const blader = getTournamentBlader(bey?.id);
  if (!blader || !bey) return bey;
  return {
    ...bey,
    bladerName: blader.name,
    bladerTitle: blader.title,
    tournamentBuffs: {
      defBonus: blader.defBonus,
      staBonus: blader.staBonus,
      atkBonus: blader.atkBonus ?? 0,
      moveBonus: blader.moveBonus ?? 0,
    },
  };
}

/** Maps a roster id to the campaign AI tier (difficulty scales with stage order). */
export function getAiTierForOpponentId(opponentId) {
  if (opponentId in OPPONENT_AI_TIER) return OPPONENT_AI_TIER[opponentId];
  const idx = CAMPAIGN_OPPONENT_IDS.indexOf(opponentId);
  return idx >= 0 ? idx : CAMPAIGN_OPPONENT_IDS.length - 1;
}

/** Opponent for a tournament stage (fixed order within the filtered roster). */
export function pickTournamentOpponent(stageIndex, excludeBey) {
  const roster = getTournamentRoster(excludeBey);
  const idx = Math.max(0, Math.min(stageIndex, roster.length - 1));
  return getBeyById(roster[idx]);
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
  let opponentRoster = [...CAMPAIGN_OPPONENT_IDS];

  return {
    start(playerBey) {
      opponentRoster = getTournamentRoster(playerBey);
      opponentIndex = 0;
      playerWins = 0;
      cpuWins = 0;
      active = true;
      currentOpponentId = null;
    },

    reset() {
      opponentRoster = [...CAMPAIGN_OPPONENT_IDS];
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

    getStageCount() {
      return opponentRoster.length;
    },

    getAiTier() {
      return opponentIndex;
    },

    setOpponent(bey) {
      currentOpponentId = bey?.id ?? null;
    },

    getCurrentOpponent() {
      if (currentOpponentId) return getBeyById(currentOpponentId);
      return getBeyById(opponentRoster[opponentIndex]);
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
      return opponentIndex < opponentRoster.length - 1;
    },

    advanceOpponent() {
      if (opponentIndex >= opponentRoster.length - 1) return false;
      opponentIndex += 1;
      playerWins = 0;
      cpuWins = 0;
      currentOpponentId = null;
      return true;
    },

    isCampaignComplete() {
      return (
        opponentIndex >= opponentRoster.length - 1 &&
        playerWins >= WINS_NEEDED
      );
    },
  };
}
