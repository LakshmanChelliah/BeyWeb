import {
  resetAIController,
  setAIDifficulty,
  setAIContext,
  getDifficultyLabel,
  AI_TIER_MAX,
} from '../input/ai.js';
import {
  createCampaign,
  CAMPAIGN_OPPONENT_IDS,
  CAMPAIGN_STAGE_COUNT,
  getAiTierForOpponentId,
  pickRandomRival,
  pickTournamentOpponent,
} from './campaign.js';
import { createCasualMode } from './casualMode.js';

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
  getPlayerBey = () => null,
}) {
  const tournament = createCampaign();
  const casual = createCasualMode();
  let activeMode = null;
  let userDifficultyTier = 1;
  let restartAction = 'next-round';

  function isActive() {
    return isEnabled() && activeMode != null && currentMode().isActive();
  }

  function currentMode() {
    return activeMode === 'casual' ? casual : tournament;
  }

  function getEffectiveAiTier() {
    if (activeMode === 'casual') return casual.getAiTier();
    const stage = tournament.getOpponentIndex();
    const opp = tournament.getCurrentOpponent();
    const beyTier = opp ? getAiTierForOpponentId(opp.id) : stage;
    return Math.min(Math.max(stage, beyTier), AI_TIER_MAX);
  }

  function setTournamentOpponent() {
    const opp = pickTournamentOpponent(tournament.getOpponentIndex(), getPlayerBey());
    tournament.setOpponent(opp);
    return opp;
  }

  function rollAndSetOpponent() {
    const playerBey = getPlayerBey();
    if (activeMode === 'casual') {
      const opp = pickRandomRival(playerBey);
      casual.start(opp, userDifficultyTier);
      return opp;
    }
    return setTournamentOpponent();
  }

  function updateHud() {
    if (!campaignHud) return;
    if (!isActive()) {
      campaignHud.classList.add('hidden');
      campaignHud.textContent = '';
      return;
    }

    const opp = currentMode().getCurrentOpponent();
    const diffLabel = getDifficultyLabel(getEffectiveAiTier());

    if (activeMode === 'casual') {
      campaignHud.textContent = `Casual · ${diffLabel} · vs ${opp?.name ?? 'CPU'}`;
      campaignHud.classList.remove('hidden');
      return;
    }

    const { player, cpu } = tournament.getSeriesScore();
    const tier = tournament.getOpponentIndex() + 1;
    campaignHud.textContent =
      `Tournament ${tier}/${CAMPAIGN_STAGE_COUNT} · Best of 3: ${player}–${cpu} · ${diffLabel} · vs ${opp?.name ?? 'CPU'}`;
    campaignHud.classList.remove('hidden');
  }

  function beginOpponent() {
    setAIContext({ tournament: activeMode !== 'casual' });
    setAIDifficulty(getEffectiveAiTier());
    const opp = currentMode().getCurrentOpponent();
    onOpponentChange(opp);
    updateHud();
  }

  function handleCasualMatchEnd(result) {
    const opp = casual.getCurrentOpponent();
    const oppName = opp?.name ?? 'CPU';

    if (result.outcome === 'DRAW') {
      restartAction = 'rematch-same';
      btnRestart.textContent = 'Rematch';
      gameoverMsg.textContent = `Draw vs ${oppName}. Fight again!`;
      return;
    }

    if (result.winner === 1) {
      restartAction = 'rematch-random';
      btnRestart.textContent = 'Next Rival';
      gameoverTitle.textContent = 'VICTORY!';
      gameoverTitle.className = 'win';
      gameoverMsg.textContent = `You defeated ${oppName}! Next rival is random.`;
    } else {
      restartAction = 'rematch-same';
      btnRestart.textContent = 'Try Again';
      gameoverTitle.textContent = 'DEFEATED';
      gameoverTitle.className = 'lose';
      gameoverMsg.textContent = `${oppName} wins. Try again!`;
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
      gameoverMsg.textContent = `${scoreLine}. Rematch this round.`;
      updateHud();
      return;
    }

    if (seriesStatus === 'ongoing') {
      restartAction = 'next-round';
      btnRestart.textContent = 'Next Round';
      gameoverMsg.textContent = `${scoreLine}. First to 2 wins the series.`;
      updateHud();
      return;
    }

    if (seriesStatus === 'cpu') {
      restartAction = 'retry-tournament';
      btnRestart.textContent = 'Try Again';
      gameoverTitle.textContent = 'DEFEATED';
      gameoverTitle.className = 'lose';
      gameoverMsg.textContent = `${scoreLine}. The CPU won this series.`;
      campaignHud?.classList.add('hidden');
      return;
    }

    if (tournament.isCampaignComplete()) {
      restartAction = 'retry-tournament';
      btnRestart.textContent = 'Play Again';
      gameoverTitle.textContent = 'CHAMPION!';
      gameoverTitle.className = 'win';
      gameoverMsg.textContent = `You beat all ${CAMPAIGN_STAGE_COUNT} rivals. Tournament complete!`;
      campaignHud?.classList.add('hidden');
      return;
    }

    restartAction = 'next-opponent';
    btnRestart.textContent = 'Next Rival';
    gameoverTitle.textContent = 'SERIES WON!';
    gameoverTitle.className = 'win';
    gameoverMsg.textContent = `${scoreLine}. Next rival awaits (tougher CPU).`;
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
      if (restartAction === 'rematch-random') {
        rollAndSetOpponent();
        beginOpponent();
      }
      resetAIController();
      resetGame();
      return;
    }

    if (restartAction === 'retry-tournament') {
      tournament.start();
      rollAndSetOpponent();
      beginOpponent();
      resetAIController();
      resetGame();
      return;
    }

    if (restartAction === 'next-opponent') {
      tournament.advanceOpponent();
      rollAndSetOpponent();
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
    startTournament(playerBey) {
      activeMode = 'tournament';
      tournament.start();
      setTournamentOpponent();
      beginOpponent();
    },
    startCasual(playerBey, difficulty) {
      activeMode = 'casual';
      userDifficultyTier = difficulty ?? 1;
      const opp = pickRandomRival(playerBey);
      casual.start(opp, userDifficultyTier);
      beginOpponent();
    },
    resetCampaign() {
      activeMode = null;
      setAIContext({ tournament: false });
      tournament.reset();
      casual.reset();
      updateHud();
    },
    handlesRestart() {
      return isActive();
    },
    /** @deprecated Use startTournament */
    startCampaign() {
      this.startTournament(getPlayerBey());
    },
  };
}
