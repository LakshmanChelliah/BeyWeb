import { createGyroInput } from './input/gyro.js';
import { applyAISteering, tickAIAbilities } from './input/ai.js';
import { createAppBootstrap } from './app/bootstrap.js?v=20';
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

function updatePermissionHint(granted) {
  if (!permissionHint) return;
  if (granted && gyro.isActive()) {
    permissionHint.textContent = 'Hold phone at your play angle, then tap Recalibrate if drift occurs.';
    return;
  }
  if (granted && gyro.isUsingFallback()) {
    permissionHint.textContent = 'Drag on the arena to steer until motion sensors activate.';
    return;
  }
  permissionHint.textContent = gyro.isIos
    ? 'Tap Enable Motion on first load. Hold phone at your play angle when calibrating.'
    : 'Tilt phone to steer. Drag on the arena if motion is unavailable.';
}

async function ensureGyro({ calibrate = true } = {}) {
  lockPortraitOrientation();
  const granted = await gyro.enable({ calibrate });
  updatePermissionHint(granted);
  return granted;
}

// iOS requires motion permission from a user gesture — bind the first tap anywhere.
let motionGestureBound = false;
function bindMotionGesture() {
  if (motionGestureBound) return;
  motionGestureBound = true;
  document.addEventListener(
    'pointerdown',
    () => {
      ensureGyro({ calibrate: false }).then((granted) => {
        updatePermissionHint(granted);
      });
    },
    { once: true, passive: true }
  );
}
bindMotionGesture();

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
      tiltHint.textContent = 'Tilt to steer · Tap moves · Best of 5 online (first to 3)';
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
    registerE2E,
  }) {
    const remote = createRemoteInput({
      localSlot: getLocalSlot,
      inputBuffer,
      netClient,
      isOnline: getIsOnline,
    });

    let pingTimer = 0;

    function syncGyroSteer(state) {
      const steer = gyro.getSteerAnalog();
      inputBuffer.setSteer(steer.x, steer.y);
      return steer;
    }

    registerE2E?.({
      getGyroState() {
        const steer = inputBuffer.getSteer();
        return {
          steer,
          steerMag: Math.hypot(steer.x, steer.y),
          active: gyro.isActive(),
          fallback: gyro.isUsingFallback(),
        };
      },
      async enableGyro(opts = {}) {
        return ensureGyro(opts);
      },
      refreshGyroSteer() {
        return syncGyroSteer();
      },
      calibrateGyro() {
        return gyro.calibrateNow();
      },
      simulateOrientation(beta, gamma) {
        gyro.injectTestOrientation(beta, gamma);
      },
    });

    return {
      queueAbility(slot) {
        inputBuffer.queueAbility(slot);
      },
      getSteerMag() {
        return remote.getSteerMag();
      },
      getSteer() {
        return remote.getSteer();
      },
      applySteering(state) {
        if (getIsOnline()) {
          syncGyroSteer(state);
          remote.applySteering(state);
          return;
        }
        const body = state.playerBody;
        const spin = state.playerSpin;
        gyro.applyGyroSteer(body, spin);
        applyAISteering(state.aiBody, state.playerBody, state.aiSpin, state.playerSpin);
        tickAIAbilities(state, (slot) => getGameRef().triggerAbility('ai', slot));
      },
      onNetFrame({ snapAge, dt, serverTick, interpDelay, localErr, remoteErr, snapsPerSec }) {
        netDebug.update({
          snapAge,
          serverTick,
          interpDelayTicks: interpDelay,
          localErr,
          remoteErr,
          snapsPerSec,
        });
        pingTimer += dt ?? 0;
        if (pingTimer < 1) return;
        pingTimer = 0;
        if (!getIsOnline()) return;
        netClient.ping().then((result) => {
          if (!result) return;
          netDebug.update({ pingMs: result.rtt });
          getGameRef()?.setNetRtt?.(result.rtt);
        });
      },
      async onStartClick(startGame) {
        btnStart.disabled = true;
        btnStart.textContent = 'Requesting…';
        await ensureGyro();
        if (getIsOnline()) {
          btnStart.textContent = 'Waiting for match…';
          btnStart.disabled = true;
          return;
        }
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
      prepareOnline: () => ensureGyro(),
      onRecalibrate() {
        ensureGyro().then(() => {
          gyro.calibrateNow();
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
      btnStart.disabled = false;
    }
  },
});

document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
