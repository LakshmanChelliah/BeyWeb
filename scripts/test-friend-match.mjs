/**
 * Simulates two friends locking different beys and verifies MATCH_CONFIG payloads.
 */
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { MSG } from '../js/net/protocol.js';

const PORT = 3110;

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

function once(ws, type, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
    const handler = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type !== type) return;
      clearTimeout(timer);
      ws.off('message', handler);
      resolve(msg);
    };
    ws.on('message', handler);
  });
}

async function main() {
  const { close } = await startServer(PORT);
  await wait(200);

  const host = await connect();
  const guest = await connect();

  host.send(JSON.stringify({ type: MSG.CREATE_ROOM }));
  const created = await once(host, MSG.ROOM_CREATED);
  const roomId = created.roomId;

  guest.send(JSON.stringify({ type: MSG.JOIN_ROOM, roomId }));
  await once(guest, MSG.JOINED);

  host.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'lightning_ldrago' }));
  guest.send(JSON.stringify({ type: MSG.LOCK_BEY, beyId: 'pegasus' }));

  const hostCfg = await once(host, MSG.MATCH_CONFIG);
  const guestCfg = await once(guest, MSG.MATCH_CONFIG);

  for (const [label, cfg] of [['host', hostCfg], ['guest', guestCfg]]) {
    if (cfg.beyIds?.join(',') !== 'lightning_ldrago,pegasus') {
      throw new Error(`${label}: wrong beyIds ${cfg.beyIds}`);
    }
    if (cfg.beys?.[0]?.id !== 'lightning_ldrago' || cfg.beys?.[1]?.id !== 'pegasus') {
      throw new Error(`${label}: wrong beys payload`);
    }
    if (!cfg.beys[0]?.model?.includes('lightning_ldrago')) {
      throw new Error(`${label}: missing ldrago model path`);
    }
    if (!cfg.beys[1]?.gimmicks?.special?.includes('pegasus')) {
      throw new Error(`${label}: missing pegasus gimmicks`);
    }
  }

  const hostCd = await once(host, MSG.COUNTDOWN);
  const guestCd = await once(guest, MSG.COUNTDOWN);
  if (hostCd.seconds < 1 || guestCd.seconds < 1) {
    throw new Error(`expected active countdown, got host=${hostCd.seconds} guest=${guestCd.seconds}`);
  }

  host.close();
  guest.close();
  close();
  console.log('friend match config OK (lightning_ldrago vs pegasus, server bey payloads)');
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
