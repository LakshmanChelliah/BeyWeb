import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { Room } from '../server/Room.js';
import { MSG } from '../js/net/protocol.js';

const PORT = 3098;

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

function countMessages(ws, type, durationMs) {
  let n = 0;
  const handler = (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === type) n += 1;
  };
  ws.on('message', handler);
  return wait(durationMs).then(() => {
    ws.off('message', handler);
    return n;
  });
}

async function main() {
  const { close } = await startServer(PORT);
  await wait(150);

  const room = new Room('UNIT', () => {});
  room.state = 'awaiting_ready';
  room.match = { state: { gameRunning: false } };
  room.slots = [{}, {}];

  room.markReady(0);
  if (room.state !== 'awaiting_ready' || room.readySlots.size !== 1) {
    throw new Error('one ready should keep awaiting_ready');
  }

  room.markReady(1);
  if (room.state !== 'countdown' || room.readySlots.size !== 0) {
    throw new Error('both ready should enter countdown and clear ready set');
  }

  const host = await connect();
  const guest = await connect();

  host.send(JSON.stringify({ type: MSG.CREATE_ROOM }));
  const created = await new Promise((resolve) => {
    host.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === MSG.ROOM_CREATED) resolve(msg);
    });
  });

  guest.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId: created.roomId }));
  await wait(200);

  host.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'pegasus' }));
  guest.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'ldrago' }));
  await wait(800);

  host.send(JSON.stringify({ type: MSG.NEXT_ROUND_READY }));
  await wait(400);
  const snapsAfterOne = await countMessages(host, MSG.SNAPSHOT, 500);
  if (snapsAfterOne > 2) {
    throw new Error(`single ready during play should not flood snapshots (got ${snapsAfterOne})`);
  }

  host.close();
  guest.close();
  close();
  console.log('ready gate OK');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
