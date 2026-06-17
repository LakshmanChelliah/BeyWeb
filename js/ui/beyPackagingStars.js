/** Metal Fusion–style packaging star rows (Attack / Defense / Stamina). */

const MAX_STARS = 5;

const ROWS = Object.freeze([
  { key: 'atk', label: 'ATTACK' },
  { key: 'def', label: 'DEFENSE' },
  { key: 'sta', label: 'STAMINA' },
]);

function starCount(bey, key) {
  const stars = bey?.packagingStars?.[key];
  if (stars != null) return Math.max(0, Math.min(MAX_STARS, Math.round(stars)));
  return 0;
}

function starRow(label, filled, { mystery = false } = {}) {
  const stars = Array.from({ length: MAX_STARS }, (_, i) => {
    const on = !mystery && i < filled;
    return `<span class="bey-star${on ? ' on' : ''}" aria-hidden="true">★</span>`;
  }).join('');

  const aria = mystery ? `${label} unknown` : `${label} ${filled} out of ${MAX_STARS} stars`;

  return `<div class="bey-packaging-row">
    <span class="bey-packaging-label">${label}</span>
    <div class="bey-packaging-stars" role="img" aria-label="${aria}">${stars}</div>
  </div>`;
}

/**
 * @param {object|null} bey
 * @param {{ mystery?: boolean }} [opts]
 * @returns {string}
 */
export function renderBeyPackagingStars(bey, { mystery = false } = {}) {
  const rows = ROWS.map((row) =>
    starRow(row.label, starCount(bey, row.key), { mystery })
  ).join('');

  return `<div class="bey-packaging-stats">${rows}</div>`;
}
