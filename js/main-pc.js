import { createGame } from './game/engine.js';
import { createKeyboardInput } from './input/keyboard.js';
import { createBeySelection } from './ui/selection.js';
import { queryGameUi } from './ui/domRefs.js';

const startOverlay = document.getElementById('start-overlay');
const selectOverlay = document.getElementById('select-overlay');
let gameRef = null;
let beysChosen = false;

const keyboard = createKeyboardInput(
  () => {
    if (!beysChosen) return;
    if (!startOverlay.classList.contains('hidden')) gameRef?.startGame();
  },
  () => {
    if (gameRef?.state.gameFrozen) gameRef.resetGame();
  },
  (player, slot) => {
    // P1 -> player side, P2 -> ai side.
    gameRef?.triggerAbility(player === 1 ? 'player' : 'ai', slot);
  }
);

gameRef = createGame({
  mode: 'pc',
  canvas: document.getElementById('game-canvas'),
  ui: queryGameUi({
    controlsHintId: 'controls-hint',
    playerAbilitiesId: 'p1-abilities',
    aiAbilitiesId: 'p2-abilities',
  }),
  input: {
    clearKeys: keyboard.clearKeys,
    applySteering(state) {
      keyboard.applyPlayer1Steer(state.playerBody, state.playerSpin);
      keyboard.applyPlayer2Steer(state.aiBody, state.aiSpin);
    },
  },
});

createBeySelection({
  root: selectOverlay,
  players: [{ label: 'PLAYER 1' }, { label: 'PLAYER 2' }],
  onComplete(picks) {
    gameRef.state.playerBey = picks[0];
    gameRef.state.aiBey = picks[1];
    beysChosen = true;
    setTimeout(() => selectOverlay.classList.add('hidden'), 600);
  },
});
