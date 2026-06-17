import { CONFIG } from '../config.js';
import { isRingOut, isPlatformOut } from '../physics/arena.js';

/** True when spin is fully gone, death anim finished, and the still delay elapsed. */
export function isSleepOutReady(spin, body) {
  if (spin > CONFIG.SPIN_STOPPED) return false;
  if ((body?.userData?.deathAnimT ?? 0) < CONFIG.DEATH_ANIM_DUR) return false;
  const delay = body?.userData?.sleepOutDelay;
  return delay != null && delay <= 0;
}

/**
 * Evaluates KO / SO / draw each frame.
 * KO takes priority, then sleep-out (only after full stop + wobble settle), then dual-sleep draw.
 */
export function evaluateWin(state) {
  const { playerBody, aiBody, playerSpin, aiSpin, gameFrozen, pendingKo, launchGrace } = state;
  if (!playerBody || !aiBody || gameFrozen || pendingKo || launchGrace > 0) return null;

  const pRadius = playerBody.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
  const aRadius = aiBody.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;

  const px = playerBody.position.x;
  const pz = playerBody.position.z;
  const ax = aiBody.position.x;
  const az = aiBody.position.z;

  if (isRingOut(px, pz, pRadius) || isPlatformOut(px, pz, pRadius)) {
    return { outcome: 'KO', winner: 2, loser: 1, cinematic: true };
  }
  if (isRingOut(ax, az, aRadius) || isPlatformOut(ax, az, aRadius)) {
    return { outcome: 'KO', winner: 1, loser: 2, cinematic: true };
  }

  const pSleep = isSleepOutReady(playerSpin, playerBody);
  const aSleep = isSleepOutReady(aiSpin, aiBody);
  const pOnPlatform = !isPlatformOut(px, pz, pRadius);
  const aOnPlatform = !isPlatformOut(ax, az, aRadius);

  if (pSleep && aSleep && pOnPlatform && aOnPlatform) {
    return { outcome: 'DRAW', winner: null, loser: null };
  }

  if (pSleep && !aSleep && pOnPlatform) {
    return { outcome: 'SO', winner: 2, loser: 1 };
  }
  if (aSleep && !pSleep && aOnPlatform) {
    return { outcome: 'SO', winner: 1, loser: 2 };
  }

  return null;
}

/** Tracks which bey fully stopped first (after wobble), for messaging. */
export function trackSleepers(state) {
  const pSleep = isSleepOutReady(state.playerSpin, state.playerBody);
  const aSleep = isSleepOutReady(state.aiSpin, state.aiBody);

  if (pSleep && !state.firstSleeper) state.firstSleeper = 1;
  else if (aSleep && !state.firstSleeper) state.firstSleeper = 2;
}

export function formatEndGame(result, mode) {
  const { outcome, winner } = result;

  if (outcome === 'DRAW') {
    return {
      title: 'DRAW!',
      titleClass: 'draw',
      message: 'Both beys stopped spinning. Rematch!',
    };
  }

  if (mode === 'mobile' || mode === 'pc-cpu') {
    const playerWon = winner === 1;
    if (outcome === 'KO') {
      return {
        title: playerWon ? 'VICTORY!' : 'KNOCKOUT!',
        titleClass: playerWon ? 'win' : 'lose',
        message: playerWon
          ? 'Knock Out! You launched the rival from the stadium!'
          : 'You were knocked out of the stadium!',
      };
    }
    return {
      title: playerWon ? 'VICTORY!' : 'SLEEP OUT!',
      titleClass: playerWon ? 'win' : 'lose',
      message: playerWon
        ? 'Sleep Out! Your bey was still spinning!'
        : 'Your bey stopped spinning first.',
    };
  }

  if (outcome === 'KO') {
    return {
      title: `PLAYER ${winner} WINS!`,
      titleClass: 'win',
      message: `Player ${winner}: Knock Out!`,
    };
  }

  return {
    title: `PLAYER ${winner} WINS!`,
    titleClass: 'win',
    message: `Player ${winner}: Sleep Out!`,
  };
}
