import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { Room } from '../server/Room.js';
import { MSG } from '../js/net/protocol.js';

const PORT = 3097;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function collect(ws, type, durationMs) {
  const msgs = [];
  const handler = (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === type) msgs.push(msg);
  };
  ws.on('message', handler);
  return wait(durationMs).then(() => {
    ws.off('message', handler);
    return msgs;
  });
}

async function once(ws, type, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
    function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(t);
        ws.off('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

async function joinMatch(host, guest) {
  host.send(JSON.stringify({ type: MSG.CREATE_ROOM }));
  const created = await once(host, MSG.ROOM_CREATED);
  guest.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId: created.roomId }));
  await once(guest, MSG.JOINED);
  await once(host, MSG.PEER_JOINED);
  host.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'pegasus' }));
  guest.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'ldrago' }));
  await once(host, MSG.MATCH_CONFIG);
  await once(host, MSG.COUNTDOWN);
  await wait(3500);
  return created.roomId;
}

async function main() {
  process.env.ENABLE_E2E = '1';
  const { close } = await startServer(PORT);
  await wait(150);

  const room = new Room('UNIT', () => {});
  room.state = 'awaiting_ready';
  room.match = { state: { gameRunning: false } };
  room.slots = [{}, {}];

  room.markReady(0);
  if (room.state !== 'awaiting_ready') {
    throw new Error('single ready should stay in awaiting_ready');
  }

  room.markReady(1);
  if (room.state !== 'countdown') {
    throw new Error('both ready should enter countdown');
  }
  room.stopTimers();

  const rematchRoom = new Room('REMATCH', () => {});
  rematchRoom.state = 'awaiting_rematch';
  rematchRoom.slots = [{}, {}];
  rematchRoom.locks = [{ beyId: 'pegasus', locked: true }, { beyId: 'ldrago', locked: true }];
  rematchRoom.scores = [2, 0];
  rematchRoom.round = 3;
  rematchRoom.match = { state: { gameRunning: false } };
  rematchRoom.markReady(0);
  if (rematchRoom.state !== 'awaiting_rematch') {
    throw new Error('single rematch ready should stay in awaiting_rematch');
  }
  rematchRoom.markReady(1);
  if (rematchRoom.state !== 'picking') {
    throw new Error('both rematch ready should enter picking');
  }
  if (rematchRoom.scores[0] !== 0 || rematchRoom.round !== 1) {
    throw new Error('rematch should reset series state');
  }

  const resyncRoom = new Room('RESYNC', () => {});
  resyncRoom.state = 'countdown';
  resyncRoom.countdownSeconds = 2;
  resyncRoom.slots = [{}, {}];
  const sent = [];
  resyncRoom.send = (ws, msg) => sent.push(msg);
  resyncRoom.markReady(0);
  if (!sent.some((m) => m.type === MSG.COUNTDOWN && m.seconds === 2)) {
    throw new Error('stray ready during countdown should resync countdown tick');
  }

  const host = await connect();
  const guest = await connect();
  const roomId = await joinMatch(host, guest);

  const roundEndHostP = once(host, MSG.ROUND_END);
  const roundEndGuestP = once(guest, MSG.ROUND_END);
  const readyHostP = once(host, MSG.READY_STATUS);
  const readyGuestP = once(guest, MSG.READY_STATUS);
  host.send(JSON.stringify({ type: MSG.DEBUG_ROUND_END, roomId, slot: 0 }));

  const [roundEndHost, roundEndGuest, readyHost, readyGuest] = await Promise.all([
    roundEndHostP,
    roundEndGuestP,
    readyHostP,
    readyGuestP,
  ]);
  if (!roundEndHost || !roundEndGuest) throw new Error('expected round_end');
  if (readyHost.readyCount !== 0 || readyGuest.readyCount !== 0) {
    throw new Error('ready_status should start at 0/2 after round end');
  }

  const countdownDuringWait = await collect(host, MSG.COUNTDOWN, 600);
  if (countdownDuringWait.length > 0) {
    throw new Error('countdown should not start before both ready');
  }

  host.send(JSON.stringify({ type: MSG.NEXT_ROUND_READY, roomId, slot: 0 }));
  await wait(200);
  const countdownAfterOne = await collect(host, MSG.COUNTDOWN, 400);
  if (countdownAfterOne.length > 0) {
    throw new Error('countdown should not start with only one ready');
  }

  guest.send(JSON.stringify({ type: MSG.NEXT_ROUND_READY, roomId, slot: 1 }));
  await once(host, MSG.COUNTDOWN);
  await wait(3500);

  const snaps = await collect(host, MSG.SNAPSHOT, 800);
  if (snaps.length < 5) {
    throw new Error(`expected snapshots after next round (got ${snaps.length})`);
  }
  const frozenSnaps = snaps.filter((s) => s.gameFrozen === true);
  if (frozenSnaps.length > 0) {
    throw new Error('snapshots after next round must not have gameFrozen=true');
  }

  host.close();
  guest.close();
  close();
  console.log('next-round flow OK');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
