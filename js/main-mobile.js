import { createGyroInput } from './input/gyro.js';
import { applyAISteering, tickAIAbilities } from './input/ai.js';
import { createAppBootstrap } from './app/bootstrap.js';
import { modeBlurb } from './game/modes.js';
import { createRemoteInput } from './net/remoteInput.js';

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
const tiltHint = document.getElementById('tilt-hint');
const gyro = createGyroInput(document.getElementById('game-canvas'));

createAppBootstrap({
  platform: 'mobile',
  canvas: document.getElementById('game-canvas'),
  playSetupEl,
  selectOverlay,
  startOverlay,
  btnStart,
  applyPlatformModeUi({ gameMode, isOnline: online }) {
    if (startBlurb) startBlurb.textContent = modeBlurb(gameMode);
    document.body.classList.toggle('vs-online', online);
    document.getElementById('btn-change-bey')?.classList.toggle('hidden', online);
    if (tiltHint && online) {
      tiltHint.textContent = 'Tilt to steer · Tap moves · Best of 3 online';
    }
  },
  queryUiOptions: {
    controlsHintId: 'tilt-hint',
    playerAbilitiesId: 'player-abilities',
  },
  buildInput({
    getGameRef,
    campaignCtrl,
    onlineCtrl,
    openBeySelect,
    btnStart,
    resetAIController,
    netClient,
    inputBuffer,
    netDebug,
    getIsOnline,
    getLocalSlot,
  }) {
    const remote = createRemoteInput({
      localSlot: getLocalSlot,
      inputBuffer,
      netClient,
      isOnline: getIsOnline,
    });

    let pingTimer = 0;

    async function ensureGyro() {
      lockPortraitOrientation();
      const granted = await gyro.requestMotionPermission();
      if (!granted) {
        permissionHint.textContent =
          'Motion permission denied. Use touch drag to steer instead.';
        gyro.setMouseFallback();
      }
      gyro.startListening();
      await gyro.calibrateOnce();
    }

    return {
      queueAbility(slot) {
        inputBuffer.queueAbility(slot);
      },
      applySteering(state) {
        if (getIsOnline()) {
          gyro.applyGyroSteer(state.playerBody, state.playerSpin);
          const dir = gyro.getSteerDirection();
          inputBuffer.setSteer(dir.x, dir.y);
          remote.applySteering(state);
          return;
        }
        gyro.applyGyroSteer(state.playerBody, state.playerSpin);
        applyAISteering(state.aiBody, state.playerBody, state.aiSpin, state.playerSpin);
        tickAIAbilities(state, (slot) => getGameRef().triggerAbility('ai', slot));
      },
      onNetFrame({ snapAge, dt, serverTick, interpDelay }) {
        netDebug.update({ snapAge, serverTick, interpDelayTicks: interpDelay });
        pingTimer += dt ?? 0;
        if (pingTimer < 2) return;
        pingTimer = 0;
        if (!getIsOnline()) return;
        netClient.ping().then((result) => {
          if (!result) return;
          netDebug.update({ pingMs: result.rtt });
          getGameRef()?.setNetRtt?.(result.rtt);
        });
      },
      async onStartClick(startGame) {
        if (getIsOnline()) {
          await ensureGyro();
          return;
        }
        btnStart.disabled = true;
        btnStart.textContent = 'Requesting…';
        await ensureGyro();
        startGame();
        campaignCtrl.updateHud();
      },
      onMatchEnd: (result) => {
        if (!getIsOnline()) campaignCtrl.handleMatchEnd(result);
      },
      onRestart(resetGame) {
        if (getIsOnline() && onlineCtrl?.isActive()) {
          onlineCtrl.handleRestart();
          return;
        }
        if (campaignCtrl.handlesRestart()) {
          campaignCtrl.handleRestart(resetGame);
        } else {
          resetAIController();
          resetGame();
        }
      },
      onChangeBey: () => {
        if (!getIsOnline()) openBeySelect();
      },
      isAwaitingRoundReady: () => onlineCtrl?.isAwaitingRoundReady() ?? false,
      prepareOnline: ensureGyro,
      onRecalibrate() {
        if (getIsOnline()) {
          gyro.calibrateNow();
          return;
        }
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
  onSelectionComplete({ online }) {
    if (online) {
      btnStart.textContent = 'Waiting for match…';
      btnStart.disabled = true;
    } else {
      btnStart.textContent = 'Calibrate & Start';
    }
  },
});

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
