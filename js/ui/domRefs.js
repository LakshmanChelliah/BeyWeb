export function queryGameUi({ controlsHintId, playerAbilitiesId, aiAbilitiesId = null }) {
  return {
    hud: document.getElementById('hud'),
    startOverlay: document.getElementById('start-overlay'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    btnStart: document.getElementById('btn-start'),
    btnRestart: document.getElementById('btn-restart'),
    btnChangeBey: document.getElementById('btn-change-bey'),
    btnRecalibrate: document.getElementById('btn-recalibrate'),
    playerSpinEl: document.getElementById('player-spin'),
    aiSpinEl: document.getElementById('ai-spin'),
    playerBar: document.getElementById('player-bar'),
    aiBar: document.getElementById('ai-bar'),
    playerAvatar: document.getElementById('player-avatar'),
    aiAvatar: document.getElementById('ai-avatar'),
    gameoverTitle: document.getElementById('gameover-title'),
    gameoverMsg: document.getElementById('gameover-msg'),
    controlsHint: document.getElementById(controlsHintId),
    playerAbilities: document.getElementById(playerAbilitiesId),
    aiAbilities: aiAbilitiesId ? document.getElementById(aiAbilitiesId) : null,
    specialFlash: document.getElementById('special-flash'),
    specialFlashImg: document.getElementById('special-flash-img'),
  };
}
