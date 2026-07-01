import { MSG, wsUrl, parseRoomFromUrl } from './protocol.js?v=26';

/**
 * Browser WebSocket client for online multiplayer.
 */
export function createNetClient({ onMessage, onStatus } = {}) {
  let ws = null;
  let slot = null;
  let roomId = null;
  let connected = false;
  let lastSnapshotTick = 0;
  let snapshotCount = 0;
  const handlers = new Map();

  function emit(type, data) {
    const list = handlers.get(type) ?? [];
    for (const fn of list) fn(data);
    onMessage?.(type, data);
  }

  function setStatus(status, detail = '') {
    onStatus?.(status, detail);
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      setStatus('connecting');
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        connected = true;
        setStatus('connected');
        resolve();
      };
      ws.onerror = (e) => {
        setStatus('error', 'Connection failed');
        reject(e);
      };
      ws.onclose = () => {
        connected = false;
        setStatus('disconnected');
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.type === MSG.JOINED || msg.type === MSG.ROOM_CREATED) {
          slot = msg.slot;
          roomId = msg.roomId;
        }
        if (msg.type === MSG.SNAPSHOT) {
          snapshotCount += 1;
          if (msg.tick != null) lastSnapshotTick = msg.tick;
        }
        emit(msg.type, msg);
      };
    });
  }

  function send(msg) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
    return () => {
      const list = handlers.get(type);
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  async function createRoom({ reclaimRoomId = null } = {}) {
    await connect();
    send({
      type: MSG.CREATE_ROOM,
      ...(reclaimRoomId ? { reclaimRoomId } : {}),
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        offOk();
        offErr();
        reject(new Error('Game server not responding'));
      }, 8000);
      const offOk = on(MSG.ROOM_CREATED, (msg) => {
        clearTimeout(timer);
        offOk();
        offErr();
        resolve(msg);
      });
      const offErr = on(MSG.ERROR, (msg) => {
        clearTimeout(timer);
        offOk();
        offErr();
        reject(new Error(msg.message || 'Could not create room'));
      });
    });
  }

  async function joinRoom(id) {
    await connect();
    send({ type: MSG.JOIN_ROOM, roomId: id });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        offOk();
        offErr();
        reject(new Error('Game server not responding'));
      }, 8000);
      const offOk = on(MSG.JOINED, (msg) => {
        clearTimeout(timer);
        offOk();
        offErr();
        resolve(msg);
      });
      const offErr = on(MSG.ERROR, (msg) => {
        clearTimeout(timer);
        offOk();
        offErr();
        reject(new Error(msg.message || 'Join failed'));
      });
    });
  }

  async function autoJoin() {
    const fromUrl = parseRoomFromUrl();
    if (fromUrl) return joinRoom(fromUrl);
    return createRoom();
  }

  function lockBey(beyId) {
    send({ type: MSG.LOCK_BEY, beyId });
  }

  function syncPicks() {
    send({ type: MSG.SYNC_PICKS });
  }

  function unlockBey() {
    send({ type: MSG.UNLOCK_BEY });
  }

  function sendReady() {
    if (roomId == null || slot == null) return false;
    return send({ type: MSG.NEXT_ROUND_READY, roomId, slot });
  }

  function sendInput(tick, steer, ability) {
    send({ type: MSG.INPUT, tick, steer, ability });
  }

  function ping() {
    const t = performance.now();
    send({ type: MSG.PING, t });
    return new Promise((resolve) => {
      const off = on(MSG.PONG, (msg) => {
        off();
        resolve({
          rtt: performance.now() - t,
          serverTick: msg.serverTick,
        });
      });
      setTimeout(() => {
        off();
        resolve(null);
      }, 2000);
    });
  }

  function debugEmit(type, data) {
    emit(type, data);
  }

  function close() {
    ws?.close();
    ws = null;
    slot = null;
    roomId = null;
    connected = false;
  }

  return {
    connect,
    createRoom,
    joinRoom,
    autoJoin,
    lockBey,
    syncPicks,
    unlockBey,
    sendReady,
    sendInput,
    ping,
    send,
    on,
    debugEmit,
    close,
    get slot() { return slot; },
    get roomId() { return roomId; },
    get connected() { return connected; },
    get wsOpen() { return ws?.readyState === WebSocket.OPEN; },
    get lastSnapshotTick() { return lastSnapshotTick; },
    get snapshotCount() { return snapshotCount; },
  };
}
