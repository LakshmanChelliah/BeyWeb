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

function once(ws, type, timeout = 10000) {
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

function collect(ws, type, ms = 3000) {
  return new Promise((resolve) => {
    const out = [];
    const t = setTimeout(() => {
      ws.off('message', handler);
      resolve(out);
    }, ms);
    function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) out.push(msg);
    }
    ws.on('message', handler);
  });
}

async function main() {
  const { close } = await startServer(PORT);
  await wait(200);

  const host = await connect();
  host.send(JSON.stringify({ type: MSG.CREATE_ROOM }));
  const created = await once(host, MSG.ROOM_CREATED);
  const roomId = created.roomId;

  const guest = await connect();
  guest.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId }));
  await once(guest, MSG.JOINED);
  await once(host, MSG.PEER_JOINED);

  host.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'pegasus' }));
  guest.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'ldrago' }));

  await once(host, MSG.MATCH_CONFIG);
  await once(host, MSG.COUNTDOWN);

  // Wait through 3-2-1-0 countdown plus match start buffer
  await wait(4500);

  const roundEnds = [];
  const snaps = [];
  host.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === MSG.ROUND_END) roundEnds.push(msg);
    if (msg.type === MSG.SNAPSHOT) snaps.push(msg);
  });
  await wait(2000);

  host.close();
  guest.close();
  close();

  if (roundEnds.length > 0) {
    console.error('FAIL: round_end during first 4s after countdown start', roundEnds[0]);
    process.exit(1);
  }
  if (snaps.length < 5) {
    console.error(`FAIL: expected snapshots after countdown, got ${snaps.length}`);
    process.exit(1);
  }
  console.log(`countdown start OK (${snaps.length} snapshots, no early round_end)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
