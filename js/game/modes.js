/** PC / mobile play modes. */
export const GAME_MODES = Object.freeze({
  CASUAL: 'casual',
  TOURNAMENT: 'tournament',
  TWO_PLAYER: '2player',
  ONLINE: 'online',
});

export function isVsCpu(mode) {
  return mode === GAME_MODES.CASUAL || mode === GAME_MODES.TOURNAMENT;
}

export function isOnline(mode) {
  return mode === GAME_MODES.ONLINE;
}

export function modeBlurb(mode) {
  switch (mode) {
    case GAME_MODES.CASUAL:
      return 'Casual: pick your bey and CPU difficulty. Face a random rival each match.';
    case GAME_MODES.TOURNAMENT:
      return 'Tournament: best of 3 vs five rivals in rising order.';
    case GAME_MODES.ONLINE:
      return 'Online: invite a friend, lock in your bey, best of 5 (first to 3) real-time battle.';
    default:
      return 'Two-player local battle. P1: WASD + Q/E. P2: arrow keys + comma/period. Launch the other bey out through a KO pocket to win!';
  }
}
