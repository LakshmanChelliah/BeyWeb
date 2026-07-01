import { createGame } from '../game/engine.js?v=21';
import { applyAISteering, tickAIAbilities, resetAIController } from '../input/ai.js?v=21';
import { createBeySelection } from '../ui/selection.js?v=21';
import { createPlaySetup } from '../ui/playSetup.js?v=21';
import { queryGameUi } from '../ui/domRefs.js?v=21';
import { createCampaignController } from '../game/campaignController.js?v=21';
import { createOnlineController } from '../game/onlineController.js?v=21';
import { createOnlineLobby } from '../ui/onlineLobby.js?v=21';
import { createOnlineSelection } from '../ui/onlineSelection.js?v=21';
import { createNetClient } from '../net/client.js?v=21';
import { createInputBuffer } from '../net/inputBuffer.js?v=21';
import { createNetDebug } from '../net/debug.js?v=21';
import { parseRoomFromUrl } from '../net/protocol.js?v=21';
import { GAME_MODES, isVsCpu, isOnline, modeBlurb } from '../game/modes.js?v=21';

/**
 * Shared mobile/PC bootstrap: campaign, play setup, bey selection, and game wiring.
 */
export function createAppBootstrap({
  platform,
  canvas,
  playSetupEl,
  selectOverlay,
  startOverlay,
  btnStart,
  show2Player = false,
  buildInput,
  queryUiOptions = {},
  applyPlatformModeUi,
  onSelectionComplete,
  initStartOverlayHidden = true,
}) {
  let gameMode = GAME_MODES.TOURNAMENT;
  let difficulty = 1;
  let beysChosen = false;
  let gameRef = null;
  let selection = null;
  let onlineFlowEl = null;
  let onlineLobby = null;
  let onlineStarted = false;
  /** @type {ReturnType<typeof buildInput> | null} */
  let input = null;
  const e2eExtensions = {};

  const netClient = createNetClient();
  const inputBuffer = createInputBuffer();
  const netDebug = createNetDebug();

  const gameoverOverlay = document.getElementById('gameover-overlay');
  const btnRecalibrate = document.getElementById('btn-recalibrate');

  const campaignCtrl = createCampaignController({
    campaignHud: document.getElementById('campaign-hud'),
    gameoverTitle: document.getElementById('gameover-title'),
    gameoverMsg: document.getElementById('gameover-msg'),
    btnRestart: document.getElementById('btn-restart'),
    isEnabled: () => isVsCpu(gameMode),
    getPlayerBey: () => gameRef?.state.playerBey,
    onOpponentChange(opp) {
      gameRef.state.aiBey = opp;
      selection?.setRivalPick(opp);
    },
  });

  const onlineCtrl = createOnlineController({
    campaignHud: document.getElementById('campaign-hud'),
    gameoverTitle: document.getElementById('gameover-title'),
    gameoverMsg: document.getElementById('gameover-msg'),
    gameoverOverlay,
    btnRestart: document.getElementById('btn-restart'),
    btnRecalibrate,
    netClient,
    onRematchPicking() {
      beginOnlineRematchSelection();
    },
    onMainMenu: openBeySelect,
    onMatchStarting() {
      selectOverlay.classList.add('hidden');
      startOverlay.classList.add('hidden');
    },
  });

  function getPlayers() {
    if (gameMode === GAME_MODES.TWO_PLAYER) {
      return [{ label: 'PLAYER 1' }, { label: 'PLAYER 2' }];
    }
    return [{ label: 'YOU' }];
  }

  function getRivalLabel() {
    return isVsCpu(gameMode) ? 'CPU' : null;
  }

  function applyModeUi() {
    applyPlatformModeUi?.({ gameMode, isVsCpu: isVsCpu(gameMode), isOnline: isOnline(gameMode) });
    campaignCtrl.updateHud();
    onlineCtrl.updateHud();
  }

  function ensureOnlineFlow() {
    if (onlineFlowEl) return onlineFlowEl;
    onlineFlowEl = document.createElement('div');
    onlineFlowEl.id = 'online-flow';
    onlineFlowEl.className = 'online-flow hidden';
    selectOverlay.appendChild(onlineFlowEl);
    return onlineFlowEl;
  }

  function showOnlineFlow(show) {
    const mount = selectOverlay.querySelector('.select-mount');
    const picks = selectOverlay.querySelector('.select-picks');
    const flow = ensureOnlineFlow();
    if (show) {
      mount?.classList.add('hidden');
      picks?.classList.add('hidden');
      flow.classList.remove('hidden');
    } else {
      mount?.classList.remove('hidden');
      picks?.classList.remove('hidden');
      flow.classList.add('hidden');
    }
  }

  function clearRoomFromUrl() {
    if (!parseRoomFromUrl()) return;
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function ensureRoomInUrl(roomId) {
    if (!roomId) return;
    const url = new URL(location.href);
    url.searchParams.set('room', roomId);
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function startOnlineFlow({ autoRoom = null, createAsHost = false } = {}) {
    if (autoRoom && !parseRoomFromUrl()) {
      ensureRoomInUrl(autoRoom);
    }

    onlineLobby?.destroy?.();
    netClient.close();
    onlineStarted = false;

    gameMode = GAME_MODES.ONLINE;
    showOnlineFlow(true);
    const flow = ensureOnlineFlow();
    flow.innerHTML = '';
    onlineLobby = createOnlineLobby({
      root: flow,
      netClient,
      onRoomJoined: ensureRoomInUrl,
      onReady() {
        flow.innerHTML = '';
        createOnlineSelection({
          root: flow,
          netClient,
          onPrepareMotion: () => input?.prepareOnline?.(),
          onRevealComplete() {
            onlineCtrl.start(netClient.slot);
            onlineCtrl.updateHud();
            beysChosen = true;
            input.prepareOnline?.();
            onSelectionComplete?.({ beysChosen: true, online: true });
          },
        });
      },
    });
    onlineLobby.start({ autoRoom, createAsHost });
    onlineStarted = true;
  }

  function beginOnlineRematchSelection() {
    gameRef?.tearDownOnlineMatch?.();
    showOnlineFlow(true);
    const flow = ensureOnlineFlow();
    flow.innerHTML = '';
    createOnlineSelection({
      root: flow,
      netClient,
      onPrepareMotion: () => input?.prepareOnline?.(),
      onRevealComplete() {
        onlineCtrl.start(netClient.slot);
        onlineCtrl.updateHud();
        beysChosen = true;
        input.prepareOnline?.();
        selectOverlay.classList.add('hidden');
        startOverlay.classList.add('hidden');
        onSelectionComplete?.({ beysChosen: true, online: true });
      },
    });
    selectOverlay.classList.remove('hidden');
    startOverlay.classList.add('hidden');
    gameoverOverlay?.classList.remove('visible');
    beysChosen = false;
  }

  function openBeySelect({ forceOnlineHost = false } = {}) {
    const savedRoom = forceOnlineHost ? null : netClient.roomId;
    const wasGuest = forceOnlineHost ? false : netClient.slot === 1;

    campaignCtrl.resetCampaign();
    onlineCtrl.reset();
    resetAIController();
    if (isOnline(gameMode)) {
      gameRef?.tearDownOnlineMatch?.();
    }
    netClient.close();
    onlineStarted = false;
    inputBuffer.reset();

    if (isOnline(gameMode)) {
      showOnlineFlow(true);
      const rejoinAsGuest = !forceOnlineHost && (wasGuest || !!parseRoomFromUrl());
      if (rejoinAsGuest && savedRoom && !parseRoomFromUrl()) {
        ensureRoomInUrl(savedRoom);
      }
      startOnlineFlow({
        autoRoom: rejoinAsGuest ? (savedRoom ?? parseRoomFromUrl()) : null,
        createAsHost: !rejoinAsGuest,
      });
    } else {
      showOnlineFlow(false);
      selection?.reset(getPlayers());
      selection?.setRivalLabel(getRivalLabel());
    }

    startOverlay.classList.add('hidden');
    gameRef.returnToMenu();
    selectOverlay.classList.remove('hidden');
    document.getElementById('campaign-hud')?.classList.add('hidden');
    beysChosen = false;
    btnStart.disabled = true;
    if (platform === 'mobile') {
      btnStart.textContent = 'Calibrate & Start';
    }
  }

  function handleSelectionComplete(picks) {
    const { mode, difficulty: diff } = playSetup.getState();
    gameMode = mode;
    difficulty = diff;

    gameRef.state.playerBey = picks[0];
    if (gameMode === GAME_MODES.TOURNAMENT) {
      campaignCtrl.startTournament(picks[0]);
    } else if (gameMode === GAME_MODES.CASUAL) {
      campaignCtrl.startCasual(picks[0], difficulty);
    } else if (gameMode !== GAME_MODES.ONLINE) {
      gameRef.state.aiBey = picks[1];
      campaignCtrl.resetCampaign();
    }
    beysChosen = true;
    btnStart.disabled = false;
    resetAIController();
    applyModeUi();
    onSelectionComplete?.({ beysChosen: true });
    if (gameMode !== GAME_MODES.ONLINE) {
      setTimeout(() => {
        selectOverlay.classList.add('hidden');
        startOverlay.classList.remove('hidden');
      }, 600);
    }
  }

  selection = createBeySelection({
    root: selectOverlay,
    players: getPlayers(),
    rivalLabel: getRivalLabel(),
    onComplete: handleSelectionComplete,
  });

  const playSetup = createPlaySetup(playSetupEl, {
    show2Player,
    showOnline: true,
    onChange({ mode, difficulty: diff }) {
      gameMode = mode;
      difficulty = diff;
      beysChosen = false;
      btnStart.disabled = true;
      campaignCtrl.resetCampaign();
      onlineCtrl.reset();
      applyModeUi();

      if (isOnline(gameMode)) {
        input?.prepareOnline?.();
        gameRef?.snapArenaCameraToCenter?.();
        startOnlineFlow();
      } else {
        onlineStarted = false;
        netClient.close();
        clearRoomFromUrl();
        showOnlineFlow(false);
        gameRef?.snapArenaCameraToCenter?.();
        selection?.reset(getPlayers(), { keepCarousel: true });
        selection?.setRivalLabel(getRivalLabel());
      }

      if (platform === 'mobile') {
        btnStart.textContent = 'Calibrate & Start';
        startOverlay.classList.add('hidden');
      }
    },
  });

  input = buildInput({
    getGameRef: () => gameRef,
    getGameMode: () => gameMode,
    getBeysChosen: () => beysChosen,
    campaignCtrl,
    onlineCtrl,
    openBeySelect,
    startOverlay,
    btnStart,
    resetAIController,
    netClient,
    inputBuffer,
    netDebug,
    getIsOnline: () => isOnline(gameMode),
    getLocalSlot: () => netClient.slot ?? 0,
    registerE2E(ext) {
      Object.assign(e2eExtensions, ext);
    },
  });

  gameRef = createGame({
    mode: platform === 'mobile' ? 'mobile' : 'pc',
    canvas,
    isVsCpu: () => isVsCpu(gameMode),
    isOnline: () => isOnline(gameMode),
    getLocalSlot: () => netClient.slot ?? 0,
    ui: queryGameUi(queryUiOptions),
    input,
  });

  onlineCtrl.wireNetHandlers(gameRef);

  ({ mode: gameMode, difficulty } = playSetup.getState());
  applyModeUi();
  selection?.setRivalLabel(getRivalLabel());
  btnStart.disabled = true;
  if (initStartOverlayHidden) {
    startOverlay.classList.add('hidden');
  }

  if (parseRoomFromUrl()) {
    playSetup.setMode(GAME_MODES.ONLINE, { silent: true });
    gameMode = GAME_MODES.ONLINE;
    applyModeUi();
    startOnlineFlow({ autoRoom: parseRoomFromUrl() });
  }

  const e2eEnabled = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('e2e') === '1';
  if (e2eEnabled) {
    window.__BEYWEB_E2E__ = {
      getState() {
        const overlay = document.getElementById('gameover-overlay');
        const countdown = document.getElementById('countdown-overlay');
        const hud = document.getElementById('hud');
        const btn = document.getElementById('btn-restart');
        return {
          gameFrozen: gameRef?.state.gameFrozen ?? false,
          gameRunning: gameRef?.state.gameRunning ?? false,
          awaitingRoundReady: onlineCtrl.isAwaitingRoundReady(),
          wsOpen: netClient.wsOpen,
          roomId: netClient.roomId,
          slot: netClient.slot,
          roundDebug: onlineCtrl.getDebugRoundState?.(),
          gameoverVisible: overlay?.classList.contains('visible') ?? false,
          countdownVisible: countdown?.classList.contains('visible') ?? false,
          hudVisible: hud?.classList.contains('visible') ?? false,
          restartLabel: btn?.textContent ?? '',
          restartDisabled: btn?.disabled ?? false,
          hasArenaBodies: !!(gameRef?.state.playerBody && gameRef?.state.aiBody),
          onlineActive: onlineCtrl.isActive(),
          onlineMotion: gameRef?.getOnlineMotionStats?.() ?? null,
          lastServerTick: Math.max(
            gameRef?.getLastServerTick?.() ?? 0,
            netClient.lastSnapshotTick ?? 0
          ),
          snapshotCount: netClient.snapshotCount ?? 0,
        };
      },
      tearDownMatch() {
        gameRef?.tearDownOnlineMatch?.();
      },
      sendDebugRoundEnd() {
        netClient.send({
          type: 'debug_round_end',
          roomId: netClient.roomId,
          slot: netClient.slot,
        });
      },
      sendReady() {
        netClient.sendReady();
      },
      clickNextRound() {
        onlineCtrl.handleRestart();
      },
      dispatchMessage(type, payload) {
        netClient.debugEmit(type, payload);
      },
      netClient,
      onlineCtrl,
      gameRef,
      ...e2eExtensions,
    };
  }

  if (typeof window !== 'undefined') {
    window.__BEYWEB_BOOTED__ = true;
    clearTimeout(window.__BEYWEB_BOOT_TIMEOUT__);
  }

  return {
    gameRef,
    selection,
    campaignCtrl,
    onlineCtrl,
    playSetup,
    netClient,
    get gameMode() { return gameMode; },
  };
}
