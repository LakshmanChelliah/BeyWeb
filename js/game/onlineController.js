import { MSG, WINS_NEEDED } from '../net/protocol.js';
import { getBeyOrDefault } from './beys.js';

const MAX_ROUNDS = 3;

function winnerToSlot(winner) {
  if (winner === 1) return 0;
  if (winner === 2) return 1;
  return null;
}

/**
 * Online best-of-3 series UI controller (mirrors campaignController patterns).
 */
export function createOnlineController({
  campaignHud,
  gameoverTitle,
  gameoverMsg,
  gameoverOverlay,
  btnRestart,
  btnRecalibrate,
  netClient,
  onRematchPicking,
  onMainMenu,
  onMatchStarting,
}) {
  const RIP_PHRASE = 'Let It Rip!';
  let active = false;
  let scores = [0, 0];
  let localSlot = 0;
  let restartAction = 'next-round';
  let localReady = false;
  let readyCount = 0;
  let awaitingBothReady = false;
  let countdownAuthorized = false;
  let roundEndMsg = '';
  /** @type {('win'|'loss'|'draw')[]} */
  let roundResults = [];
  let countdownHideTimer = null;
  let rematchStartCommitted = false;

  let roundStartCommitted = false;
  let readyStatusEl = document.getElementById('gameover-ready');

  function usesReadyGate() {
    return restartAction === 'next-round' || restartAction === 'rematch';
  }

  function readyActionLabel() {
    return restartAction === 'rematch' ? 'Rematch' : 'Next Round';
  }

  function isActive() {
    return active;
  }

  function start(slot) {
    active = true;
    localSlot = slot;
    scores = [0, 0];
    roundResults = [];
    localReady = false;
    readyCount = 0;
    awaitingBothReady = false;
    countdownAuthorized = false;
    roundStartCommitted = false;
    rematchStartCommitted = false;
    updateHud();
    updateRecalibrateVisibility();
  }

  function reset() {
    active = false;
    scores = [0, 0];
    roundResults = [];
    localReady = false;
    readyCount = 0;
    awaitingBothReady = false;
    countdownAuthorized = false;
    roundStartCommitted = false;
    rematchStartCommitted = false;
    campaignHud?.classList.add('hidden');
    hideCountdown();
    paintReadyStatus();
    updateRecalibrateVisibility();
  }

  function updateRecalibrateVisibility() {
    if (!btnRecalibrate) return;
    if (!active) {
      btnRecalibrate.classList.remove('hidden');
      return;
    }
    const showMobileGyro = document.body.classList.contains('mobile');
    btnRecalibrate.classList.toggle('hidden', !showMobileGyro);
    btnRecalibrate.disabled = false;
    btnRecalibrate.removeAttribute('aria-busy');
  }

  function renderScoreLights() {
    if (!campaignHud || !active) return;
    const lights = [];
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const result = roundResults[i];
      const state = result ?? 'pending';
      const label = result === 'win' ? 'Round won' : result === 'loss' ? 'Round lost' : result === 'draw' ? 'Draw' : 'Upcoming round';
      lights.push(`<span class="score-light score-light--${state}" title="${label}" aria-label="${label}"></span>`);
    }
    campaignHud.innerHTML = `<div class="online-score-lights" aria-label="Your series">${lights.join('')}</div>`;
    campaignHud.classList.remove('hidden');
  }

  function updateHud() {
    renderScoreLights();
  }

  function ensureReadyStatusEl() {
    if (readyStatusEl || !gameoverMsg) return readyStatusEl;
    readyStatusEl = document.createElement('p');
    readyStatusEl.id = 'gameover-ready';
    readyStatusEl.className = 'gameover-ready hidden';
    readyStatusEl.setAttribute('aria-live', 'polite');
    gameoverMsg.insertAdjacentElement('afterend', readyStatusEl);
    return readyStatusEl;
  }

  function paintReadyStatus() {
    const el = ensureReadyStatusEl();
    if (!el) return;
    if (!usesReadyGate() || !awaitingBothReady) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.classList.remove('hidden');
    const action = readyActionLabel();
    if (readyCount >= 2) {
      el.textContent = restartAction === 'rematch'
        ? 'Both ready — choosing beys…'
        : 'Both ready — starting soon…';
    } else if (localReady) {
      el.textContent = `Waiting for opponent (${readyCount}/2)`;
    } else if (readyCount > 0) {
      el.textContent = `Opponent is ready — tap ${action} (1/2)`;
    } else {
      el.textContent = `Both players must tap ${action} (0/2)`;
    }
  }

  function paintReadyButton() {
    if (!btnRestart || !usesReadyGate()) return;
    btnRestart.textContent = `${readyActionLabel()} (${readyCount}/2)`;
    btnRestart.disabled = localReady;
    btnRestart.classList.toggle('ready-waiting', localReady);
    paintReadyStatus();
  }

  function resetReadyState() {
    localReady = false;
    readyCount = 0;
    paintReadyButton();
  }

  function recordRoundResult(msg) {
    if (roundResults.length >= MAX_ROUNDS) return;
    if (msg.isDraw) {
      roundResults.push('draw');
      return;
    }
    const winnerSlot = winnerToSlot(msg.winner);
    roundResults.push(winnerSlot === localSlot ? 'win' : 'loss');
  }

  function showRoundEndOverlay(msg) {
    if (msg.isDraw) {
      gameoverTitle.textContent = 'DRAW';
      gameoverTitle.className = 'draw';
      roundEndMsg = 'Same spin — both players tap Next Round to continue';
      gameoverMsg.textContent = roundEndMsg;
      return;
    }
    const winnerSlot = winnerToSlot(msg.winner);
    const won = winnerSlot === localSlot;
    gameoverTitle.textContent = won ? 'ROUND WON!' : 'ROUND LOST';
    gameoverTitle.className = won ? 'win' : 'lose';
    const outcome = msg.outcome === 'KO' ? 'Knockout' : 'Sleep out';
    roundEndMsg = won ? `You took the round (${outcome})` : `Opponent took the round (${outcome})`;
    gameoverMsg.textContent = roundEndMsg;
  }

  function isCountdownAuthorized() {
    return countdownAuthorized || readyCount >= 2;
  }

  function canStartRound() {
    return !awaitingBothReady || isCountdownAuthorized();
  }

  function canShowCountdown() {
    return canStartRound();
  }

  function hideCountdown() {
    if (countdownHideTimer) {
      clearTimeout(countdownHideTimer);
      countdownHideTimer = null;
    }
    document.getElementById('countdown-overlay')?.classList.remove('visible', 'countdown-overlay--rip');
  }

  function tryStartNextRound(gameRef) {
    if (!canStartRound()) return false;
    if (roundStartCommitted) {
      if (!awaitingBothReady && (gameRef.state.gameRunning || !gameRef.state.gameFrozen)) {
        return true;
      }
      roundStartCommitted = false;
    }

    roundStartCommitted = true;
    awaitingBothReady = false;
    countdownAuthorized = false;
    localReady = false;
    readyCount = 0;
    paintReadyStatus();
    onMatchStarting?.();
    gameRef.spawnTops();
    gameRef.state.gameFrozen = false;
    gameoverOverlay?.classList.remove('visible');
    gameRef.startOnlineRound?.();
    if (btnRestart) {
      btnRestart.disabled = false;
      btnRestart.classList.remove('ready-waiting');
    }
    return true;
  }

  function tryBeginRematchPicking() {
    if (!canStartRound()) return false;
    if (restartAction !== 'rematch') return false;
    if (rematchStartCommitted) {
      if (!awaitingBothReady) return true;
      rematchStartCommitted = false;
    }

    rematchStartCommitted = true;
    awaitingBothReady = false;
    countdownAuthorized = false;
    localReady = false;
    readyCount = 0;
    paintReadyStatus();
    gameoverOverlay?.classList.remove('visible');
    onRematchPicking?.();
    if (btnRestart) {
      btnRestart.disabled = false;
      btnRestart.classList.remove('ready-waiting');
    }
    return true;
  }

  function wireNetHandlers(gameRef) {
    netClient.on(MSG.MATCH_CONFIG, (msg) => {
      const slot = netClient.slot ?? 0;
      start(slot);
      scores = msg.scores ?? [0, 0];
      gameRef.state.playerBey = getBeyOrDefault(msg.beyIds?.[0], 'pegasus');
      gameRef.state.aiBey = getBeyOrDefault(msg.beyIds?.[1], 'ldrago');
      updateHud();
    });

    netClient.on(MSG.COUNTDOWN, (msg) => {
      if (canShowCountdown()) {
        showCountdown(msg.seconds);
      }
      tryStartNextRound(gameRef);
      if (msg.seconds === 0 && !gameRef.state.gameRunning) {
        tryStartNextRound(gameRef);
      }
    });

    netClient.on(MSG.SNAPSHOT, (msg) => {
      if (
        !awaitingBothReady &&
        !gameRef.state.gameRunning &&
        !gameRef.state.gameFrozen &&
        msg.tick > 0 &&
        gameRef.state.playerBody
      ) {
        gameRef.startOnlineRound?.();
      }
      gameRef.applyNetSnapshot?.(msg);
    });

    netClient.on(MSG.ROUND_END, (msg) => {
      scores = msg.scores ?? scores;
      recordRoundResult(msg);
      updateHud();
      if (msg.seriesOver) return;

      restartAction = 'next-round';
      awaitingBothReady = true;
      countdownAuthorized = false;
      roundStartCommitted = false;
      rematchStartCommitted = false;
      hideCountdown();
      resetReadyState();
      paintReadyButton();
      showRoundEndOverlay(msg);
      gameRef.endOnlineRound?.();
      updateRecalibrateVisibility();
    });

    netClient.on(MSG.READY_STATUS, (msg) => {
      readyCount = msg.readyCount ?? 0;
      const bothReady = msg.bothReady === true
        || (msg.slots?.[0] === true && msg.slots?.[1] === true);
      countdownAuthorized = bothReady;
      paintReadyButton();
      if (bothReady && awaitingBothReady) {
        if (restartAction === 'rematch') {
          tryBeginRematchPicking();
        } else {
          tryStartNextRound(gameRef);
        }
      }
    });

    netClient.on(MSG.SERIES_END, (msg) => {
      awaitingBothReady = true;
      countdownAuthorized = false;
      roundStartCommitted = false;
      rematchStartCommitted = false;
      paintReadyStatus();
      scores = msg.scores ?? scores;
      const won = msg.winner === localSlot;
      gameoverTitle.textContent = won ? 'VICTORY!' : 'DEFEATED';
      gameoverTitle.className = won ? 'win' : 'lose';
      const label = msg.forfeit ? ' (forfeit)' : '';
      const summary = won
        ? `You won the series${label}!`
        : `You lost the series${label}.`;
      gameoverMsg.textContent = `${summary} Both players tap Rematch to play again.`;
      restartAction = 'rematch';
      resetReadyState();
      updateHud();
      gameRef.endOnlineRound?.();
      updateRecalibrateVisibility();
    });

    netClient.on(MSG.FORFEIT, () => {
      restartAction = 'rematch';
    });

    netClient.on(MSG.PEER_LEFT, () => {
      gameoverTitle.textContent = 'OPPONENT LEFT';
      gameoverTitle.className = 'lose';
      gameoverMsg.textContent = 'Your opponent disconnected.';
      gameRef.state.gameFrozen = true;
      gameRef.state.gameRunning = false;
      gameRef.endOnlineRound?.();
    });
  }

  function showCountdown(seconds) {
    let el = document.getElementById('countdown-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'countdown-overlay';
      el.className = 'countdown-overlay';
      document.body.appendChild(el);
    }

    if (countdownHideTimer) {
      clearTimeout(countdownHideTimer);
      countdownHideTimer = null;
    }

    el.classList.remove('countdown-overlay--rip');

    if (seconds <= 0) {
      el.textContent = RIP_PHRASE;
      el.classList.add('countdown-overlay--rip', 'visible');
      countdownHideTimer = setTimeout(() => {
        el.classList.remove('visible', 'countdown-overlay--rip');
        countdownHideTimer = null;
      }, 1300);
      return;
    }

    el.textContent = String(seconds);
    el.classList.add('visible');
  }

  function handlesRestart() {
    return active;
  }

  function handleRestart() {
    if (!usesReadyGate()) return;
    if (!awaitingBothReady || localReady) return;
    localReady = true;
    if (!netClient.sendReady()) {
      localReady = false;
      paintReadyButton();
      return;
    }
    paintReadyButton();
  }

  function handleMatchEnd() {
    // Online: server drives round end via MSG.ROUND_END
  }

  function isAwaitingRoundReady() {
    return awaitingBothReady;
  }

  function getDebugRoundState() {
    return {
      awaitingBothReady,
      countdownAuthorized,
      readyCount,
      localReady,
      roundStartCommitted,
    };
  }

  return {
    start,
    reset,
    isActive,
    isAwaitingRoundReady,
    updateHud,
    wireNetHandlers,
    handlesRestart,
    handleRestart,
    handleMatchEnd,
    getDebugRoundState,
    get localSlot() { return localSlot; },
    setScores(s) { scores = s; updateHud(); },
  };
}

export { WINS_NEEDED };
