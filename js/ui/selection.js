import { BEYS, isBeyPlayable } from '../game/beys.js';
import { ABILITY_REGISTRY } from '../game/abilities.js';

/**
 * Builds the 3D carousel bey-selection screen.
 *
 * Players pick in turn. Once a bey is chosen it is locked and cannot be picked
 * by a later player. When every player has chosen, `onComplete(picks)` fires
 * with the selected bey objects (index-aligned to `players`).
 *
 * @param {object}   opts
 * @param {HTMLElement} opts.root      Overlay container to populate.
 * @param {{label:string}[]} opts.players  Pickers, in turn order.
 * @param {(picks:object[]) => void} opts.onComplete
 */
export function createBeySelection({ root, players, onComplete, rivalLabel = null }) {
  const locked = new Set();
  const picks = [];
  let turn = 0;
  let rivalPick = null;
  const firstPlayable = BEYS.findIndex(isBeyPlayable);
  let currentIndex = firstPlayable >= 0 ? firstPlayable : 0;

  root.innerHTML = `
    <div class="select-header">
      <h1 class="select-title"></h1>
      <p class="select-sub">Choose your bey</p>
    </div>
    <div class="carousel-scene">
      <button class="carousel-arrow left" type="button" aria-label="Previous">&#8249;</button>
      <button class="carousel-arrow right" type="button" aria-label="Next">&#8250;</button>
      <div class="carousel-container"></div>
    </div>
    <div class="carousel-indicators"></div>
    <div class="select-picks"></div>
  `;

  const titleEl = root.querySelector('.select-title');
  const carousel = root.querySelector('.carousel-container');
  const indicators = root.querySelector('.carousel-indicators');
  const prevBtn = root.querySelector('.carousel-arrow.left');
  const nextBtn = root.querySelector('.carousel-arrow.right');
  const picksEl = root.querySelector('.select-picks');

  const statRow = (label, value) => `
    <div class="bey-stat">
      <div class="bey-stat-head"><span>${label}</span><span class="bey-stat-val">${value ?? '?'}</span></div>
      <div class="bey-stat-track"><div class="bey-stat-fill" style="width:${value ?? 0}%"></div></div>
    </div>`;

  const movesBlock = (bey) => {
    const g = bey.gimmicks;
    if (!g) return '';
    const rows = [];
    const add = (tag, id) => {
      const a = id ? ABILITY_REGISTRY[id] : null;
      if (a) rows.push(`<div class="bey-move"><span class="bey-move-tag">${tag}</span><span class="bey-move-name">${a.name}</span></div>`);
    };
    add('PWR', g.power);
    add('SPC', g.special);
    add('PSV', g.passive);
    return rows.length ? `<div class="bey-moves">${rows.join('')}</div>` : '';
  };

  const emblemBlock = (bey) => {
    if (bey.logo) {
      return `<img class="bey-emblem-img${bey.id ? ` bey-emblem-img--${bey.id}` : ''}" src="${bey.logo}" alt="" />`;
    }
    const letter = isBeyPlayable(bey) ? bey.name.charAt(0) : '?';
    return `<span>${letter}</span>`;
  };

  const cards = BEYS.map((bey, i) => {
    const item = document.createElement('div');
    item.className = 'bey-item';
    item.dataset.index = String(i);
    item.innerHTML = `
      <div class="bey-card${isBeyPlayable(bey) ? '' : ' mystery'}" style="--bey-color:${bey.color}">
        <div class="bey-emblem${bey.id ? ` bey-emblem--${bey.id}` : ''}">${emblemBlock(bey)}</div>
        <div class="bey-type">${bey.type}</div>
        <h2 class="bey-name">${bey.name}</h2>
        <p class="bey-desc">${bey.desc}</p>
        <div class="bey-stats">
          ${statRow('ATK', bey.atk)}
          ${statRow('DEF', bey.def)}
          ${statRow('STAMINA', bey.sta)}
        </div>
        ${movesBlock(bey)}
        <button class="bey-select-btn" type="button">${isBeyPlayable(bey) ? 'SELECT' : 'LOCKED'}</button>
        <div class="bey-taken">TAKEN</div>
        ${isBeyPlayable(bey) ? '' : '<div class="bey-soon">COMING SOON</div>'}
      </div>`;
    carousel.appendChild(item);

    const dot = document.createElement('div');
    dot.className = 'carousel-dot';
    indicators.appendChild(dot);

    item.addEventListener('click', () => {
      if (i !== currentIndex) {
        currentIndex = i;
        render();
      }
    });
    item.querySelector('.bey-select-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmPick(i);
    });
    return item;
  });

  const dots = Array.from(indicators.children);

  function nextOpenIndex(from) {
    for (let step = 0; step < BEYS.length; step++) {
      const idx = (from + step) % BEYS.length;
      const bey = BEYS[idx];
      if (isBeyPlayable(bey) && !locked.has(bey.id)) return idx;
    }
    return from;
  }

  function confirmPick(i) {
    const bey = BEYS[i];
    if (!isBeyPlayable(bey) || locked.has(bey.id) || turn >= players.length) return;

    locked.add(bey.id);
    picks.push(bey);
    turn += 1;

    if (turn >= players.length) {
      render();
      root.classList.add('select-done');
      onComplete(picks);
      return;
    }

    currentIndex = nextOpenIndex((i + 1) % BEYS.length);
    render();
  }

  function render() {
    const total = BEYS.length;
    const radius = Math.max(360, total * 95);

    cards.forEach((item, i) => {
      const bey = BEYS[i];
      const angle = (i - currentIndex) * (360 / total);
      const rad = angle * (Math.PI / 180);
      const x = Math.sin(rad) * radius;
      const z = Math.cos(rad) * radius - radius;
      const opacity = Math.max(0.18, (z + radius) / radius);
      const isCenter = i === currentIndex;
      const scale = isCenter ? 1.08 : 0.78;

      item.style.transform = `translateX(${x}px) translateZ(${z}px) scale(${scale})`;
      item.style.opacity = String(opacity);
      item.style.filter = isCenter ? 'none' : 'blur(3px) brightness(0.55)';
      item.style.zIndex = String(Math.round(z + radius));

      const card = item.querySelector('.bey-card');
      const btn = item.querySelector('.bey-select-btn');
      const taken = locked.has(bey.id);
      const playable = isBeyPlayable(bey);
      card.classList.toggle('active', isCenter);
      card.classList.toggle('taken', taken);
      btn.disabled = !playable || taken || !isCenter;
      if (!playable) btn.textContent = 'LOCKED';
      else if (taken) btn.textContent = 'TAKEN';
      else btn.textContent = 'SELECT';
    });

    dots.forEach((d, i) => d.classList.toggle('on', i === currentIndex));

    if (turn < players.length) {
      titleEl.textContent = `${players[turn].label} — CHOOSE YOUR BEY`;
    } else {
      titleEl.textContent = 'BATTLE READY';
    }

    picksEl.innerHTML =
      players
        .map((p, i) => {
          const pick = picks[i];
          const active = i === turn ? ' active' : '';
          const chip = pick
            ? `<span class="pick-bey" style="--bey-color:${pick.color}">${pick.name}</span>`
            : `<span class="pick-bey empty">— choosing —</span>`;
          return `<div class="pick-slot${active}"><span class="pick-label">${p.label}</span>${chip}</div>`;
        })
        .join('') +
      (rivalLabel
        ? (() => {
            const chip = rivalPick
              ? `<span class="pick-bey" style="--bey-color:${rivalPick.color}">${rivalPick.name}</span>`
              : `<span class="pick-bey empty">— choosing —</span>`;
            return `<div class="pick-slot${rivalPick ? '' : ' active'}"><span class="pick-label">${rivalLabel}</span>${chip}</div>`;
          })()
        : '');
  }

  prevBtn.addEventListener('click', () => {
    currentIndex = (currentIndex - 1 + BEYS.length) % BEYS.length;
    render();
  });
  nextBtn.addEventListener('click', () => {
    currentIndex = (currentIndex + 1) % BEYS.length;
    render();
  });

  render();

  return {
    /** Returns remaining (unlocked, playable) beys — handy for an AI auto-pick. */
    remaining() {
      return BEYS.filter((b) => isBeyPlayable(b) && !locked.has(b.id));
    },
    /** Restart picks (e.g. when switching VS CPU / 2-player). */
    reset(newPlayers) {
      players.splice(0, players.length, ...newPlayers);
      locked.clear();
      picks.length = 0;
      rivalPick = null;
      turn = 0;
      currentIndex = nextOpenIndex(firstPlayable >= 0 ? firstPlayable : 0);
      root.classList.remove('select-done');
      render();
    },
    /** Show which bey the CPU / rival auto-picked. */
    setRivalPick(bey) {
      rivalPick = bey;
      render();
    },
    /** Toggle the extra rival slot (VS CPU on PC). */
    setRivalLabel(label) {
      rivalLabel = label;
      rivalPick = null;
      render();
    },
  };
}
