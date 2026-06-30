import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { MSG } from '../js/net/protocol.js';

const PORT = 3102;

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

function once(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${type}`)), timeout);
    ws.on('message', function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(t);
        ws.off('message', handler);
        resolve(msg);
      }
    });
  });
}

async function testPair(beyId) {
  const host = await connect();
  host.send(JSON.stringify({ type: MSG.CREATE_ROOM }));
  const created = await once(host, MSG.ROOM_CREATED);

  const guest = await connect();
  guest.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId: created.roomId }));
  await once(guest, MSG.JOINED);
  await once(host, MSG.PEER_JOINED);

  host.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId }));
  const pickStatus = await once(host, MSG.PICK_STATUS);
  if (pickStatus.slots[0] !== 'locked' || pickStatus.beyIds?.[0] !== beyId) {
    console.error(`FAIL ${beyId}: pick status`, pickStatus);
    process.exit(1);
  }
  guest.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'pegasus' }));
  const cfg = await once(host, MSG.MATCH_CONFIG);

  host.close();
  guest.close();
  return { pickStatus, cfg };
}

async function main() {
  const { close } = await startServer(PORT);
  await wait(200);

  for (const id of ['eagle', 'striker', 'lightning_ldrago']) {
    const { pickStatus, cfg } = await testPair(id);
    if (pickStatus.slots[0] !== 'locked') {
      console.error(`FAIL ${id}: host slot not locked`, pickStatus);
      process.exit(1);
    }
    if (cfg.beyIds[0] !== id) {
      console.error(`FAIL ${id}: wrong bey in match config`, cfg.beyIds);
      process.exit(1);
    }
    console.log(`${id} lock OK`);
  }

  close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
