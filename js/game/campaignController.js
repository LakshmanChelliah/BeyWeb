import { resetAIController, setAIDifficulty } from '../input/ai.js';
import { createCampaign, CAMPAIGN_OPPONENT_IDS, CAMPAIGN_STAGE_COUNT } from './campaign.js';
import { getBeyById } from './beys.js';

/**
 * Wires campaign state to DOM + game callbacks shared by PC and mobile entry points.
 */
export function createCampaignController({
  campaignHud,
  gameoverTitle,
  gameoverMsg,
  btnRestart,
  isEnabled = () => true,
  onOpponentChange,
}) {
  const campaign = createCampaign();
  let restartAction = 'next-round';

  function updateHud() {
    if (!campaignHud) return;
    if (!isEnabled() || !campaign.isActive()) {
      campaignHud.classList.add('hidden');
      campaignHud.textContent = '';
      return;
    }

    const opp = campaign.getCurrentOpponent();
    const { player, cpu } = campaign.getSeriesScore();
    const tier = campaign.getAiTier() + 1;
    campaignHud.textContent =
      `Stage ${tier}/${CAMPAIGN_STAGE_COUNT} · Best of 3: ${player}–${cpu} · vs ${opp?.name ?? 'CPU'}`;
    campaignHud.classList.remove('hidden');
  }

  function beginOpponent() {
    const opp = campaign.getCurrentOpponent();
    setAIDifficulty(campaign.getAiTier());
    onOpponentChange(opp);
    updateHud();
  }

  function handleMatchEnd(result) {
    if (!isEnabled() || !campaign.isActive()) return;

    const isDraw = result.outcome === 'DRAW';
    if (!isDraw) campaign.recordMatch(result.winner);

    const { player, cpu } = campaign.getSeriesScore();
    const scoreLine = `Series: ${player}–${cpu}`;
    const seriesStatus = campaign.getSeriesStatus();

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
      restartAction = 'retry-campaign';
      btnRestart.textContent = 'Try Again';
      gameoverTitle.textContent = 'DEFEATED';
      gameoverTitle.className = 'lose';
      gameoverMsg.textContent = `${scoreLine} — the CPU won this series.`;
      campaignHud?.classList.add('hidden');
      return;
    }

    if (campaign.isCampaignComplete()) {
      restartAction = 'retry-campaign';
      btnRestart.textContent = 'Play Again';
      gameoverTitle.textContent = 'CHAMPION!';
      gameoverTitle.className = 'win';
      gameoverMsg.textContent = `You beat all ${CAMPAIGN_STAGE_COUNT} rivals — campaign complete!`;
      campaignHud?.classList.add('hidden');
      return;
    }

    const nextOpp = getBeyById(CAMPAIGN_OPPONENT_IDS[campaign.getOpponentIndex() + 1]);
    restartAction = 'next-opponent';
    btnRestart.textContent = 'Next Rival';
    gameoverTitle.textContent = 'SERIES WON!';
    gameoverTitle.className = 'win';
    gameoverMsg.textContent = `${scoreLine} — next up: ${nextOpp?.name ?? 'CPU'} (harder CPU).`;
  }

  function handleRestart(resetGame) {
    if (restartAction === 'retry-campaign') {
      campaign.start();
      beginOpponent();
      resetAIController();
      resetGame();
      return;
    }

    if (restartAction === 'next-opponent') {
      campaign.advanceOpponent();
      beginOpponent();
      resetAIController();
      resetGame();
      return;
    }

    resetAIController();
    resetGame();
  }

  return {
    campaign,
    updateHud,
    beginOpponent,
    handleMatchEnd,
    handleRestart,
    startCampaign() {
      campaign.start();
      beginOpponent();
    },
    resetCampaign() {
      campaign.reset();
      updateHud();
    },
    handlesRestart() {
      return isEnabled() && campaign.isActive();
    },
  };
}
