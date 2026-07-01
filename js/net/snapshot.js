import { SYNC_USER_DATA_KEYS } from '../game/matchFactory.js';

function pickUserData(body) {
  if (!body?.userData) return {};
  const out = {};
  for (const key of SYNC_USER_DATA_KEYS) {
    if (body.userData[key] !== undefined) {
      const v = body.userData[key];
      if (key === 'ldragoLightningSpots' && Array.isArray(v)) {
        out[key] = v.map((s) => ({ x: s.x, z: s.z, flashT: s.flashT ?? 0 }));
      } else {
        out[key] = v;
      }
    }
  }
  return out;
}

function serializeBody(body) {
  if (!body) return null;
  const q = body.quaternion;
  const p = body.position;
  const v = body.velocity;
  const av = body.angularVelocity;
  return {
    x: p.x, y: p.y, z: p.z,
    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    vx: v.x, vy: v.y, vz: v.z,
    avx: av.x, avy: av.y, avz: av.z,
    ud: pickUserData(body),
  };
}

function serializeAbilitySlot(slot) {
  if (!slot) return null;
  return {
    cooldownRemaining: slot.cooldownRemaining,
    cooldownTotal: slot.cooldownTotal,
    windupRemaining: slot.windupRemaining,
    windupDuration: slot.windupDuration,
    active: slot.active,
    activeRemaining: slot.activeRemaining,
    abilityId: slot.ability?.id ?? null,
  };
}

function serializeAbilities(abilities) {
  if (!abilities) return null;
  return {
    player: {
      power: serializeAbilitySlot(abilities.player?.power),
      special: serializeAbilitySlot(abilities.player?.special),
    },
    ai: {
      power: serializeAbilitySlot(abilities.ai?.power),
      special: serializeAbilitySlot(abilities.ai?.special),
    },
  };
}

export function serializeState(state, tick, events = []) {
  return {
    tick,
    playerSpin: state.playerSpin,
    aiSpin: state.aiSpin,
    launchGrace: state.launchGrace,
    gameFrozen: state.gameFrozen,
    pendingKo: state.pendingKo
      ? {
          outcome: state.pendingKo.outcome,
          winner: state.pendingKo.winner,
          loser: state.pendingKo.loser,
          cinematic: state.pendingKo.cinematic,
          elapsed: state.pendingKo.elapsed,
        }
      : null,
    player: serializeBody(state.playerBody),
    ai: serializeBody(state.aiBody),
    abilities: serializeAbilities(state.abilities),
    events,
  };
}

function applyBodyData(body, data) {
  if (!body || !data) return;
  body.position.set(data.x, data.y, data.z);
  body.previousPosition.set(data.x, data.y, data.z);
  body.quaternion.set(data.qx, data.qy, data.qz, data.qw);
  body.velocity.set(data.vx, data.vy, data.vz);
  body.angularVelocity.set(data.avx, data.avy, data.avz);
  if (data.ud) {
    for (const [key, val] of Object.entries(data.ud)) {
      body.userData[key] = val;
    }
  }
}

function applyAbilitySlot(slot, data) {
  if (!slot || !data) return;
  slot.cooldownRemaining = data.cooldownRemaining;
  slot.cooldownTotal = data.cooldownTotal;
  slot.windupRemaining = data.windupRemaining;
  slot.windupDuration = data.windupDuration;
  slot.active = data.active;
  slot.activeRemaining = data.activeRemaining;
}

export function applySnapshot(state, snap, localSlot = 0) {
  if (!snap) return snap?.events ?? [];

  state.playerSpin = snap.playerSpin;
  state.aiSpin = snap.aiSpin;
  state.launchGrace = snap.launchGrace;
  state.gameFrozen = snap.gameFrozen ?? false;
  // Ignore stale KO metadata while launch grace is active on a fresh round.
  if (snap.launchGrace > 0) {
    state.pendingKo = null;
  } else {
    state.pendingKo = snap.pendingKo ? { ...snap.pendingKo } : null;
  }

  applyBodyData(state.playerBody, snap.player);
  applyBodyData(state.aiBody, snap.ai);

  if (snap.abilities && state.abilities) {
    applyAbilitySlot(state.abilities.player?.power, snap.abilities.player?.power);
    applyAbilitySlot(state.abilities.player?.special, snap.abilities.player?.special);
    applyAbilitySlot(state.abilities.ai?.power, snap.abilities.ai?.power);
    applyAbilitySlot(state.abilities.ai?.special, snap.abilities.ai?.special);
  }

  return snap.events ?? [];
}

/** Online: sync spin, abilities, and KO state — body poses come from the interpolator. */
export function applySnapshotMeta(state, snap) {
  if (!snap) return snap?.events ?? [];

  state.playerSpin = snap.playerSpin;
  state.aiSpin = snap.aiSpin;
  state.launchGrace = snap.launchGrace;
  state.gameFrozen = snap.gameFrozen ?? false;
  // Ignore stale KO metadata while launch grace is active on a fresh round.
  if (snap.launchGrace > 0) {
    state.pendingKo = null;
  } else {
    state.pendingKo = snap.pendingKo ? { ...snap.pendingKo } : null;
  }

  if (snap.abilities && state.abilities) {
    applyAbilitySlot(state.abilities.player?.power, snap.abilities.player?.power);
    applyAbilitySlot(state.abilities.player?.special, snap.abilities.player?.special);
    applyAbilitySlot(state.abilities.ai?.power, snap.abilities.ai?.power);
    applyAbilitySlot(state.abilities.ai?.special, snap.abilities.ai?.special);
  }

  return snap.events ?? [];
}

export function snapshotRoundtripTest(stateA, stateB, snap) {
  applySnapshot(stateB, snap);
  const eps = 0.001;
  for (const [a, b] of [[stateA.playerBody, stateB.playerBody], [stateA.aiBody, stateB.aiBody]]) {
    if (!a || !b) continue;
    if (Math.abs(a.position.x - b.position.x) > eps) return false;
    if (Math.abs(a.position.z - b.position.z) > eps) return false;
  }
  return true;
}
