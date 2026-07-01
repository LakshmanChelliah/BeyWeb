import { TICK_RATE } from './protocol.js?v=23';

export const SNAP_EPS = 2.5;
const TICK_MS = 1000 / TICK_RATE;
const BASE_DELAY_MS = TICK_MS;
const MAX_DELAY_MS = 3 * TICK_MS;
const MAX_EXTRAP_MS = 1.5 * TICK_MS;
const MAX_SNAPSHOTS = 64;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function slerpQuat(out, ax, ay, az, aw, bx, by, bz, bw, t) {
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  let bx2 = bx;
  let by2 = by;
  let bz2 = bz;
  let bw2 = bw;
  if (cos < 0) {
    cos = -cos;
    bx2 = -bx;
    by2 = -by;
    bz2 = -bz;
    bw2 = -bw;
  }
  let s0;
  let s1;
  if (1 - cos < 0.001) {
    s0 = 1 - t;
    s1 = t;
  } else {
    const sin = Math.sqrt(1 - cos * cos);
    const ang = Math.atan2(sin, cos);
    s0 = Math.sin((1 - t) * ang) / sin;
    s1 = Math.sin(t * ang) / sin;
  }
  out.x = s0 * ax + s1 * bx2;
  out.y = s0 * ay + s1 * by2;
  out.z = s0 * az + s1 * bz2;
  out.w = s0 * aw + s1 * bw2;
}

function lerpUserData(body, udA, udB, t) {
  if (!body || !udA || !udB) return;
  const keys = new Set([...Object.keys(udA), ...Object.keys(udB)]);
  for (const key of keys) {
    const a = udA[key];
    const b = udB[key];
    if (a === undefined && b === undefined) continue;
    if (typeof a === 'number' && typeof b === 'number') {
      body.userData[key] = lerp(a, b, t);
    } else if (b !== undefined) {
      body.userData[key] = t >= 0.5 ? b : a;
    } else if (a !== undefined) {
      body.userData[key] = a;
    }
  }
}

function interpolateBodyPose(body, a, b, t) {
  if (!body || !a || !b) return;
  body.position.set(
    lerp(a.x, b.x, t),
    lerp(a.y, b.y, t),
    lerp(a.z, b.z, t)
  );
  body.velocity.set(
    lerp(a.vx, b.vx, t),
    lerp(a.vy, b.vy, t),
    lerp(a.vz, b.vz, t)
  );
  body.angularVelocity.set(
    lerp(a.avx, b.avx, t),
    lerp(a.avy, b.avy, t),
    lerp(a.avz, b.avz, t)
  );
  slerpQuat(
    body.quaternion,
    a.qx, a.qy, a.qz, a.qw,
    b.qx, b.qy, b.qz, b.qw,
    t
  );
}

function extrapolateBodyPose(body, data, dt) {
  if (!body || !data || dt <= 0) return;
  body.position.x += data.vx * dt;
  body.position.y += data.vy * dt;
  body.position.z += data.vz * dt;
}

function interpolateBody(body, before, after, side, alpha) {
  if (!body) return;
  const a = side === 'player' ? before.player : before.ai;
  const b = side === 'player' ? after.player : after.ai;
  if (!a || !b) return;
  const t = Math.max(0, Math.min(1, alpha));
  interpolateBodyPose(body, a, b, t);
  lerpUserData(body, a.ud ?? {}, b.ud ?? {}, t);
}

function findTimeBracket(snaps, renderAt) {
  if (!snaps.length) {
    return { before: null, after: null, alpha: 0, extrapSec: 0 };
  }
  if (snaps.length === 1) {
    return { before: snaps[0], after: snaps[0], alpha: 0, extrapSec: 0 };
  }

  let before = snaps[0];
  let after = snaps[snaps.length - 1];

  for (let i = 0; i < snaps.length - 1; i++) {
    const a = snaps[i];
    const b = snaps[i + 1];
    if (a.at <= renderAt && b.at >= renderAt) {
      before = a;
      after = b;
      const span = b.at - a.at;
      return {
        before,
        after,
        alpha: span > 0 ? (renderAt - a.at) / span : 0,
        extrapSec: 0,
      };
    }
  }

  if (renderAt >= after.at) {
    return {
      before: after,
      after,
      alpha: 1,
      extrapSec: Math.min((renderAt - after.at) / 1000, MAX_EXTRAP_MS / 1000),
    };
  }

  return { before, after: before, alpha: 0, extrapSec: 0 };
}

function bodyDataForSide(snap, side) {
  return side === 'player' ? snap.player : snap.ai;
}

function bodyErr(body, data) {
  if (!body || !data) return 0;
  return Math.hypot(data.x - body.position.x, data.z - body.position.z);
}

