import { resetAIController, setAIDifficulty } from '../input/ai.js';
import { createCampaign, CAMPAIGN_OPPONENT_IDS, CAMPAIGN_STAGE_COUNT } from './campaign.js';
import { createCasualMode } from './casualMode.js';
import { getBeyById } from './beys.js';

/**
 * Wires tournament + casual progression to DOM and game callbacks (PC and mobile).
 */
export function createCampaignController({
  campaignHud,
  gameoverTitle,
  gameoverMsg,
  btnRestart,
  isEnabled = () => true,
  onOpponentChange,
}) {
  const tournament = createCampaign();
  const casual = createCasualMode();
  let activeMode = null;
  let restartAction = 'next-round';

  function isActive() {
    return isEnabled() && activeMode != null && currentMode().isActive();
  }

  function currentMode() {
    return activeMode === 'casual' ? casual : tournament;
  }

  function updateHud() {
    if (!campaignHud) return;
    if (!isActive()) {
      campaignHud.classList.add('hidden');
      campaignHud.textContent = '';
      return;
    }

    const opp = currentMode().getCurrentOpponent();

    if (activeMode === 'casual') {
      campaignHud.textContent = `Casual · vs ${opp?.name ?? 'CPU'}`;
      campaignHud.classList.remove('hidden');
      return;
    }

    const { player, cpu } = tournament.getSeriesScore();
    const tier = tournament.getAiTier() + 1;
    campaignHud.textContent =
      `Tournament ${tier}/${CAMPAIGN_STAGE_COUNT} · Best of 3: ${player}–${cpu} · vs ${opp?.name ?? 'CPU'}`;
    campaignHud.classList.remove('hidden');
  }

  function beginOpponent() {
    const opp = currentMode().getCurrentOpponent();
    setAIDifficulty(currentMode().getAiTier());
    onOpponentChange(opp);
    updateHud();
  }

  function handleCasualMatchEnd(result) {
    const opp = casual.getCurrentOpponent();
    const oppName = opp?.name ?? 'CPU';

    if (result.outcome === 'DRAW') {
      restartAction = 'rematch';
      btnRestart.textContent = 'Rematch';
      gameoverMsg.textContent = `Draw vs ${oppName} — fight again!`;
      return;
    }

    restartAction = 'rematch';
    btnRestart.textContent = result.winner === 1 ? 'Play Again' : 'Try Again';

    if (result.winner === 1) {
      gameoverTitle.textContent = 'VICTORY!';
      gameoverTitle.className = 'win';
      gameoverMsg.textContent = `You defeated ${oppName}!`;
    } else {
      gameoverTitle.textContent = 'DEFEATED';
      gameoverTitle.className = 'lose';
      gameoverMsg.textContent = `${oppName} wins — try again!`;
    }
  }

  function handleTournamentMatchEnd(result) {
    const isDraw = result.outcome === 'DRAW';
    if (!isDraw) tournament.recordMatch(result.winner);

    const { player, cpu } = tournament.getSeriesScore();
    const scoreLine = `Series: ${player}–${cpu}`;
    const seriesStatus = tournament.getSeriesStatus();

    if (isDraw) {
      restartAction = 'next-round';
      btnRestart.textContent = 'Rematch';
      gameoverMsg.textContent = `${scoreLine} — rematch this round.`;
      updateHud();
      return;
    }

    if (seriesStatus === 'ongoing') {
      restartAction = 'next-round';
      btnRestart.textContent = 'Next Round';
      gameoverMsg.textContent = `${scoreLine} — first to 2 wins the series.`;
      updateHud();
      return;
    }

    if (seriesStatus === 'cpu') {
      restartAction = 'retry-tournament';
      btnRestart.textContent = 'Try Again';
      gameoverTitle.textContent = 'DEFEATED';
      gameoverTitle.className = 'lose';
      gameoverMsg.textContent = `${scoreLine} — the CPU won this series.`;
      campaignHud?.classList.add('hidden');
      return;
    }

    if (tournament.isCampaignComplete()) {
      restartAction = 'retry-tournament';
      btnRestart.textContent = 'Play Again';
      gameoverTitle.textContent = 'CHAMPION!';
      gameoverTitle.className = 'win';
      gameoverMsg.textContent = `You beat all ${CAMPAIGN_STAGE_COUNT} rivals — tournament complete!`;
      campaignHud?.classList.add('hidden');
      return;
    }

    const nextOpp = getBeyById(CAMPAIGN_OPPONENT_IDS[tournament.getOpponentIndex() + 1]);
    restartAction = 'next-opponent';
    btnRestart.textContent = 'Next Rival';
    gameoverTitle.textContent = 'SERIES WON!';
    gameoverTitle.className = 'win';
    gameoverMsg.textContent = `${scoreLine} — next up: ${nextOpp?.name ?? 'CPU'} (harder CPU).`;
  }

  function handleMatchEnd(result) {
    if (!isActive()) return;

    if (activeMode === 'casual') {
      handleCasualMatchEnd(result);
      return;
    }

    handleTournamentMatchEnd(result);
  }

  function handleRestart(resetGame) {
    if (activeMode === 'casual') {
      resetAIController();
      resetGame();
      return;
    }

    if (restartAction === 'retry-tournament') {
      tournament.start();
      beginOpponent();
      resetAIController();
      resetGame();
      return;
    }

    if (restartAction === 'next-opponent') {
      tournament.advanceOpponent();
      beginOpponent();
      resetAIController();
      resetGame();
      return;
    }

    resetAIController();
    resetGame();
  }

  return {
    tournament,
    casual,
    updateHud,
    beginOpponent,
    handleMatchEnd,
    handleRestart,
    startTournament() {
      activeMode = 'tournament';
      tournament.start();
      beginOpponent();
    },
    startCasual(opponentBey) {
      activeMode = 'casual';
      casual.start(opponentBey);
      beginOpponent();
    },
    resetCampaign() {
      activeMode = null;
      tournament.reset();
      casual.reset();
      updateHud();
    },
    handlesRestart() {
      return isActive();
    },
    /** @deprecated Use startTournament */
    startCampaign() {
      this.startTournament();
    },
  };
}
