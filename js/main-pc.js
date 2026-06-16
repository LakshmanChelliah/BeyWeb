import { createGame } from './game/engine.js';
import { createKeyboardInput } from './input/keyboard.js';
import { applyAISteering, tickAIAbilities, resetAIController } from './input/ai.js';
import { createBeySelection } from './ui/selection.js';
import { createPlaySetup } from './ui/playSetup.js';
import { queryGameUi } from './ui/domRefs.js';
import { createCampaignController } from './game/campaignController.js';
import { GAME_MODES, isVsCpu, modeBlurb } from './game/modes.js';

const startOverlay = document.getElementById('start-overlay');
const selectOverlay = document.getElementById('select-overlay');
const playSetupEl = document.getElementById('play-setup');
const startBlurb = document.getElementById('start-blurb');
const startKeys = document.getElementById('start-keys');
const controlsHint = document.getElementById('controls-hint');
const playerHudLabel = document.getElementById('player-hud-label');
const aiHudLabel = document.getElementById('ai-hud-label');
const btnStart = document.getElementById('btn-start');

let gameMode = GAME_MODES.TOURNAMENT;
let difficulty = 1;
let beysChosen = false;
let gameRef = null;
let selection = null;

const campaignCtrl = createCampaignController({
  campaignHud: document.getElementById('campaign-hud'),
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverMsg: document.getElementById('gameover-msg'),
  btnRestart: document.getElementById('btn-restart'),
  isEnabled: () => isVsCpu(gameMode),
  getPlayerBey: () => gameRef?.state.playerBey,
  onOpponentChange(opp) {
    gameRef.state.aiBey = opp;
    selection.setRivalPick(opp);
  },
});

const playSetup = createPlaySetup(playSetupEl, {
  show2Player: true,
  onChange({ mode, difficulty: diff }) {
    gameMode = mode;
    difficulty = diff;
    beysChosen = false;
    btnStart.disabled = true;
    campaignCtrl.resetCampaign();
    applyModeUi();
    selection.reset(getPlayers());
    selection.setRivalLabel(isVsCpu(gameMode) ? 'RIVAL' : null);
  },
});

function getPlayers() {
  if (gameMode === GAME_MODES.TWO_PLAYER) {
    return [{ label: 'PLAYER 1' }, { label: 'PLAYER 2' }];
  }
  return [{ label: 'YOU' }];
}

function applyModeUi() {
  const vsCpu = isVsCpu(gameMode);

  document.body.classList.toggle('vs-cpu', vsCpu);
  document.body.classList.toggle('vs-2p', gameMode === GAME_MODES.TWO_PLAYER);

  if (playerHudLabel) playerHudLabel.textContent = vsCpu ? 'You — Spin' : 'P1 — Spin';
  if (aiHudLabel) aiHudLabel.textContent = vsCpu ? 'CPU — Spin' : 'P2 — Spin';

  if (controlsHint) {
    controlsHint.innerHTML = vsCpu
      ? 'Arrows to steer · <kbd>.</kbd> power · <kbd>/</kbd> special'
      : 'P1: Arrows · <kbd>.</kbd> power · <kbd>/</kbd> special &nbsp;|&nbsp; P2: WASD · <kbd>Q</kbd> power · <kbd>E</kbd> special';
  }

  if (startBlurb) startBlurb.textContent = modeBlurb(gameMode);
  if (startKeys) startKeys.style.display = gameMode === GAME_MODES.TWO_PLAYER ? 'flex' : 'none';

  campaignCtrl.updateHud();
}

function openBeySelect() {
  campaignCtrl.resetCampaign();
  resetAIController();
  selection.reset(getPlayers());
  selection.setRivalLabel(isVsCpu(gameMode) ? 'CPU' : null);
  gameRef.returnToMenu();
  selectOverlay.classList.remove('hidden');
  startOverlay.classList.add('hidden');
  document.getElementById('campaign-hud')?.classList.add('hidden');
  beysChosen = false;
  btnStart.disabled = true;
}

const keyboard = createKeyboardInput(
  () => {
    if (!beysChosen) return;
    if (!startOverlay.classList.contains('hidden')) gameRef?.startGame();
  },
  () => {
    if (gameRef?.state.gameFrozen) {
      campaignCtrl.handleRestart(gameRef.resetGame.bind(gameRef));
    }
  },
  (player, slot) => {
    if (isVsCpu(gameMode) && player === 2) return;
    gameRef?.triggerAbility(player === 1 ? 'player' : 'ai', slot);
  }
);

gameRef = createGame({
  mode: 'pc',
  canvas: document.getElementById('game-canvas'),
  isVsCpu: () => isVsCpu(gameMode),
  ui: queryGameUi({
    controlsHintId: 'controls-hint',
    playerAbilitiesId: 'p1-abilities',
    aiAbilitiesId: 'p2-abilities',
  }),
  input: {
    clearKeys: keyboard.clearKeys,
    applySteering(state) {
      keyboard.applyPlayer1Steer(state.playerBody, state.playerSpin);
      if (isVsCpu(gameMode)) {
        applyAISteering(state.aiBody, state.playerBody, state.aiSpin);
        tickAIAbilities(state, (slot) => gameRef.triggerAbility('ai', slot));
      } else {
        keyboard.applyPlayer2Steer(state.aiBody, state.aiSpin);
      }
    },
    onStartClick(startGame) {
      resetAIController();
      startGame();
      campaignCtrl.updateHud();
    },
    onMatchEnd: (result) => campaignCtrl.handleMatchEnd(result),
    onRestart(resetGame) {
      if (campaignCtrl.handlesRestart()) {
        campaignCtrl.handleRestart(resetGame);
      } else {
        resetAIController();
        resetGame();
      }
    },
    onChangeBey: openBeySelect,
  },
});

selection = createBeySelection({
  root: selectOverlay,
  players: getPlayers(),
  onComplete(picks) {
    const { mode, difficulty: diff } = playSetup.getState();
    gameMode = mode;
    difficulty = diff;

    gameRef.state.playerBey = picks[0];
    if (gameMode === GAME_MODES.TOURNAMENT) {
      campaignCtrl.startTournament(picks[0], difficulty);
    } else if (gameMode === GAME_MODES.CASUAL) {
      campaignCtrl.startCasual(picks[0], difficulty);
    } else {
      gameRef.state.aiBey = picks[1];
      campaignCtrl.resetCampaign();
    }
    beysChosen = true;
    btnStart.disabled = false;
    resetAIController();
    applyModeUi();
    setTimeout(() => {
      selectOverlay.classList.add('hidden');
      startOverlay.classList.remove('hidden');
    }, 600);
  },
});

({ mode: gameMode, difficulty } = playSetup.getState());
applyModeUi();
selection.setRivalLabel('RIVAL');
btnStart.disabled = true;
startOverlay.classList.add('hidden');
