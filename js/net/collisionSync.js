import { CONFIG } from '../config.js';
import { rimSparkContact } from '../physics/collisionSparks.js';

function outerR(body) {
  return body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
}

export function computeContactFrame(bodyA, bodyB) {
  const dx = bodyA.position.x - bodyB.position.x;
  const dz = bodyA.position.z - bodyB.position.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  return { nx: dx / dist, nz: dz / dist, dist };
}

/** Pull interpolated beys together so rims meet when the server reports contact. */
export function snapVisualContact(state) {
  const bodyA = state.playerBody;
  const bodyB = state.aiBody;
  if (!bodyA || !bodyB) return false;

  const { nx, nz, dist } = computeContactFrame(bodyA, bodyB);
  const minDist = outerR(bodyA) + outerR(bodyB);
  const gap = dist - minDist;
  if (gap <= 0.015) return false;

  const pull = gap * 0.5;
  bodyA.position.x -= nx * pull;
  bodyA.position.z -= nz * pull;
  bodyB.position.x += nx * pull;
  bodyB.position.z += nz * pull;
  return true;
}

/** Place spark bursts on the client-rendered contact point, not the server pose. */
export function reprojectSparkEvent(ev, state) {
  const bodyA = state.playerBody;
  const bodyB = state.aiBody;
  if (!bodyA || !bodyB) return ev;

  const kind = ev.kind ?? (ev.colorB != null ? 'clash' : 'wall');

  if (kind === 'wall') {
    const da = Math.hypot(ev.x - bodyA.position.x, ev.z - bodyA.position.z);
    const db = Math.hypot(ev.x - bodyB.position.x, ev.z - bodyB.position.z);
    const body = da <= db ? bodyA : bodyB;
    const contact = rimSparkContact(body);
    return { ...ev, kind, x: contact.x, z: contact.z, nx: contact.nx, nz: contact.nz };
  }

  const { nx, nz } = computeContactFrame(bodyA, bodyB);
  const rA = outerR(bodyA) * 0.92;
  const rB = outerR(bodyB) * 0.92;
  const alignsA = ev.nx * nx + ev.nz * nz > 0;

  if (alignsA) {
    return {
      ...ev,
      kind,
      x: bodyA.position.x - nx * rA,
      z: bodyA.position.z - nz * rA,
      nx,
      nz,
    };
  }

  return {
    ...ev,
    kind,
    x: bodyB.position.x + nx * rB,
    z: bodyB.position.z + nz * rB,
    nx: -nx,
    nz: -nz,
  };
}

export function createOnlineCollisionSync() {
  let lastClashSnapAt = 0;

  return {
    prepareSparkEvent(ev, state) {
      const kind = ev.kind ?? (ev.colorB != null ? 'clash' : 'wall');
      if (kind === 'clash' && !ev.sustained) {
        const now = performance.now?.() ?? Date.now();
        if (now - lastClashSnapAt >= CONFIG.IMPACT_COOLDOWN * 1000) {
          if (snapVisualContact(state)) {
            lastClashSnapAt = now;
          }
        }
      }
      return reprojectSparkEvent({ ...ev, kind }, state);
    },
    reset() {
      lastClashSnapAt = 0;
    },
  };
}
