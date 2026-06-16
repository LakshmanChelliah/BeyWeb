import { createGame } from './game/engine.js';
import { createKeyboardInput } from './input/keyboard.js';
import { applyAISteering, tickAIAbilities, resetAIController } from './input/ai.js';
import { createBeySelection } from './ui/selection.js';
import { queryGameUi } from './ui/domRefs.js';
import { createCampaignController } from './game/campaignController.js';

const startOverlay = document.getElementById('start-overlay');
const selectOverlay = document.getElementById('select-overlay');
const modeBar = document.getElementById('pc-mode-bar');
const modeCpuBtn = document.getElementById('mode-vs-cpu');
const mode2pBtn = document.getElementById('mode-2-player');
const startBlurb = document.getElementById('start-blurb');
const startKeys = document.getElementById('start-keys');
const controlsHint = document.getElementById('controls-hint');
const playerHudLabel = document.getElementById('player-hud-label');
const aiHudLabel = document.getElementById('ai-hud-label');
const btnStart = document.getElementById('btn-start');

let vsCpu = true;
let beysChosen = false;
let gameRef = null;
let selection = null;

const campaignCtrl = createCampaignController({
  campaignHud: document.getElementById('campaign-hud'),
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverMsg: document.getElementById('gameover-msg'),
  btnRestart: document.getElementById('btn-restart'),
  isEnabled: () => vsCpu,
  onOpponentChange(opp) {
    gameRef.state.aiBey = opp;
    selection.setRivalPick(opp);
  },
});

function getPlayers() {
  return vsCpu ? [{ label: 'YOU' }] : [{ label: 'PLAYER 1' }, { label: 'PLAYER 2' }];
}

function applyModeUi() {
  document.body.classList.toggle('vs-cpu', vsCpu);
  document.body.classList.toggle('vs-2p', !vsCpu);

  modeCpuBtn?.classList.toggle('active', vsCpu);
  mode2pBtn?.classList.toggle('active', !vsCpu);

  if (playerHudLabel) playerHudLabel.textContent = vsCpu ? 'You — Spin' : 'P1 — Spin';
  if (aiHudLabel) aiHudLabel.textContent = vsCpu ? 'CPU — Spin' : 'P2 — Spin';

  if (controlsHint) {
    controlsHint.innerHTML = vsCpu
      ? 'Arrows to steer · <kbd>.</kbd> power · <kbd>/</kbd> special'
      : 'P1: Arrows · <kbd>.</kbd> power · <kbd>/</kbd> special &nbsp;|&nbsp; P2: WASD · <kbd>Q</kbd> power · <kbd>E</kbd> special';
  }

  if (startBlurb) {
    startBlurb.textContent = vsCpu
      ? 'CPU campaign — best of 3 against each rival. Win the series to face the next, tougher bey!'
      : 'Two-player local battle. P1 uses arrow keys, P2 uses WASD. Launch the other bey out through a KO pocket to win!';
  }

  if (startKeys) startKeys.style.display = vsCpu ? 'none' : 'flex';
  campaignCtrl.updateHud();
}

function setMode(cpu) {
  if (vsCpu === cpu) return;
  vsCpu = cpu;
  beysChosen = false;
  btnStart.disabled = true;
  campaignCtrl.resetCampaign();
  applyModeUi();
  selection.reset(getPlayers());
  selection.setRivalLabel(vsCpu ? 'CPU' : null);
}

function openBeySelect() {
  campaignCtrl.resetCampaign();
  resetAIController();
  selection.reset(getPlayers());
  selection.setRivalLabel(vsCpu ? 'CPU' : null);
  gameRef.returnToMenu();
  selectOverlay.classList.remove('hidden');
  document.getElementById('campaign-hud')?.classList.add('hidden');
  beysChosen = false;
  btnStart.disabled = true;
  modeBar?.classList.remove('hidden');
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
    if (vsCpu && player === 2) return;
    gameRef?.triggerAbility(player === 1 ? 'player' : 'ai', slot);
  }
);

gameRef = createGame({
  mode: 'pc',
  canvas: document.getElementById('game-canvas'),
  isVsCpu: () => vsCpu,
  ui: queryGameUi({
    controlsHintId: 'controls-hint',
    playerAbilitiesId: 'p1-abilities',
    aiAbilitiesId: 'p2-abilities',
  }),
  input: {
    clearKeys: keyboard.clearKeys,
    applySteering(state) {
      keyboard.applyPlayer1Steer(state.playerBody, state.playerSpin);
      if (vsCpu) {
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
    gameRef.state.playerBey = picks[0];
    if (vsCpu) {
      campaignCtrl.startCampaign();
    } else {
      gameRef.state.aiBey = picks[1];
      campaignCtrl.resetCampaign();
    }
    beysChosen = true;
    btnStart.disabled = false;
    resetAIController();
    setTimeout(() => {
      selectOverlay.classList.add('hidden');
      modeBar?.classList.add('hidden');
    }, 600);
  },
});

modeCpuBtn?.addEventListener('click', () => setMode(true));
mode2pBtn?.addEventListener('click', () => setMode(false));

applyModeUi();
selection.setRivalLabel('CPU');
btnStart.disabled = true;