/** Legacy reconcile — exported for smoothness regression tests. */
export function reconcileBody(body, target, dt, { steering = false } = {}) {
  if (!body || !target) return { err: 0, snapped: false };
  const dx = target.x - body.position.x;
  const dy = target.y - body.position.y;
  const dz = target.z - body.position.z;
  const err = Math.hypot(dx, dz);
  const posRate = Math.min(1, dt * (steering ? 14 * 0.22 : 14));
  const velRate = Math.min(1, dt * (steering ? 3 : 12));
  let snapped = false;
  if (err > SNAP_EPS) {
    body.position.set(target.x, target.y, target.z);
    snapped = true;
  } else {
    body.position.x += dx * posRate;
    body.position.y += dy * posRate;
    body.position.z += dz * posRate;
  }
  body.velocity.x = lerp(body.velocity.x, target.vx, velRate);
  body.velocity.y = lerp(body.velocity.y, target.vy, velRate);
  body.velocity.z = lerp(body.velocity.z, target.vz, velRate);
  if (target.ud) {
    for (const [key, val] of Object.entries(target.ud)) {
      body.userData[key] = val;
    }
  }
  return { err, snapped };
}

/**
 * Time-buffered interpolation: render clock runs between snapshot timestamps
 * so motion is smooth at display refresh, not stepped at 60 Hz.
 */
export function createInterpolator() {
  /** @type {object[]} */
  const snapshots = [];
  let remoteDelayMs = BASE_DELAY_MS;
  /** Advances every frame so tests and gameplay interpolate between snapshot times. */
  let renderClockMs = null;
  let debugStats = {
    localErr: 0,
    remoteErr: 0,
    snapsThisFrame: 0,
    snapsPerSec: 0,
  };

  return {
    pushSnapshot(snap) {
      if (!snap || snap.tick == null) return;
      const now = performance.now?.() ?? Date.now();
      const last = snapshots[snapshots.length - 1];
      if (last?.tick === snap.tick) {
        last.at = now;
        snapshots[snapshots.length - 1] = { ...snap, at: last.at };
        return;
      }
      let at = now;
      if (last?.tick != null && snap.tick > last.tick) {
        at = Math.max(now, last.at + (snap.tick - last.tick) * TICK_MS);
      }
      snapshots.push({ ...snap, at });
      while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
    },

    setRtt(ms) {
      if (ms == null || ms <= 0) return;
      remoteDelayMs = Math.min(MAX_DELAY_MS, Math.max(BASE_DELAY_MS, ms * 0.5 + TICK_MS * 0.5));
    },

    update(dt, state, localSlot = 0, { steering = false } = {}) {
      debugStats.snapsThisFrame = 0;
      if (!snapshots.length || !state.playerBody) {
        return debugStats;
      }

      const wallNow = performance.now?.() ?? Date.now();
      if (renderClockMs == null) {
        renderClockMs = snapshots[0]?.at ?? wallNow;
      }
      renderClockMs += dt * 1000;
      if (wallNow > renderClockMs) renderClockMs = wallNow;
      const now = renderClockMs;
      const latest = snapshots[snapshots.length - 1];
      const localSide = localSlot === 0 ? 'player' : 'ai';
      const remoteSide = localSlot === 0 ? 'ai' : 'player';
      const localBody = localSide === 'player' ? state.playerBody : state.aiBody;
      const remoteBody = localSide === 'player' ? state.aiBody : state.playerBody;

      const remoteBracket = findTimeBracket(snapshots, now - remoteDelayMs);
      if (remoteBracket.before && remoteBracket.after) {
        interpolateBody(
          remoteBody,
          remoteBracket.before,
          remoteBracket.after,
          remoteSide,
          remoteBracket.alpha
        );
        if (remoteBracket.extrapSec > 0) {
          const data = bodyDataForSide(remoteBracket.after, remoteSide);
          extrapolateBodyPose(remoteBody, data, remoteBracket.extrapSec);
        }
      }

      const localBracket = findTimeBracket(snapshots, now);
      const localTarget = bodyDataForSide(localBracket.after ?? latest, localSide);
      if (localTarget && localBody) {
        reconcileBody(localBody, localTarget, dt, { steering });
      }

      const localLatest = bodyDataForSide(latest, localSide);
      const remoteLatest = bodyDataForSide(latest, remoteSide);
      debugStats.localErr = bodyErr(localBody, localLatest);
      debugStats.remoteErr = bodyErr(remoteBody, remoteLatest);

      return debugStats;
    },

    getDebugStats() {
      return { ...debugStats };
    },

    reset() {
      snapshots.length = 0;
      remoteDelayMs = BASE_DELAY_MS;
      renderClockMs = null;
      debugStats = {
        localErr: 0,
        remoteErr: 0,
        snapsThisFrame: 0,
        snapsPerSec: 0,
      };
    },

    get delayTicks() {
      return remoteDelayMs / TICK_MS;
    },
  };
}
