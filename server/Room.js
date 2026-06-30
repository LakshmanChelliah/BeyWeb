import { CONFIG } from '../js/config.js';
import { getBeyById, isBeyPlayable } from '../js/game/beys.js';
import {
  createMatchEnvironment,
  serverTick,
  respawnRound,
} from '../js/game/matchFactory.js';
import { serializeState } from '../js/net/snapshot.js';
import { MSG, WINS_NEEDED, FIXED_DT } from '../js/net/protocol.js';
import { hashSeed } from '../js/utils/seededRng.js';

const FORFEIT_MS = 15000;
const COUNTDOWN_SEC = 3;

export class Room {
  constructor(id, broadcastFn) {
    this.id = id;
    this.broadcastAll = broadcastFn;
    this.slots = [null, null];
    this.state = 'waiting';
    this.locks = [{ beyId: null, locked: false }, { beyId: null, locked: false }];
    this.scores = [0, 0];
    this.round = 1;
    this.match = null;
    this.tick = 0;
    this.matchSeed = null;
    this.pendingInputs = [
      { steer: { x: 0, y: 0 }, ability: null },
      { steer: { x: 0, y: 0 }, ability: null },
    ];
    this.lastInputAt = [Date.now(), Date.now()];
    this.loopHandle = null;
    this.loopAccumulator = 0;
    this.loopLastAt = 0;
    this.countdownTimer = null;
    this.countdownSeconds = 0;
    /** @type {Set<number>} */
    this.readySlots = new Set();
  }

  addPlayer(ws, slot) {
    this.slots[slot] = ws;
    ws.room = this;
    ws.slot = slot;
    this.lastInputAt[slot] = Date.now();
  }

  removePlayer(ws) {
    const slot = ws.slot;
    if (slot == null) return;
    this.slots[slot] = null;
    this.readySlots.delete(slot);
    this.stopTimers();
    this.match = null;
    this.broadcastAll({
      type: MSG.PEER_LEFT,
      slot,
      roomId: this.id,
    });
    if (!this.slots[0] && !this.slots[1]) {
      this.state = 'waiting';
      this.locks = [{ beyId: null, locked: false }, { beyId: null, locked: false }];
    } else {
      this.state = 'waiting';
    }
  }

