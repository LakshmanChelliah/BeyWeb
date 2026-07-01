import { GAME_MODES } from '../game/modes.js';
import { AI_DIFFICULTIES } from '../input/ai.js';
import { CAMPAIGN_STAGE_COUNT } from '../game/campaign.js';

/**
 * Mode + difficulty controls rendered inside the bey-select overlay (touch-friendly).
 */
export function createPlaySetup(el, { show2Player = false, showOnline = true, onChange } = {}) {
  let mode = GAME_MODES.TOURNAMENT;
  let difficulty = 1;

  const modeButtons = [];
  if (showOnline) {
    modeButtons.push({ id: GAME_MODES.ONLINE, label: 'Online' });
  }
  modeButtons.push(
    { id: GAME_MODES.CASUAL, label: 'Casual' },
    { id: GAME_MODES.TOURNAMENT, label: 'Tournament' }
  );
  if (show2Player) {
    modeButtons.push({ id: GAME_MODES.TWO_PLAYER, label: '2 Players' });
  }

  el.innerHTML = `
    <div class="play-setup-modes" role="tablist" aria-label="Game mode"></div>
    <div class="play-setup-diff" aria-label="CPU difficulty">
      <span class="play-setup-diff-label">CPU difficulty</span>
      <div class="play-setup-diff-btns"></div>
    </div>
    <p class="play-setup-hint">CPU rival is random each match</p>
  `;

  const modesEl = el.querySelector('.play-setup-modes');
  const diffWrap = el.querySelector('.play-setup-diff');
  const diffBtns = el.querySelector('.play-setup-diff-btns');
  const hintEl = el.querySelector('.play-setup-hint');

  for (const m of modeButtons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'play-setup-mode-btn';
    btn.dataset.mode = m.id;
    btn.textContent = m.label;
    btn.addEventListener('click', () => setMode(m.id));
    modesEl.appendChild(btn);
  }

  for (const d of AI_DIFFICULTIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'play-setup-diff-btn';
    btn.dataset.tier = String(d.tier);
    btn.textContent = d.label;
    btn.addEventListener('click', () => setDifficulty(d.tier));
    diffBtns.appendChild(btn);
  }

  function paint() {
    modesEl.querySelectorAll('.play-setup-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    diffBtns.querySelectorAll('.play-setup-diff-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.tier) === difficulty);
    });

    const isCasual = mode === GAME_MODES.CASUAL;
    const isTournament = mode === GAME_MODES.TOURNAMENT;
    const isOnline = mode === GAME_MODES.ONLINE;
    diffWrap.classList.toggle('hidden', !isCasual);
    el.classList.toggle('play-setup--casual', isCasual);
    el.classList.toggle('play-setup--tournament', isTournament);
    el.classList.toggle('play-setup--two-player', mode === GAME_MODES.TWO_PLAYER);
    el.classList.toggle('play-setup--online', isOnline);

    if (hintEl) {
      if (isOnline) {
        hintEl.textContent = 'Host: share code or link · Guest: enter room code or open invite link';
        hintEl.classList.remove('hidden');
      } else if (mode === GAME_MODES.TOURNAMENT) {
        hintEl.textContent = `${CAMPAIGN_STAGE_COUNT} rivals in order.`;
        hintEl.classList.remove('hidden');
      } else if (isCasual) {
        hintEl.textContent = 'CPU rival is random each match';
        hintEl.classList.remove('hidden');
      } else {
        hintEl.classList.add('hidden');
      }
    }
  }

  function setMode(next, { silent = false } = {}) {
    if (mode === next) return;
    mode = next;
    paint();
    if (!silent) onChange?.(getState());
  }

  function setDifficulty(tier) {
    const t = Math.max(0, Math.min(tier, AI_DIFFICULTIES.length - 1));
    if (difficulty === t) return;
    difficulty = t;
    paint();
    onChange?.(getState());
  }

  function getState() {
    return { mode, difficulty };
  }

  paint();

  return { getState, setMode, setDifficulty, paint };
}
