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

function once(ws, type, timeout = 15000) {
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

  console.log('waiting 16s in lobby before lock (simulates bey pick)...');
  await wait(16000);

  const messages = [];
  function tap(ws) {
    ws.on('message', (raw) => {
      messages.push(JSON.parse(raw.toString()));
    });
  }
  tap(host);
  tap(guest);

  host.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'pegasus' }));
  guest.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'ldrago' }));

  await wait(6000);

  host.close();
  guest.close();
  close();

  const forfeits = messages.filter((m) => m.type === MSG.FORFEIT);
  const roundEnds = messages.filter((m) => m.type === MSG.ROUND_END);
  const seriesEnds = messages.filter((m) => m.type === MSG.SERIES_END);
  const snaps = messages.filter((m) => m.type === MSG.SNAPSHOT);

  console.log({
    forfeits: forfeits.length,
    roundEnds: roundEnds.length,
    seriesEnds: seriesEnds.length,
    snaps: snaps.length,
  });
  if (forfeits.length > 0 || seriesEnds.length > 0) {
    console.error('FAIL: forfeit after lobby wait', { forfeits, seriesEnds });
    process.exit(1);
  }
  if (snaps.length < 5) {
    console.error('FAIL: expected snapshots after match start');
    process.exit(1);
  }
  console.log('lobby wait OK');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
