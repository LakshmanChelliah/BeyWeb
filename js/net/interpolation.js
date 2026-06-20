import { TICK_RATE } from './protocol.js';

const SNAP_EPS = 2.5;
const BASE_DELAY_TICKS = 2;
const MAX_DELAY_TICKS = 6;
const MAX_SNAPSHOTS = 64;
const RECONCILE_RATE = 14;

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

function applyUserData(body, ud) {
  if (!body || !ud) return;
  for (const [key, val] of Object.entries(ud)) {
    body.userData[key] = val;
  }
}

function interpolateBody(body, a, b, t) {
  if (!body || !a || !b) return;
  body.position.x = lerp(a.x, b.x, t);
  body.position.y = lerp(a.y, b.y, t);
  body.position.z = lerp(a.z, b.z, t);
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
  applyUserData(body, t >= 0.5 ? b.ud : a.ud);
}

function reconcileBody(body, target, dt) {
  if (!body || !target) return;
  const dx = target.x - body.position.x;
  const dy = target.y - body.position.y;
  const dz = target.z - body.position.z;
  const err = Math.hypot(dx, dz);
  if (err > SNAP_EPS) {
    body.position.set(target.x, target.y, target.z);
  } else {
    const rate = Math.min(1, dt * RECONCILE_RATE);
    body.position.x += dx * rate;
    body.position.y += dy * rate;
    body.position.z += dz * rate;
  }
  const velRate = Math.min(1, dt * 10);
  body.velocity.x = lerp(body.velocity.x, target.vx, velRate);
  body.velocity.y = lerp(body.velocity.y, target.vy, velRate);
  body.velocity.z = lerp(body.velocity.z, target.vz, velRate);
  applyUserData(body, target.ud);
}

function findBracket(snaps, targetTick) {
  if (snaps.length === 1) {
    return { before: snaps[0], after: snaps[0], alpha: 0 };
  }
  let before = snaps[0];
  let after = snaps[snaps.length - 1];
  for (let i = 0; i < snaps.length - 1; i++) {
    const a = snaps[i];
    const b = snaps[i + 1];
    if (a.tick <= targetTick && b.tick >= targetTick) {
      before = a;
      after = b;
      const span = after.tick - before.tick;
      return {
        before,
        after,
        alpha: span > 0 ? (targetTick - before.tick) / span : 0,
      };
    }
  }
  if (targetTick >= after.tick) return { before: after, after, alpha: 1 };
  return { before, after: before, alpha: 0 };
}

function bodyDataForSide(snap, side) {
  return side === 'player' ? snap.player : snap.ai;
}

/**
 * Tick-buffered interpolation for the opponent; soft reconciliation for the local bey.
 */
export function createInterpolator() {
  /** @type {object[]} */
  const snapshots = [];
  let latestTick = 0;
  let delayTicks = BASE_DELAY_TICKS;

  return {
    pushSnapshot(snap) {
      if (!snap || snap.tick == null) return;
      const last = snapshots[snapshots.length - 1];
      if (last?.tick === snap.tick) {
        snapshots[snapshots.length - 1] = snap;
      } else if (!last || snap.tick > last.tick) {
        snapshots.push(snap);
        latestTick = snap.tick;
      }
      while (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
    },

    setRtt(ms) {
      if (ms == null || ms <= 0) return;
      const halfTripTicks = Math.ceil((ms * 0.5) / (1000 / TICK_RATE));
      delayTicks = Math.min(MAX_DELAY_TICKS, Math.max(BASE_DELAY_TICKS, halfTripTicks + 1));
    },

    update(dt, state, localSlot = 0) {
      if (!snapshots.length || !state.playerBody) return;

      const latest = snapshots[snapshots.length - 1];
      const targetTick = Math.max(
        snapshots[0].tick,
        latest.tick - delayTicks
      );
      const { before, after, alpha } = findBracket(snapshots, targetTick);

      const localSide = localSlot === 0 ? 'player' : 'ai';
      const remoteSide = localSlot === 0 ? 'ai' : 'player';

      const remoteBody = localSide === 'player' ? state.aiBody : state.playerBody;
      const remoteBefore = bodyDataForSide(before, remoteSide);
      const remoteAfter = bodyDataForSide(after, remoteSide);
      interpolateBody(remoteBody, remoteBefore, remoteAfter, alpha);

      const localBody = localSide === 'player' ? state.playerBody : state.aiBody;
      const localData = bodyDataForSide(latest, localSide);
      reconcileBody(localBody, localData, dt);
    },

    reset() {
      snapshots.length = 0;
      latestTick = 0;
      delayTicks = BASE_DELAY_TICKS;
    },

    get delayTicks() {
      return delayTicks;
    },
  };
}
