/** Shared WebSocket protocol for online multiplayer. */

export const WINS_NEEDED = 3;
/** Max rounds in an online series (best-of-5 when first to 3). */
export const SERIES_MAX_ROUNDS = WINS_NEEDED * 2 - 1;
/** Static dev site (`npm run dev:static`). */
export const DEV_STATIC_PORT = 3000;
/** WebSocket dev server (`npm run dev:server`). */
export const DEV_WS_PORT = 3001;
export const SERVER_PORT = DEV_WS_PORT;
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;

export const MSG = Object.freeze({
  // client → server
  CREATE_ROOM: 'create_room',
  JOIN_ROOM: 'join_room',
  LOCK_BEY: 'lock_bey',
  UNLOCK_BEY: 'unlock_bey',
  /** Request current pick phase state (used when opening the selection UI). */
  SYNC_PICKS: 'sync_picks',
  NEXT_ROUND_READY: 'next_round_ready',
  /** @deprecated alias */
  READY: 'next_round_ready',
  INPUT: 'input',
  PING: 'ping',
  /** E2E only — force round end when ENABLE_E2E=1 */
  DEBUG_ROUND_END: 'debug_round_end',
  DEBUG_ROOM_STATE: 'debug_room_state',

  // server → client
  ROOM_CREATED: 'room_created',
  JOINED: 'joined',
  PEER_JOINED: 'peer_joined',
  PEER_LEFT: 'peer_left',
  PICK_STATUS: 'pick_status',
  LOCK_BEY_REJECTED: 'lock_bey_rejected',
  MATCH_CONFIG: 'match_config',
  COUNTDOWN: 'countdown',
  SNAPSHOT: 'snapshot',
  ROUND_END: 'round_end',
  READY_STATUS: 'ready_status',
  SERIES_END: 'series_end',
  FORFEIT: 'forfeit',
  ERROR: 'error',
  PONG: 'pong',
});

/** Game server when static host cannot serve WebSockets (e.g. GitHub Pages). */
export const SPLIT_HOST_GAME_WS = 'wss://beyweb-production.up.railway.app';

function normalizeWsUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${trimmed.replace(/^\/\//, '')}`;
}

function splitStaticGameWs() {
  if (typeof window !== 'undefined' && window.__BEYWEB_WS__) {
    return normalizeWsUrl(window.__BEYWEB_WS__);
  }
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="beyweb-game-server"]');
    if (meta?.content) return normalizeWsUrl(meta.content);
  }
  if (typeof location !== 'undefined' && location.hostname.endsWith('github.io')) {
    return SPLIT_HOST_GAME_WS;
  }
  return null;
}

export function wsUrl(host, port = DEV_WS_PORT) {
  if (typeof location !== 'undefined') {
    const secure = location.protocol === 'https:';
    const proto = secure ? 'wss' : 'ws';
    // Local dev: static site on :3000, WS on :3001 (npm run dev:online).
    if (location.port === String(DEV_STATIC_PORT)) {
      return `${proto}://${location.hostname}:${port}`;
    }
    const splitWs = splitStaticGameWs();
    if (splitWs) return splitWs;
    // Production: one process serves HTTP + WSS on the same host (npm start).
    return `${proto}://${location.host}`;
  }
  const resolvedHost = host ?? 'localhost';
  return `ws://${resolvedHost}:${port}`;
}

export function isPcEntryPath(pathname = '/') {
  return /\/pc\/?$/i.test(pathname) || /pc\.html$/i.test(pathname);
}

/** Build a shareable join link for the current platform entry (/ or /pc/). */
export function joinUrl(roomId, base) {
  let origin = 'http://localhost:3000';
  let pathname = '/';
  if (typeof location !== 'undefined') {
    origin = location.origin;
    pathname = location.pathname;
  }
  if (base) {
    const u = new URL(base, typeof location !== 'undefined' ? location.href : origin);
    origin = u.origin;
    pathname = u.pathname;
  }
  const entry = isPcEntryPath(pathname)
    ? (/\/pc\/?$/i.test(pathname) ? '/pc/' : pathname)
    : '/';
  const url = new URL(entry, origin);
  url.searchParams.set('room', roomId);
  return url.toString();
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** How long an empty room stays joinable after the last player leaves. */
export const ROOM_EMPTY_TTL_MS = 10 * 60 * 1000;

const ROOM_ID_RE = /^[A-Z0-9]{6}$/;

export function isValidRoomId(id) {
  return ROOM_ID_RE.test(String(id || '').toUpperCase());
}

export function generateRoomId() {
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return id;
}

const HOST_ROOM_KEY = 'beyweb_host_room';

export function rememberHostRoom(roomId) {
  if (typeof sessionStorage === 'undefined' || !roomId) return;
  sessionStorage.setItem(HOST_ROOM_KEY, String(roomId).toUpperCase());
}

export function clearHostRoom() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(HOST_ROOM_KEY);
}

export function getRememberedHostRoom() {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(HOST_ROOM_KEY);
}

export function parseRoomFromUrl() {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('room')?.toUpperCase() || null;
}
