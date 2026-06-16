/** PC / mobile play modes. */
export const GAME_MODES = Object.freeze({
  CASUAL: 'casual',
  TOURNAMENT: 'tournament',
  TWO_PLAYER: '2player',
});

export function isVsCpu(mode) {
  return mode === GAME_MODES.CASUAL || mode === GAME_MODES.TOURNAMENT;
}

export function modeBlurb(mode) {
  switch (mode) {
    case GAME_MODES.CASUAL:
      return 'Casual — pick any rival and win a single match. No series, just bragging rights.';
    case GAME_MODES.TOURNAMENT:
      return 'Tournament — best of 3 against each rival in order. Beat all five to become champion!';
    default:
      return 'Two-player local battle. P1 uses arrow keys, P2 uses WASD. Launch the other bey out through a KO pocket to win!';
  }
}
