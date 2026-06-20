import { BEYS, isBeyPlayable } from '../game/beys.js';
import { ABILITY_REGISTRY } from '../game/abilities.js';
import { renderBeyPackagingStars } from './beyPackagingStars.js';
import { MSG } from '../net/protocol.js';

/**
 * Online bey selection: full carousel for you, mystery card for opponent.
 */
export function createOnlineSelection({ root, netClient, onRevealComplete, onPrepareMotion }) {
  const ROSTER = BEYS.filter(isBeyPlayable);
  let currentIndex = 0;
  let locked = false;
  let opponentStatus = 'choosing';
  let selectedBey = null;

  root.innerHTML = `
    <div class="online-select">
      <div class="online-select-header">
        <h2 class="online-select-title">Choose Your Bey</h2>
        <p class="online-select-hint" id="select-hint">Browse with arrows, then lock in your pick</p>
      </div>
      <div class="online-select-panels">
        <div class="online-select-yours">
          <p class="online-select-label">You</p>
          <div class="online-carousel-mount"></div>
        </div>
        <div class="online-select-rival">
          <p class="online-select-label">Opponent</p>
          <div class="online-mystery-card" id="rival-mystery">
            <div class="mystery-emblem">?</div>
            <p class="mystery-status" id="rival-status">Choosing…</p>
          </div>
        </div>
      </div>
      <div class="online-select-actions">
        <button type="button" class="online-lock-btn" id="btn-lock">Lock In</button>
        <button type="button" class="online-unlock-btn hidden" id="btn-unlock">Change Pick</button>
      </div>
    </div>
  `;

  const mount = root.querySelector('.online-carousel-mount');
  const lockBtn = root.querySelector('#btn-lock');
  const unlockBtn = root.querySelector('#btn-unlock');
  const rivalStatus = root.querySelector('#rival-status');
  const mysteryCard = root.querySelector('#rival-mystery');
  const hintEl = root.querySelector('#select-hint');

  mount.innerHTML = `
    <div class="carousel-scene online-carousel-scene">
      <button class="carousel-arrow left" type="button" aria-label="Previous">&#8249;</button>
      <button class="carousel-arrow right" type="button" aria-label="Next">&#8250;</button>
      <div class="carousel-container"></div>
    </div>
    <div class="carousel-indicators"></div>
  `;

  const carousel = mount.querySelector('.carousel-container');
  const indicators = mount.querySelector('.carousel-indicators');
  const prevBtn = mount.querySelector('.carousel-arrow.left');
  const nextBtn = mount.querySelector('.carousel-arrow.right');

  const statsBlock = (bey) => renderBeyPackagingStars(bey);

  function emblemBlock(bey) {
    if (bey.logo) {
      return `<img class="bey-emblem-img${bey.id ? ` bey-emblem-img--${bey.id}` : ''}" src="${bey.logo}" alt="" />`;
    }
    return `<span>${bey.name.charAt(0)}</span>`;
  }

  const cards = ROSTER.map((bey, i) => {
    const item = document.createElement('div');
    item.className = 'bey-item';
    item.innerHTML = `
      <div class="bey-card online-pick-card" style="--bey-color:${bey.color}">
        <div class="bey-emblem${bey.id ? ` bey-emblem--${bey.id}` : ''}">${emblemBlock(bey)}</div>
        <div class="bey-type">${bey.type}</div>
        <h2 class="bey-name">${bey.name}</h2>
        ${statsBlock(bey)}
      </div>`;
    carousel.appendChild(item);
    const dot = document.createElement('div');
    dot.className = 'carousel-dot';
    indicators.appendChild(dot);
    item.addEventListener('click', () => {
      if (!locked) {
        currentIndex = i;
        selectedBey = bey;
        render();
      }
    });
    return item;
  });

  function render() {
    const total = ROSTER.length;
    const radius = 200;
    cards.forEach((item, i) => {
      const isCenter = i === currentIndex;
      const angle = (i - currentIndex) * (360 / total);
      const rad = angle * (Math.PI / 180);
      const x = Math.sin(rad) * radius;
      const z = Math.cos(rad) * radius - radius;
      const scale = isCenter ? 1.05 : 0.78;
      item.style.transform = `translateX(${x}px) translateZ(${z}px) scale(${scale})`;
      item.style.opacity = String(Math.max(0.2, (z + radius) / radius));
      item.style.pointerEvents = locked ? 'none' : isCenter ? 'auto' : 'none';
      item.querySelector('.bey-card')?.classList.toggle('active', isCenter && !locked);
    });
    indicators.querySelectorAll('.carousel-dot').forEach((d, i) => {
      d.classList.toggle('on', i === currentIndex);
    });
    lockBtn.disabled = locked || !selectedBey;
    lockBtn.classList.toggle('locked', locked);
    lockBtn.textContent = locked ? 'Locked In ✓' : 'Lock In';
    unlockBtn.classList.toggle('hidden', !locked || opponentStatus === 'locked');
    rivalStatus.textContent = opponentStatus === 'locked' ? 'Locked in' : 'Choosing…';
    mysteryCard.classList.toggle('rival-locked', opponentStatus === 'locked');
    if (hintEl) {
      if (locked) {
        hintEl.textContent = opponentStatus === 'locked'
          ? 'Both locked in — starting match…'
          : 'Waiting for opponent to lock in…';
      } else {
        hintEl.textContent = 'Browse with arrows, then lock in your pick';
      }
    }
  }

  prevBtn.addEventListener('click', () => {
    if (locked) return;
    currentIndex = (currentIndex - 1 + ROSTER.length) % ROSTER.length;
    selectedBey = ROSTER[currentIndex];
    render();
  });
  nextBtn.addEventListener('click', () => {
    if (locked) return;
    currentIndex = (currentIndex + 1) % ROSTER.length;
    selectedBey = ROSTER[currentIndex];
    render();
  });

  lockBtn.addEventListener('click', () => {
    if (!selectedBey || locked) return;
    onPrepareMotion?.();
    locked = true;
    netClient.lockBey(selectedBey.id);
    render();
  });

  unlockBtn.addEventListener('click', () => {
    if (!locked || opponentStatus === 'locked') return;
    locked = false;
    netClient.unlockBey();
    render();
  });

  netClient.on(MSG.PICK_STATUS, (msg) => {
    const opp = netClient.slot === 0 ? msg.slots[1] : msg.slots[0];
    opponentStatus = opp;
    render();
  });

  netClient.on(MSG.MATCH_CONFIG, (msg) => {
    mysteryCard.classList.add('revealing');
    rivalStatus.textContent = 'Revealed!';
    const oppId = msg.beyIds[1 - netClient.slot];
    const opp = ROSTER.find((b) => b.id === oppId);
    if (opp?.logo) {
      mysteryCard.querySelector('.mystery-emblem').innerHTML =
        `<img class="bey-emblem-img${opp.id ? ` bey-emblem-img--${opp.id}` : ''}" src="${opp.logo}" alt="${opp.name}" />`;
    }
    setTimeout(() => onRevealComplete?.(msg), 1500);
  });

  selectedBey = ROSTER[0];
  render();

  return { getSelectedBey: () => selectedBey };
}
