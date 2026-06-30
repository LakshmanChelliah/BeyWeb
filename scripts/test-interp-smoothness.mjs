/**
 * Validates interpolation smoothness and documents legacy snap behavior.
 */
import {
  createInterpolator,
  reconcileBody,
  SNAP_EPS,
} from '../js/net/interpolation.js';

const DT = 1 / 60;
const FRAMES = 120;
const MAX_SMOOTH_DELTA = 1.5;

function mockBody(x = 0, z = 0) {
  return {
    position: { x, y: 0, z, set(px, py, pz) { this.x = px; this.y = py; this.z = pz; } },
    velocity: { x: 0, y: 0, z: 0, set(vx, vy, vz) { this.x = vx; this.y = vy; this.z = vz; } },
    quaternion: { x: 0, y: 0, z: 0, w: 1, set() {} },
    angularVelocity: { x: 0, y: 0, z: 0, set() {} },
    userData: {},
  };
}

function snapBody(tick, x, z) {
  const mk = (px, pz) => ({
    x: px,
    y: 0,
    z: pz,
    vx: 0.12,
    vy: 0,
    vz: 0,
    avx: 0,
    avy: 0,
    avz: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
    ud: {},
  });
  return {
    tick,
    playerSpin: 1,
    aiSpin: 1,
    launchGrace: 0,
    player: mk(x, z),
    ai: mk(-x, -z),
  };
}

function seedSnapshots(interp, startTick = 10) {
  for (let i = 0; i < 12; i++) {
    const tick = startTick + i;
    interp.pushSnapshot(snapBody(tick, tick * 0.12, 0));
  }
}

function maxDelta(body) {
  let max = 0;
  let prevX = body.position.x;
  let prevZ = body.position.z;
  return {
    track() {
      const d = Math.hypot(body.position.x - prevX, body.position.z - prevZ);
      if (d > max) max = d;
      prevX = body.position.x;
      prevZ = body.position.z;
      return max;
    },
    get() { return max; },
  };
}

function testLegacySnapMechanism() {
  const body = mockBody(0, 0);
  const target = snapBody(1, 8, 0).player;
  const beforeX = body.position.x;
  const { snapped, err } = reconcileBody(body, target, DT, { steering: false });
  const jump = Math.hypot(body.position.x - beforeX, body.position.z - 0);
  if (!snapped || err <= SNAP_EPS || jump < SNAP_EPS) {
    console.error('FAIL: legacy reconcile should hard-snap when error exceeds SNAP_EPS', {
      snapped,
      err,
      jump,
    });
    process.exit(1);
  }
  console.log('legacy snap mechanism OK', { err: Math.round(err * 10) / 10, jump: Math.round(jump * 10) / 10 });
}

function runInterpOnly() {
  const interp = createInterpolator();
  seedSnapshots(interp);
  const state = {
    playerBody: mockBody(1, 0),
    aiBody: mockBody(-1, 0),
  };
  const localTracker = maxDelta(state.playerBody);
  const remoteTracker = maxDelta(state.aiBody);

  for (let f = 0; f < FRAMES; f++) {
    interp.update(DT, state, 0);
    localTracker.track();
    remoteTracker.track();
    if (f % 8 === 0) {
      interp.pushSnapshot(snapBody(22 + f, (22 + f) * 0.12, 0));
    }
  }

  const stats = interp.getDebugStats();
  return {
    maxDelta: Math.max(localTracker.get(), remoteTracker.get()),
    snaps: stats.snapsPerSec,
    localErr: stats.localErr,
    remoteErr: stats.remoteErr,
  };
}

function runBurstSnapshots() {
  const interp = createInterpolator();
  const state = {
    playerBody: mockBody(0, 0),
    aiBody: mockBody(0, 0),
  };
  for (let i = 0; i < 8; i++) {
    interp.pushSnapshot(snapBody(10 + i, (10 + i) * 0.12, 0));
  }
  for (let i = 0; i < 6; i++) {
    interp.update(DT, state, 0);
  }
  const tracker = maxDelta(state.playerBody);
  interp.pushSnapshot(snapBody(18, 18 * 0.12, 0));
  interp.pushSnapshot(snapBody(19, 19 * 0.12, 0));
  interp.pushSnapshot(snapBody(20, 20 * 0.12, 0));
  for (let f = 0; f < 12; f++) {
    interp.update(DT, state, 0);
    tracker.track();
  }
  return tracker.get();
}

function main() {
  testLegacySnapMechanism();
  const smooth = runInterpOnly();
  console.log('interp-only:', smooth);

  if (smooth.maxDelta > MAX_SMOOTH_DELTA) {
    console.error(`FAIL: interp-only maxDelta ${smooth.maxDelta} > ${MAX_SMOOTH_DELTA}`);
    process.exit(1);
  }
  if (smooth.snaps > 2) {
    console.error(`FAIL: interp-only snaps/s ${smooth.snaps} too high`);
    process.exit(1);
  }

  const burstMax = runBurstSnapshots();
  console.log('burst maxDelta:', burstMax);
  if (burstMax > MAX_SMOOTH_DELTA) {
    console.error(`FAIL: burst maxDelta ${burstMax} > ${MAX_SMOOTH_DELTA}`);
    process.exit(1);
  }

  console.log(`interp smoothness OK (SNAP_EPS=${SNAP_EPS})`);
  process.exit(0);
}

main();
