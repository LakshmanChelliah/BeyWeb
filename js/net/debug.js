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
  let localErr = 0;
  let remoteErr = 0;
  let snapsPerSec = 0;

  return {
    update({
      serverTick,
      pingMs,
      ageMs,
      interpDelayTicks,
      localErr: localE,
      remoteErr: remoteE,
      snapsPerSec: snaps,
    }) {
      if (serverTick != null) tick = serverTick;
      if (pingMs != null) rtt = Math.round(pingMs);
      if (ageMs != null) snapAge = Math.round(ageMs);
      if (interpDelayTicks != null) interpDelay = interpDelayTicks;
      if (localE != null) localErr = Math.round(localE * 10) / 10;
      if (remoteE != null) remoteErr = Math.round(remoteE * 10) / 10;
      if (snaps != null) snapsPerSec = snaps;
      el.textContent =
        `tick ${tick} · ${rtt}ms · snap ${snapAge}ms · buf ${interpDelay}` +
        ` · err ${localErr}/${remoteErr} · snaps/s ${snapsPerSec}`;
    },
    destroy() {
      el.remove();
    },
  };
}
