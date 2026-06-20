import * as CANNON from 'cannon-es';
import { CONFIG } from '../config.js';
import { isLibraBusterChannelingBody } from '../game/abilities.js';
import { createCollisionSparkEmitter } from './collisionSparks.js';
import { createClashResolver } from './clash.js';
import { createWallHandlers } from './wall.js';

function applySpinDelta(state, side, delta, body) {
  if (!delta) return;
  const top = body ?? (side === 'player' ? state.playerBody : state.aiBody);
  if (delta < 0 && top?.userData?.invulnerable) return;
  if (delta < 0 && isLibraBusterChannelingBody(state, top)) {
    delta *= 0.1;
    if (!delta) return;
  }
  const key = side === 'player' ? 'playerSpin' : 'aiSpin';
  state[key] = Math.max(0, Math.min(1, state[key] + delta));
}

/**
 * Wires bey-vs-bey clash resolution and rim wall handling for one match.
 * Spark emission is delegated to collisionSparks.js via createCollisionSparkEmitter.
 */
export function setupContactHandlers(world, getState, spawnImpact) {
  const sparks = createCollisionSparkEmitter(getState, spawnImpact);
  const clash = createClashResolver(getState, sparks, applySpinDelta);
  const wall = createWallHandlers(world, getState, sparks, applySpinDelta);

  return {
    resolve: clash.resolve,
    resolveWallContacts: wall.resolveWallContacts,
    resolveWallClipSpin: wall.resolveWallClipSpin,
    emitWallImpact: wall.emitWallImpact,
  };
}

export { createCollisionSparkEmitter } from './collisionSparks.js';
