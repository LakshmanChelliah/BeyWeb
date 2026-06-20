/**
 * Route room invite links to the right client entry (mobile / vs PC).
 * Loaded synchronously in index.html and pc.html before the app boots.
 */
(function routeInviteEntry() {
  if (!location.search.includes('room=')) return;

  const path = location.pathname;
  const onPc = /\/pc\/?$/i.test(path) || /pc\.html$/i.test(path);
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const touchNarrow =
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(max-width: 900px)').matches;
  const mobileLike = mobileUa || touchNarrow;

  if (!onPc && !mobileLike) {
    location.replace(`/pc/${location.search}${location.hash}`);
  } else if (onPc && mobileLike) {
    location.replace(`/${location.search}${location.hash}`);
  }
})();