  send(ws, msg) {
    if (ws?.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  pickStatusPayload() {
    return {
      type: MSG.PICK_STATUS,
      slots: this.locks.map((l) => (l.locked ? 'locked' : 'choosing')),
    };
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case MSG.LOCK_BEY:
        this.lockBey(ws.slot, msg.beyId);
        break;
      case MSG.UNLOCK_BEY:
        this.unlockBey(ws.slot);
        break;
      case MSG.INPUT: {
        if (this.state !== 'playing') break;
        const pending = this.pendingInputs[ws.slot];
        pending.steer = {
          x: Number(msg.steer?.x) || 0,
          y: Number(msg.steer?.y) || 0,
        };
        if (msg.ability != null) {
          pending.ability = msg.ability;
        }
        pending.tick = msg.tick ?? pending.tick ?? 0;
        this.lastInputAt[ws.slot] = Date.now();
        break;
      }
      case MSG.NEXT_ROUND_READY:
      case 'ready':
        this.markReady(msg.slot ?? ws.slot);
        break;
      case MSG.PING:
        this.send(ws, { type: MSG.PONG, t: msg.t, serverTick: this.tick });
        break;
      case MSG.DEBUG_ROUND_END:
        if (process.env.ENABLE_E2E !== '1') break;
        if (!this.match) {
          if (!(this.locks[0].locked && this.locks[1].locked)) break;
          if (!this.matchSeed) {
            this.matchSeed = hashSeed(this.id, this.locks[0].beyId, this.locks[1].beyId);
          }
          this.startPlaying();
        }
        if (!this.match) break;
        if (this.state === 'awaiting_ready' || this.state === 'awaiting_rematch' || this.state === 'series_end') break;
        this.stopTimers();
        this.state = 'playing';
        if (this.match.state) this.match.state.gameRunning = true;
        this.handleRoundEnd({ outcome: 'KO', winner: 1 });
        break;
      case MSG.DEBUG_ROOM_STATE:
        if (process.env.ENABLE_E2E !== '1') break;
        this.send(ws, {
          type: 'debug_room_state',
          state: this.state,
          readyCount: this.readySlots.size,
          gameRunning: this.match?.state?.gameRunning ?? false,
          slot: msg.slot ?? ws.slot,
        });
        break;
      default:
        break;
    }
  }

  lockBey(slot, beyId) {
    if (this.state !== 'picking' && this.state !== 'waiting') return;
    const bey = getBeyById(beyId);
    if (!isBeyPlayable(bey)) return;
    this.locks[slot] = { beyId, locked: true };
    this.broadcastAll(this.pickStatusPayload());
    if (this.locks[0].locked && this.locks[1].locked) {
      this.beginRevealAndCountdown();
    }
  }

  unlockBey(slot) {
    if (this.state !== 'picking') return;
    if (this.locks[0].locked && this.locks[1].locked) return;
    this.locks[slot] = { beyId: null, locked: false };
    this.broadcastAll(this.pickStatusPayload());
  }

  beginRevealAndCountdown() {
    this.state = 'countdown';
    this.matchSeed = hashSeed(this.id, this.locks[0].beyId, this.locks[1].beyId);
    this.broadcastAll({
      type: MSG.MATCH_CONFIG,
      beyIds: [this.locks[0].beyId, this.locks[1].beyId],
      scores: [...this.scores],
      round: this.round,
      winsNeeded: WINS_NEEDED,
      seed: this.matchSeed,
    });

    this.runCountdown(() => this.startPlaying());
  }

  readyStatusPayload() {
    const slots = [this.readySlots.has(0), this.readySlots.has(1)];
    return {
      type: MSG.READY_STATUS,
      readyCount: this.readySlots.size,
      total: 2,
      slots,
      bothReady: slots[0] && slots[1],
    };
  }

  broadcastReadyStatus() {
    this.broadcastAll(this.readyStatusPayload());
  }

  bothPlayersConnected() {
    return Boolean(this.slots[0] && this.slots[1]);
  }

  markReady(slot) {
    if (slot !== 0 && slot !== 1) return;
    if (!this.bothPlayersConnected()) return;

    if (
      this.state === 'playing' &&
      this.match?.state &&
      !this.match.state.gameRunning
    ) {
      this.state = 'awaiting_ready';
      this.readySlots.clear();
    }

    if (this.state === 'countdown') {
      this.send(this.slots[slot], {
        type: MSG.COUNTDOWN,
        seconds: this.countdownSeconds ?? COUNTDOWN_SEC,
      });
      return;
    }

    if (this.state === 'playing' && this.match?.state?.gameRunning) {
      const snap = serializeState(this.match.state, this.tick, []);
      this.send(this.slots[slot], { type: MSG.SNAPSHOT, ...snap });
      return;
    }

    if (this.state === 'awaiting_rematch') {
      if (this.readySlots.has(slot)) return;
      this.readySlots.add(slot);
      this.broadcastReadyStatus();
      if (this.readySlots.size === 2 && this.readySlots.has(0) && this.readySlots.has(1)) {
        this.beginRematchPicking();
      }
      return;
    }

    if (this.state !== 'awaiting_ready') return;
    if (this.readySlots.has(slot)) return;

    this.readySlots.add(slot);
    this.broadcastReadyStatus();

    if (this.readySlots.size === 2 && this.readySlots.has(0) && this.readySlots.has(1)) {
      this.beginNextRound();
    }
  }

  beginRematchPicking() {
    if (!this.bothPlayersConnected()) return;
    if (this.state !== 'awaiting_rematch') return;
    if (!(this.readySlots.has(0) && this.readySlots.has(1))) return;

    this.stopTimers();
    this.scores = [0, 0];
    this.round = 1;
    this.match = null;
    this.matchSeed = null;
    this.locks = [{ beyId: null, locked: false }, { beyId: null, locked: false }];
    this.readySlots.clear();
    this.tick = 0;
    this.state = 'picking';
    this.broadcastAll(this.pickStatusPayload());
  }

  runCountdown(onGo) {
    this.stopCountdown();
    let sec = COUNTDOWN_SEC;
    this.countdownSeconds = sec;
    this.broadcastAll({ type: MSG.COUNTDOWN, seconds: sec });
    this.countdownTimer = setInterval(() => {
      sec -= 1;
      if (sec > 0) {
        this.countdownSeconds = sec;
        this.broadcastAll({ type: MSG.COUNTDOWN, seconds: sec });
      } else {
        this.stopCountdown();
        this.countdownSeconds = 0;
        this.broadcastAll({ type: MSG.COUNTDOWN, seconds: 0 });
        onGo?.();
      }
    }, 1000);
  }

  beginNextRound() {
    if (!this.match) return;
    if (this.state !== 'awaiting_ready') return;
    if (!(this.readySlots.has(0) && this.readySlots.has(1))) return;
    if (!this.bothPlayersConnected()) return;

    this.stopTimers();
    this.readySlots.clear();
    this.state = 'countdown';
    this.tick = 0;

    this.runCountdown(() => {
      respawnRound(this.match);
      this.tick = 0;
      this.state = 'playing';
      if (this.match?.state) this.match.state.gameRunning = true;
      this.startGameLoop();
    });
  }

  startPlaying() {
    const playerBey = getBeyById(this.locks[0].beyId);
    const aiBey = getBeyById(this.locks[1].beyId);
    this.match = createMatchEnvironment({
      playerBey,
      aiBey,
      seed: this.matchSeed,
    });
    this.tick = 0;
    this.state = 'playing';
    if (this.match?.state) this.match.state.gameRunning = true;
    this.startGameLoop();
  }

  startGameLoop() {
    this.stopGameLoop();
    const stepMs = FIXED_DT * 1000;
    this.loopLastAt = Date.now();
    this.loopAccumulator = 0;

    const run = () => {
      if (!this.loopHandle) return;

      const now = Date.now();
      let elapsed = now - this.loopLastAt;
      this.loopLastAt = now;
      if (elapsed > 250) elapsed = 250;

      this.loopAccumulator += elapsed;
      let steps = 0;
      while (this.loopAccumulator >= stepMs && steps < 5) {
        this.tickMatch();
        this.loopAccumulator -= stepMs;
        steps += 1;
      }

      const drift = Date.now() - now;
      this.loopHandle = setTimeout(run, Math.max(1, stepMs - drift));
    };

    this.loopHandle = setTimeout(run, stepMs);
  }

  stopGameLoop() {
    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }
    this.loopAccumulator = 0;
  }

  stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  stopTimers() {
    this.stopGameLoop();
    this.stopCountdown();
    if (this.match?.state) {
      this.match.state.gameRunning = false;
    }
  }

  enterAwaitingReady() {
    this.stopTimers();
    this.readySlots.clear();
    this.state = 'awaiting_ready';
    if (this.match?.state) {
      this.match.state.gameRunning = false;
      this.match.state.gameFrozen = true;
    }
    this.broadcastReadyStatus();
  }

  tickMatch() {
    if (!this.match || this.state !== 'playing') return;

    for (let s = 0; s < 2; s++) {
      if (this.slots[s] && Date.now() - this.lastInputAt[s] > FORFEIT_MS) {
        this.forfeit(1 - s);
        return;
      }
    }

    const slotInputs = [
      { ...this.pendingInputs[0] },
      { ...this.pendingInputs[1] },
    ];
    this.pendingInputs[0].ability = null;
    this.pendingInputs[1].ability = null;

    const { events, winResult } = serverTick({
      match: this.match,
      slotInputs,
      dt: CONFIG.FIXED_DT,
    });

    this.tick += 1;
    const snap = serializeState(this.match.state, this.tick, events);
    this.broadcastAll({ type: MSG.SNAPSHOT, ...snap });

    if (winResult) {
      this.handleRoundEnd(winResult);
    }
  }

  handleRoundEnd(result) {
    const isDraw = result.outcome === 'DRAW';
    if (!isDraw) {
      const winnerSlot = result.winner === 1 ? 0 : 1;
      this.scores[winnerSlot] += 1;
    }

    const seriesWinner =
      this.scores[0] >= WINS_NEEDED ? 0 :
      this.scores[1] >= WINS_NEEDED ? 1 : null;

    this.stopTimers();

    this.broadcastAll({
      type: MSG.ROUND_END,
      outcome: result.outcome,
      winner: result.winner,
      scores: [...this.scores],
      round: this.round,
      isDraw,
      seriesOver: seriesWinner != null,
    });

    if (seriesWinner != null) {
      this.stopTimers();
      this.state = 'awaiting_rematch';
      this.readySlots.clear();
      this.broadcastAll({
        type: MSG.SERIES_END,
        winner: seriesWinner,
        scores: [...this.scores],
      });
      this.broadcastReadyStatus();
      return;
    }

    this.round += 1;
    this.enterAwaitingReady();
  }

  forfeit(winnerSlot) {
    this.stopTimers();
    this.broadcastAll({
      type: MSG.FORFEIT,
      winner: winnerSlot,
      scores: [...this.scores],
    });
    this.scores[winnerSlot] = Math.max(this.scores[winnerSlot], WINS_NEEDED);
    this.state = 'awaiting_rematch';
    this.readySlots.clear();
    this.broadcastAll({
      type: MSG.SERIES_END,
      winner: winnerSlot,
      scores: [...this.scores],
      forfeit: true,
    });
    this.broadcastReadyStatus();
  }
}
