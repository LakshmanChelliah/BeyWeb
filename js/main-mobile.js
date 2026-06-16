import { createGame } from './game/engine.js';
import { createGyroInput } from './input/gyro.js';
import { applyAISteering, tickAIAbilities, resetAIController } from './input/ai.js';
import { createBeySelection } from './ui/selection.js';
import { createPlaySetup } from './ui/playSetup.js';
import { queryGameUi } from './ui/domRefs.js';
import { createCampaignController } from './game/campaignController.js';
import { GAME_MODES, isVsCpu, modeBlurb } from './game/modes.js';

const btnStart = document.getElementById('btn-start');
const btnRecalibrate = document.getElementById('btn-recalibrate');
const permissionHint = document.getElementById('permission-hint');
const selectOverlay = document.getElementById('select-overlay');
const startOverlay = document.getElementById('start-overlay');
const campaignHud = document.getElementById('campaign-hud');
const startBlurb = document.getElementById('start-blurb');
const playSetupEl = document.getElementById('play-setup');
const gyro = createGyroInput(document.getElementById('game-canvas'));

let gameMode = GAME_MODES.TOURNAMENT;
let difficulty = 1;
let gameRef = null;
let selection = null;

const campaignCtrl = createCampaignController({
  campaignHud,
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
  onChange({ mode, difficulty: diff }) {
    gameMode = mode;
    difficulty = diff;
    campaignCtrl.resetCampaign();
    applyModeUi();
    selection.reset(getPlayers());
    selection.setRivalLabel('RIVAL');
    btnStart.disabled = true;
    btnStart.textContent = 'Calibrate & Start';
    startOverlay.classList.add('hidden');
  },
});

function getPlayers() {
  return [{ label: 'YOU' }];
}

function applyModeUi() {
  if (startBlurb) startBlurb.textContent = modeBlurb(gameMode);
  campaignCtrl.updateHud();
}

function openBeySelect() {
  campaignCtrl.resetCampaign();
  resetAIController();
  selection.reset(getPlayers());
  selection.setRivalLabel('RIVAL');
  gameRef.returnToMenu();
  selectOverlay.classList.remove('hidden');
  startOverlay.classList.add('hidden');
  campaignHud?.classList.add('hidden');
  btnStart.disabled = true;
  btnStart.textContent = 'Calibrate & Start';
}

gameRef = createGame({
  mode: 'mobile',
  canvas: document.getElementById('game-canvas'),
  ui: queryGameUi({
    controlsHintId: 'tilt-hint',
    playerAbilitiesId: 'player-abilities',
  }),
  input: {
    applySteering(state) {
      gyro.applyGyroSteer(state.playerBody, state.playerSpin);
      applyAISteering(state.aiBody, state.playerBody, state.aiSpin);
      tickAIAbilities(state, (slot) => gameRef.triggerAbility('ai', slot));
    },
    async onStartClick(startGame) {
      btnStart.disabled = true;
      btnStart.textContent = 'Requesting…';

      const granted = await gyro.requestMotionPermission();
      if (!granted) {
        btnStart.disabled = false;
        btnStart.textContent = 'Calibrate & Start';
        permissionHint.textContent =
          'Motion permission denied. On desktop, use mouse to steer instead.';
        gyro.setMouseFallback();
      }

      gyro.startListening();
      await gyro.calibrateOnce();
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
    async onRecalibrate(resetGame) {
      if (!btnRecalibrate) return;
      btnRecalibrate.disabled = true;
      const label = btnRecalibrate.textContent;
      btnRecalibrate.textContent = 'Calibrating…';
      await gyro.calibrateOnce();
      btnRecalibrate.disabled = false;
      btnRecalibrate.textContent = label;
      resetAIController();
      resetGame();
    },
  },
});

selection = createBeySelection({
  root: selectOverlay,
  players: getPlayers(),
  rivalLabel: 'RIVAL',
  onComplete(picks) {
    const { mode, difficulty: diff } = playSetup.getState();
    gameMode = mode;
    difficulty = diff;

    gameRef.state.playerBey = picks[0];
    if (gameMode === GAME_MODES.TOURNAMENT) {
      campaignCtrl.startTournament(picks[0], difficulty);
    } else {
      campaignCtrl.startCasual(picks[0], difficulty);
    }
    resetAIController();
    applyModeUi();
    setTimeout(() => {
      selectOverlay.classList.add('hidden');
      startOverlay.classList.remove('hidden');
      btnStart.disabled = false;
    }, 600);
  },
});

({ mode: gameMode, difficulty } = playSetup.getState());
applyModeUi();
startOverlay.classList.add('hidden');

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
