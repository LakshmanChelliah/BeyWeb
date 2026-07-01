import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { Room } from './Room.js';
import { tryServeStatic } from './static.js';
import {
  MSG,
  SERVER_PORT,
  generateRoomId,
  isValidRoomId,
  ROOM_EMPTY_TTL_MS,
} from '../js/net/protocol.js';

const rooms = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const roomDeleteTimers = new Map();

function cancelRoomDeletion(roomId) {
  const timer = roomDeleteTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    roomDeleteTimers.delete(roomId);
  }
}

function scheduleRoomDeletion(roomId) {
  cancelRoomDeletion(roomId);
  const timer = setTimeout(() => {
    roomDeleteTimers.delete(roomId);
    const room = rooms.get(roomId);
    if (room && !room.slots[0] && !room.slots[1]) {
      rooms.delete(roomId);
    }
  }, ROOM_EMPTY_TTL_MS);
  roomDeleteTimers.set(roomId, timer);
}

function findRoomForJoin(roomId) {
  return rooms.get(roomId?.toUpperCase());
}

function registerRoom(room) {
  rooms.set(room.id, room);
  cancelRoomDeletion(room.id);
  return room;
}

function makeRoom(id) {
  const room = new Room(id, (msg) => {
    for (const ws of room.slots) {
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify(msg));
      }
    }
  });
  return registerRoom(room);
}

function createRoom() {
  let id;
  do {
    id = generateRoomId();
  } while (rooms.has(id));
  return makeRoom(id);
}

function reclaimOrCreateRoom(reclaimId) {
  const id = reclaimId.toUpperCase();
  if (!isValidRoomId(id)) return null;

  const existing = rooms.get(id);
  if (existing) {
    if (existing.slots[0] || existing.slots[1]) return null;
    cancelRoomDeletion(id);
    return existing;
  }

  return makeRoom(id);
}

function assignSlot(room) {
  if (!room.slots[0]) return 0;
  if (!room.slots[1]) return 1;
  return -1;
}

function attachWss(httpServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.room = null;
    ws.slot = null;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: MSG.ERROR, message: 'Invalid JSON' }));
        return;
      }

      if (msg.type === MSG.CREATE_ROOM) {
        if (ws.room) {
          ws.send(JSON.stringify({ type: MSG.ERROR, message: 'Already in a room' }));
          return;
        }

        const reclaimId = msg.reclaimRoomId?.toUpperCase?.();
        let room;
        let reclaimed = false;
        if (reclaimId) {
          room = reclaimOrCreateRoom(reclaimId);
          if (!room) {
            ws.send(JSON.stringify({
              type: MSG.ERROR,
              message: 'Room already in use — create a new room instead',
            }));
            return;
          }
          reclaimed = true;
        } else {
          room = createRoom();
        }

        const slot = 0;
        room.addPlayer(ws, slot);
        ws.send(JSON.stringify({
          type: MSG.ROOM_CREATED,
          roomId: room.id,
          slot,
          reclaimed,
        }));
        return;
      }

      if (msg.type === MSG.JOIN_ROOM) {
        if (ws.room) return;
        const room = findRoomForJoin(msg.roomId);
        if (!room) {
          ws.send(JSON.stringify({
            type: MSG.ERROR,
            message: 'Room not found — ask the host to create a new room or check the link',
          }));
          return;
        }
        cancelRoomDeletion(room.id);
        const slot = assignSlot(room);
        if (slot < 0) {
          ws.send(JSON.stringify({ type: MSG.ERROR, message: 'Room full' }));
          return;
        }
        room.addPlayer(ws, slot);
        ws.send(JSON.stringify({
          type: MSG.JOINED,
          roomId: room.id,
          slot,
        }));
        room.broadcastAll({
          type: MSG.PEER_JOINED,
          slot,
          peerCount: room.slots.filter(Boolean).length,
        });
        if (room.slots[0] && room.slots[1]) {
          room.state = 'picking';
          room.broadcastAll(room.pickStatusPayload());
        }
        return;
      }

      if (ws.room) {
        ws.room.handleMessage(ws, msg);
      } else if (msg.roomId) {
        const room = findRoomForJoin(msg.roomId);
        if (room) {
          if (msg.slot === 0 || msg.slot === 1) {
            ws.slot = msg.slot;
            ws.room = room;
            room.slots[msg.slot] = ws;
            cancelRoomDeletion(room.id);
            room.handleMessage(ws, msg);
          }
        }
      }
    });

    ws.on('close', () => {
      if (ws.room) {
        const roomId = ws.room.id;
        ws.room.removePlayer(ws);
        if (!ws.room.slots[0] && !ws.room.slots[1]) {
          scheduleRoomDeletion(roomId);
        }
      }
    });
  });

  return wss;
}

export function startServer(port = SERVER_PORT, { serveStatic = false } = {}) {
  const httpServer = createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }

    if (serveStatic && req.method === 'GET') {
      const served = await tryServeStatic(req, res);
      if (served) return;
    }

    res.writeHead(404);
    res.end();
  });

  attachWss(httpServer);

  return new Promise((resolve) => {
    httpServer.listen(port, '0.0.0.0', () => {
      const mode = serveStatic ? 'game + multiplayer' : 'multiplayer';
      console.log(`BeyWeb ${mode} server listening on port ${port}`);
      resolve({
        httpServer,
        close: () => new Promise((r) => httpServer.close(r)),
      });
    });
  });
}

import { pathToFileURL } from 'url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || SERVER_PORT;
  const serveStatic = Boolean(process.env.PORT) || process.env.SERVE_STATIC === '1';
  startServer(port, { serveStatic });
}
