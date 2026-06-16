import { createGame } from './game/engine.js';
import { createGyroInput } from './input/gyro.js';
import { applyAISteering, tickAIAbilities, resetAIController } from './input/ai.js';
import { createBeySelection } from './ui/selection.js';
import { queryGameUi } from './ui/domRefs.js';
import { createCampaignController } from './game/campaignController.js';

const btnStart = document.getElementById('btn-start');
const btnRecalibrate = document.getElementById('btn-recalibrate');
const permissionHint = document.getElementById('permission-hint');
const selectOverlay = document.getElementById('select-overlay');
const campaignHud = document.getElementById('campaign-hud');
const gyro = createGyroInput(document.getElementById('game-canvas'));

let gameRef = null;
let selection = null;

const campaignCtrl = createCampaignController({
  campaignHud,
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverMsg: document.getElementById('gameover-msg'),
  btnRestart: document.getElementById('btn-restart'),
  onOpponentChange(opp) {
    gameRef.state.aiBey = opp;
    selection.setRivalPick(opp);
  },
});

function openBeySelect() {
  campaignCtrl.resetCampaign();
  resetAIController();
  selection.reset([{ label: 'YOU' }]);
  selection.setRivalLabel('CPU');
  gameRef.returnToMenu();
  selectOverlay.classList.remove('hidden');
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
  players: [{ label: 'YOU' }],
  rivalLabel: 'CPU',
  onComplete(picks) {
    gameRef.state.playerBey = picks[0];
    campaignCtrl.startCampaign();
    resetAIController();
    setTimeout(() => selectOverlay.classList.add('hidden'), 600);
  },
});

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
