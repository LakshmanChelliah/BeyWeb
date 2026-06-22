/** App root for GitHub Pages project sites (/BeyWeb) vs Railway domain root (/). */
export function appBasePath() {
  if (typeof window !== 'undefined' && window.__BEYWEB_BASE__ != null) {
    return window.__BEYWEB_BASE__;
  }
  return computeAppBasePath();
}

export function computeAppBasePath() {
  let p = location.pathname;
  if (/\/pc\/?$/i.test(p)) p = p.replace(/\/pc\/?$/i, '');
  else if (/\/[^/]+\.html$/i.test(p)) p = p.replace(/\/[^/]+\.html$/i, '');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/** Resolve a repo-root asset path for static (/BeyWeb) and server (/ ) hosts. */
export function assetUrl(path) {
  if (!path || /^https?:\/\//i.test(path)) return path;
  const rel = path.startsWith('/') ? path.slice(1) : path;
  const base = appBasePath();
  return base ? `${base}/${rel}` : `/${rel}`;
}
