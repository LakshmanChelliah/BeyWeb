import { GAME_MODES } from '../game/modes.js';
import { AI_DIFFICULTIES } from '../input/ai.js';

/**
 * Mode + difficulty controls rendered inside the bey-select overlay (touch-friendly).
 */
export function createPlaySetup(el, { show2Player = false, onChange } = {}) {
  let mode = GAME_MODES.TOURNAMENT;
  let difficulty = 1;

  const modeButtons = show2Player
    ? [
        { id: GAME_MODES.CASUAL, label: 'Casual' },
        { id: GAME_MODES.TOURNAMENT, label: 'Tournament' },
        { id: GAME_MODES.TWO_PLAYER, label: '2 Players' },
      ]
    : [
        { id: GAME_MODES.CASUAL, label: 'Casual' },
        { id: GAME_MODES.TOURNAMENT, label: 'Tournament' },
      ];

  el.innerHTML = `
    <div class="play-setup-modes" role="tablist" aria-label="Game mode"></div>
    <div class="play-setup-diff" aria-label="CPU difficulty">
      <span class="play-setup-diff-label">CPU difficulty</span>
      <div class="play-setup-diff-btns"></div>
      <p class="play-setup-hint">CPU rival is random each match</p>
    </div>
  `;

  const modesEl = el.querySelector('.play-setup-modes');
  const diffWrap = el.querySelector('.play-setup-diff');
  const diffBtns = el.querySelector('.play-setup-diff-btns');

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
    const vsCpu = mode === GAME_MODES.CASUAL || mode === GAME_MODES.TOURNAMENT;
    diffWrap.classList.toggle('hidden', !vsCpu);
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    paint();
    onChange?.(getState());
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
