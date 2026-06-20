/** Optional debug overlay for online play (?debug=1) */
export function createNetDebug() {
  const enabled = typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('debug') === '1';

  if (!enabled) {
    return { update() {}, destroy() {} };
  }

  const el = document.createElement('div');
  el.className = 'net-debug';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);

  let tick = 0;
  let rtt = 0;
  let snapAge = 0;
  let interpDelay = 0;

  return {
    update({ serverTick, pingMs, ageMs, interpDelayTicks }) {
      if (serverTick != null) tick = serverTick;
      if (pingMs != null) rtt = Math.round(pingMs);
      if (ageMs != null) snapAge = Math.round(ageMs);
      if (interpDelayTicks != null) interpDelay = interpDelayTicks;
      el.textContent = `tick ${tick} · ${rtt}ms · snap ${snapAge}ms · buf ${interpDelay}`;
    },
    destroy() {
      el.remove();
    },
  };
}
