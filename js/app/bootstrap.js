import { createGame } from '../game/engine.js';
import { applyAISteering, tickAIAbilities, resetAIController } from '../input/ai.js';
import { createBeySelection } from '../ui/selection.js';
import { createPlaySetup } from '../ui/playSetup.js';
import { queryGameUi } from '../ui/domRefs.js';
import { createCampaignController } from '../game/campaignController.js';
import { GAME_MODES, isVsCpu, modeBlurb } from '../game/modes.js';

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
    applyPlatformModeUi?.({ gameMode, isVsCpu: isVsCpu(gameMode) });
    campaignCtrl.updateHud();
  }

  function openBeySelect() {
    campaignCtrl.resetCampaign();
    resetAIController();
    selection?.reset(getPlayers());
    selection?.setRivalLabel(getRivalLabel());
    gameRef.returnToMenu();
    selectOverlay.classList.remove('hidden');
    startOverlay.classList.add('hidden');
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
    } else {
      gameRef.state.aiBey = picks[1];
      campaignCtrl.resetCampaign();
    }
    beysChosen = true;
    btnStart.disabled = false;
    resetAIController();
    applyModeUi();
    onSelectionComplete?.({ beysChosen: true });
    setTimeout(() => {
      selectOverlay.classList.add('hidden');
      startOverlay.classList.remove('hidden');
    }, 600);
  }

  selection = createBeySelection({
    root: selectOverlay,
    players: getPlayers(),
    rivalLabel: getRivalLabel(),
    onComplete: handleSelectionComplete,
  });

  const playSetup = createPlaySetup(playSetupEl, {
    show2Player,
    onChange({ mode, difficulty: diff }) {
      gameMode = mode;
      difficulty = diff;
      beysChosen = false;
      btnStart.disabled = true;
      campaignCtrl.resetCampaign();
      applyModeUi();
      selection?.reset(getPlayers(), { keepCarousel: true });
      selection?.setRivalLabel(getRivalLabel());
      if (platform === 'mobile') {
        btnStart.textContent = 'Calibrate & Start';
        startOverlay.classList.add('hidden');
      }
    },
  });

  const input = buildInput({
    getGameRef: () => gameRef,
    getGameMode: () => gameMode,
    getBeysChosen: () => beysChosen,
    campaignCtrl,
    openBeySelect,
    startOverlay,
    btnStart,
    resetAIController,
  });

  gameRef = createGame({
    mode: platform === 'mobile' ? 'mobile' : 'pc',
    canvas,
    isVsCpu: () => isVsCpu(gameMode),
    ui: queryGameUi(queryUiOptions),
    input,
  });

  ({ mode: gameMode, difficulty } = playSetup.getState());
  applyModeUi();
  selection?.setRivalLabel(getRivalLabel());
  btnStart.disabled = true;
  if (initStartOverlayHidden) {
    startOverlay.classList.add('hidden');
  }

  return { gameRef, selection, campaignCtrl, playSetup, get gameMode() { return gameMode; } };
}
