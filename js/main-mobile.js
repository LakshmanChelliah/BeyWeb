import { createGame } from './game/engine.js';
import { createGyroInput } from './input/gyro.js';
import { applyAISteering, tickAIAbilities, resetAIController } from './input/ai.js';
import { createBeySelection } from './ui/selection.js';
import { queryGameUi } from './ui/domRefs.js';
import { createCampaignController } from './game/campaignController.js';
import { GAME_MODES, isVsCpu, modeBlurb } from './game/modes.js';

const btnStart = document.getElementById('btn-start');
const btnRecalibrate = document.getElementById('btn-recalibrate');
const permissionHint = document.getElementById('permission-hint');
const selectOverlay = document.getElementById('select-overlay');
const campaignHud = document.getElementById('campaign-hud');
const startBlurb = document.getElementById('start-blurb');
const modeBar = document.getElementById('mode-bar');
const modeCasualBtn = document.getElementById('mode-casual');
const modeTourneyBtn = document.getElementById('mode-tournament');
const gyro = createGyroInput(document.getElementById('game-canvas'));

let gameMode = GAME_MODES.TOURNAMENT;
let gameRef = null;
let selection = null;

const campaignCtrl = createCampaignController({
  campaignHud,
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverMsg: document.getElementById('gameover-msg'),
  btnRestart: document.getElementById('btn-restart'),
  isEnabled: () => isVsCpu(gameMode),
  onOpponentChange(opp) {
    gameRef.state.aiBey = opp;
    selection.setRivalPick(opp);
  },
});

function getPlayers() {
  if (gameMode === GAME_MODES.CASUAL) {
    return [{ label: 'YOU' }, { label: 'OPPONENT' }];
  }
  return [{ label: 'YOU' }];
}

function applyModeUi() {
  modeCasualBtn?.classList.toggle('active', gameMode === GAME_MODES.CASUAL);
  modeTourneyBtn?.classList.toggle('active', gameMode === GAME_MODES.TOURNAMENT);
  if (startBlurb) startBlurb.textContent = modeBlurb(gameMode);
  campaignCtrl.updateHud();
}

function setMode(mode) {
  if (gameMode === mode) return;
  gameMode = mode;
  campaignCtrl.resetCampaign();
  applyModeUi();
  selection.reset(getPlayers());
  selection.setRivalLabel(gameMode === GAME_MODES.TOURNAMENT ? 'CPU' : null);
  btnStart.disabled = true;
  btnStart.textContent = 'Calibrate & Start';
}

function openBeySelect() {
  campaignCtrl.resetCampaign();
  resetAIController();
  selection.reset(getPlayers());
  selection.setRivalLabel(gameMode === GAME_MODES.TOURNAMENT ? 'CPU' : null);
  gameRef.returnToMenu();
  selectOverlay.classList.remove('hidden');
  campaignHud?.classList.add('hidden');
  modeBar?.classList.remove('hidden');
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
  rivalLabel: 'CPU',
  onComplete(picks) {
    gameRef.state.playerBey = picks[0];
    if (gameMode === GAME_MODES.TOURNAMENT) {
      campaignCtrl.startTournament();
    } else {
      gameRef.state.aiBey = picks[1];
      campaignCtrl.startCasual(picks[1]);
    }
    resetAIController();
    setTimeout(() => {
      selectOverlay.classList.add('hidden');
      modeBar?.classList.add('hidden');
    }, 600);
  },
});

modeCasualBtn?.addEventListener('click', () => setMode(GAME_MODES.CASUAL));
modeTourneyBtn?.addEventListener('click', () => setMode(GAME_MODES.TOURNAMENT));

applyModeUi();

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
