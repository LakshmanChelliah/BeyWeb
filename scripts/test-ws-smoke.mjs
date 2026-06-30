import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { MSG } from '../js/net/protocol.js';

const PORT = 3099;

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

async function main() {
  const { close } = await startServer(PORT);
  await wait(200);

  const host = await connect();
  const hostCreated = await new Promise((resolve) => {
    host.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === MSG.ROOM_CREATED) resolve(msg);
    });
    host.send(JSON.stringify({ type: MSG.CREATE_ROOM }));
  });

  const roomId = hostCreated.roomId;
  const guest = await connect();
  guest.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId }));

  await once(guest, MSG.JOINED);
  await once(host, MSG.PEER_JOINED);

  host.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'pegasus' }));
  guest.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'ldrago' }));

  await once(host, MSG.MATCH_CONFIG);
  await once(host, MSG.COUNTDOWN);

  // Wait for match to start and send steer input.
  await wait(4500);
  host.send(JSON.stringify({
    type: MSG.INPUT,
    tick: 1,
    steer: { x: 0.8, y: 0.3 },
  }));

  let snapshots = 0;
  let sawInputTick = false;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('not enough snapshots')), 12000);
    function onSnap(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === MSG.SNAPSHOT) {
        snapshots += 1;
        if (msg.tick > 60) sawInputTick = true;
        if (snapshots >= 20 && sawInputTick) {
          clearTimeout(t);
          host.off('message', onSnap);
          resolve();
        }
      }
    }
    host.on('message', onSnap);
  });

  host.close();
  guest.close();
  close();
  console.log(`ws smoke OK (${snapshots} snapshots)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
