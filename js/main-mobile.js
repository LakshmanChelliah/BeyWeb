import { createGyroInput } from './input/gyro.js';
import { applyAISteering, tickAIAbilities } from './input/ai.js';
import { createAppBootstrap } from './app/bootstrap.js';
import { modeBlurb } from './game/modes.js';

function lockPortraitOrientation() {
  const lock = screen.orientation?.lock;
  if (!lock) return;
  lock.call(screen.orientation, 'portrait-primary').catch(() => {});
}

document.addEventListener('pointerdown', lockPortraitOrientation, { passive: true });
window.addEventListener('orientationchange', lockPortraitOrientation);

const btnStart = document.getElementById('btn-start');
const btnRecalibrate = document.getElementById('btn-recalibrate');
const permissionHint = document.getElementById('permission-hint');
const selectOverlay = document.getElementById('select-overlay');
const startOverlay = document.getElementById('start-overlay');
const startBlurb = document.getElementById('start-blurb');
const playSetupEl = document.getElementById('play-setup');
const gyro = createGyroInput(document.getElementById('game-canvas'));

createAppBootstrap({
  platform: 'mobile',
  canvas: document.getElementById('game-canvas'),
  playSetupEl,
  selectOverlay,
  startOverlay,
  btnStart,
  applyPlatformModeUi({ gameMode }) {
    if (startBlurb) startBlurb.textContent = modeBlurb(gameMode);
  },
  queryUiOptions: {
    controlsHintId: 'tilt-hint',
    playerAbilitiesId: 'player-abilities',
  },
  buildInput({ getGameRef, campaignCtrl, openBeySelect, btnStart, resetAIController }) {
    return {
      applySteering(state) {
        gyro.applyGyroSteer(state.playerBody, state.playerSpin);
        applyAISteering(state.aiBody, state.playerBody, state.aiSpin, state.playerSpin);
        tickAIAbilities(state, (slot) => getGameRef().triggerAbility('ai', slot));
      },
      async onStartClick(startGame) {
        lockPortraitOrientation();
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
      onRecalibrate() {
        if (!btnRecalibrate || btnRecalibrate.disabled) return;
        btnRecalibrate.disabled = true;
        btnRecalibrate.setAttribute('aria-busy', 'true');
        gyro.calibrateNow();
        requestAnimationFrame(() => {
          btnRecalibrate.disabled = false;
          btnRecalibrate.removeAttribute('aria-busy');
        });
      },
    };
  },
  onSelectionComplete() {
    btnStart.textContent = 'Calibrate & Start';
  },
});

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
