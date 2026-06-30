import { createKeyboardInput } from './input/keyboard.js';
import { applyAISteering, tickAIAbilities } from './input/ai.js';
import { createAppBootstrap } from './app/bootstrap.js?v=22';
import { GAME_MODES, isVsCpu, isOnline, modeBlurb } from './game/modes.js';
import { createRemoteInput } from './net/remoteInput.js';
import { steerFromKeys, PC_STEER_MAP } from './net/inputBuffer.js';

const startOverlay = document.getElementById('start-overlay');
const selectOverlay = document.getElementById('select-overlay');
const playSetupEl = document.getElementById('play-setup');
const startBlurb = document.getElementById('start-blurb');
const startKeys = document.getElementById('start-keys');
const controlsHint = document.getElementById('controls-hint');
const playerHudLabel = document.getElementById('player-hud-label');
const aiHudLabel = document.getElementById('ai-hud-label');
const btnStart = document.getElementById('btn-start');

createAppBootstrap({
  platform: 'pc',
  canvas: document.getElementById('game-canvas'),
  playSetupEl,
  selectOverlay,
  startOverlay,
  btnStart,
  show2Player: true,
  applyPlatformModeUi({ gameMode, isVsCpu: vsCpu, isOnline: online }) {
    document.body.classList.toggle('vs-cpu', vsCpu);
    document.body.classList.toggle('vs-2p', gameMode === GAME_MODES.TWO_PLAYER);
    document.body.classList.toggle('vs-online', online);

    const btnChangeBey = document.getElementById('btn-change-bey');
    btnChangeBey?.classList.toggle('hidden', online);

    if (playerHudLabel) {
      playerHudLabel.textContent = online ? 'You · Spin' : vsCpu ? 'You · Spin' : 'P1 · Spin';
    }
    if (aiHudLabel) {
      aiHudLabel.textContent = online ? 'Rival · Spin' : vsCpu ? 'CPU · Spin' : 'P2 · Spin';
    }

    if (controlsHint) {
      if (online) {
        controlsHint.innerHTML =
          'WASD to steer · <kbd>Q</kbd> power · <kbd>E</kbd> special · Best of 5 (first to 3)';
      } else if (vsCpu) {
        controlsHint.innerHTML = 'WASD to steer · <kbd>Q</kbd> power · <kbd>E</kbd> special';
      } else {
        controlsHint.innerHTML =
          'P1: WASD · <kbd>Q</kbd> power · <kbd>E</kbd> special &nbsp;|&nbsp; P2: Arrows · <kbd>,</kbd> power · <kbd>.</kbd> special';
      }
    }

    if (startBlurb) startBlurb.textContent = modeBlurb(gameMode);
    if (startKeys) startKeys.style.display = gameMode === GAME_MODES.TWO_PLAYER ? 'flex' : 'none';
  },
  queryUiOptions: {
    controlsHintId: 'controls-hint',
    playerAbilitiesId: 'p1-abilities',
    aiAbilitiesId: 'p2-abilities',
  },
  buildInput({
    getGameRef,
    getGameMode,
    getBeysChosen,
    campaignCtrl,
    onlineCtrl,
    openBeySelect,
    startOverlay,
    resetAIController,
    netClient,
    inputBuffer,
    netDebug,
    getIsOnline,
    getLocalSlot,
  }) {
    function startOfflineMatch(startGame = () => getGameRef()?.startGame()) {
      if (getIsOnline()) return;
      resetAIController();
      startGame();
      campaignCtrl.updateHud();
    }

    const keyboard = createKeyboardInput(
      () => {
        if (!getBeysChosen() || startOverlay.classList.contains('hidden')) return;
        startOfflineMatch();
      },
      () => {
        const gameRef = getGameRef();
        if (!gameRef?.state.gameFrozen) return;
        if (getIsOnline() && onlineCtrl?.isAwaitingRoundReady()) return;
        if (getIsOnline() && onlineCtrl?.isActive()) {
          onlineCtrl.handleRestart();
          return;
        }
        if (campaignCtrl.handlesRestart()) {
          campaignCtrl.handleRestart(gameRef.resetGame.bind(gameRef));
        }
      },
      (player, slot) => {
        if (getIsOnline()) {
          if (player === 1) getGameRef()?.triggerAbility('player', slot);
          return;
        }
        if (isVsCpu(getGameMode()) && player === 2) return;
        getGameRef()?.triggerAbility(player === 1 ? 'player' : 'ai', slot);
      },
      {
        canRestart: () => {
          const gameRef = getGameRef();
          if (!gameRef?.state.gameFrozen) return false;
          if (getIsOnline() && onlineCtrl?.isAwaitingRoundReady()) return false;
          return true;
        },
        canStart: () => getBeysChosen() && !startOverlay.classList.contains('hidden'),
        resolveAbilityKey(code) {
          if (!getIsOnline()) return undefined;
          if (code === 'KeyQ') return { player: 1, slot: 'power' };
          if (code === 'KeyE') return { player: 1, slot: 'special' };
          return undefined;
        },
      }
    );

    const remote = createRemoteInput({
      localSlot: getLocalSlot,
      inputBuffer,
      netClient,
      isOnline: getIsOnline,
    });

    let pingTimer = 0;

    const keyState = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
    };

    window.addEventListener('keydown', (e) => {
      if (e.code in keyState) keyState[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code in keyState) keyState[e.code] = false;
    });

    return {
      clearKeys: keyboard.clearKeys,
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
          const s = steerFromKeys(keyState, PC_STEER_MAP);
          inputBuffer.setSteer(s.x, s.y);
          remote.applySteering(state);
          return;
        }
        if (isVsCpu(getGameMode())) {
          keyboard.applyPlayer1Steer(state.playerBody, state.playerSpin);
          applyAISteering(state.aiBody, state.playerBody, state.aiSpin, state.playerSpin);
          tickAIAbilities(state, (slot) => getGameRef().triggerAbility('ai', slot));
        } else {
          keyboard.applyPlayer1Steer(state.playerBody, state.playerSpin);
          keyboard.applyPlayer2Steer(state.aiBody, state.aiSpin);
        }
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
      onStartClick(startGame) {
        startOfflineMatch(startGame);
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
      onRecalibrate() {
        if (!getIsOnline()) return;
        keyboard.clearKeys();
      },
    };
  },
});
