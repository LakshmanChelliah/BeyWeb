import { getBeyById, getBeyOrDefault } from './beys.js';

/** Minimal bey payload replicated from the server for online matches. */
export function serializeBeyForClient(bey) {
  if (!bey) return null;
  return {
    id: bey.id,
    name: bey.name,
    type: bey.type,
    color: bey.color,
    model: bey.model,
    logo: bey.logo,
    atk: bey.atk,
    move: bey.move,
    def: bey.def,
    sta: bey.sta,
    leftSpin: Boolean(bey.leftSpin),
    gimmicks: bey.gimmicks ?? {},
  };
}

/** Merge authoritative server pick with local roster (abilities, packaging, etc.). */
export function hydrateMatchBey(payload, fallbackId = 'pegasus') {
  if (!payload?.id) return getBeyOrDefault(null, fallbackId);
  const local = getBeyById(payload.id);
  if (!local) return { available: true, ...payload };
  return { ...local, ...payload };
}

export function applyMatchBeys(state, msg) {
  if (msg.beys?.[0] && msg.beys?.[1]) {
    state.playerBey = hydrateMatchBey(msg.beys[0], 'pegasus');
    state.aiBey = hydrateMatchBey(msg.beys[1], 'ldrago');
  } else {
    state.playerBey = getBeyOrDefault(msg.beyIds?.[0], 'pegasus');
    state.aiBey = getBeyOrDefault(msg.beyIds?.[1], 'ldrago');
  }
  state.matchBeyIds = Array.isArray(msg.beyIds) ? [...msg.beyIds] : null;
}
