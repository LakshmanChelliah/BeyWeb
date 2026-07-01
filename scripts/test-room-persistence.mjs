import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { MSG } from '../js/net/protocol.js';

const PORT = 3101;

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

function once(ws, type, timeout = 8000) {
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

function onceError(ws, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for error')), timeout);
    function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === MSG.ERROR) {
        clearTimeout(t);
        ws.off('message', handler);
        resolve(msg);
      }
    }
    ws.on('message', handler);
  });
}

async function main() {
  const { close } = await startServer(PORT);
  await wait(100);

  const host = await connect();
  const created = await new Promise((resolve) => {
    host.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === MSG.ROOM_CREATED) resolve(msg);
    });
    host.send(JSON.stringify({ type: MSG.CREATE_ROOM }));
  });
  const roomId = created.roomId;

  host.close();
  await wait(100);

  const guest = await connect();
  guest.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId }));
  await once(guest, MSG.JOINED);
  guest.close();

  const host2 = await connect();
  host2.send(JSON.stringify({ type: MSG.CREATE_ROOM, reclaimRoomId: roomId }));
  const reclaimed = await once(host2, MSG.ROOM_CREATED);
  if (!reclaimed.reclaimed) throw new Error('expected reclaimed room');
  if (reclaimed.roomId !== roomId) throw new Error('reclaimed id mismatch');

  host2.close();
  await wait(100);

  const missing = await connect();
  missing.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId: 'ZZZZZZ' }));
  const err = await onceError(missing);
  if (!/not found/i.test(err.message)) throw new Error(`unexpected error: ${err.message}`);
  missing.close();

  close();
  console.log('room persistence smoke OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
