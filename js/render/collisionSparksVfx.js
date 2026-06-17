import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp01 } from '../utils/math.js';

const POOL_SIZE = 128;
const WHITE_HOT = 0xffffff;
const ORANGE = 0xffdd55;
const SPARK_Y = CONFIG.FLOOR_Y + 0.35;

const _color = new THREE.Color();
const _colorB = new THREE.Color();

function makeSparkMat() {
  return new THREE.MeshBasicMaterial({
    color: WHITE_HOT,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function lerpSparkColor(tint, out) {
  _color.setHex(WHITE_HOT);
  _colorB.setHex(tint);
  out.copy(_color).lerp(_colorB, 0.08 + Math.random() * 0.22);
  return out;
}

function normalize2D(nx, nz) {
  const len = Math.hypot(nx, nz) || 1;
  return { nx: nx / len, nz: nz / len, tx: -nz / len, tz: nx / len };
}

/** Intensity 1.0 = baseline burst; scales up for harder hits and specials. */
export function computeSparkBurst(speed, special, sustained = false) {
  const baseline = CONFIG.COLLISION_SPARK_BASELINE_SPEED;
  const hardSpan = Math.max(1, CONFIG.WALL_IMPACT_HARD - baseline);
  const eff = Math.max(speed, baseline * 0.25);
  const extraT = clamp01((eff - baseline) / hardSpan);
  let intensity = 1 + extraT;
  if (special) intensity *= CONFIG.COLLISION_SPARK_SPECIAL_SCALE;

  const span = CONFIG.COLLISION_SPARK_COUNT_MAX - CONFIG.COLLISION_SPARK_COUNT_MIN;
  let count = Math.round(
    CONFIG.COLLISION_SPARK_COUNT_MIN +
      extraT * span * (special ? CONFIG.COLLISION_SPARK_SPECIAL_SCALE : 1) +
      (special ? CONFIG.COLLISION_SPARK_SPECIAL_COUNT_BONUS : 0)
  );
  if (sustained) {
    count = Math.max(5, Math.round(count * CONFIG.COLLISION_SPARK_SUSTAIN_SCALE));
  }

  const motionT = clamp01(intensity / CONFIG.COLLISION_SPARK_SPECIAL_SCALE);
  return {
    count: Math.min(POOL_SIZE, count),
    motionT,
    life: CONFIG.COLLISION_SPARK_LIFE * (sustained ? 0.75 : 0.85 + motionT * 0.5),
    speed: (3 + motionT * 8.5) * (sustained ? 0.85 : 1),
    size: (special ? 1.35 : 1) * (0.95 + motionT * 0.55) * (sustained ? 0.9 : 1),
    spread: special ? 1.8 : 1.4,
    lift: special ? 1.25 : 1,
    jitter: sustained ? 0.22 : special ? 0.28 : 0.18,
  };
}

function initParticle(p, burst, i, x, z, dir, tint) {
  const side = i % 2 === 0 ? 1 : -1;
  const spread = (Math.random() - 0.5) * burst.spread;
  const outX = dir.nx + dir.tx * spread * side;
  const outZ = dir.nz + dir.tz * spread * side;
  const outLen = Math.hypot(outX, outZ) || 1;
  const spd = burst.speed * (0.6 + Math.random() * 0.7) * burst.lift;

  p.active = true;
  p.life = burst.life;
  p.maxLife = burst.life;
  p.vx = (outX / outLen) * spd;
  p.vz = (outZ / outLen) * spd;
  p.vy = (0.9 + Math.random() * 2.4 * burst.motionT) * burst.lift;

  const jitter = (Math.random() - 0.5) * burst.jitter;
  p.mesh.position.set(x + jitter, SPARK_Y, z + jitter);
  p.mesh.scale.setScalar(burst.size + Math.random() * 0.35);
  p.mesh.material.color.copy(lerpSparkColor(tint, _color));
  p.mesh.material.opacity = 1.05 + burst.motionT * 0.4;
  p.mesh.visible = true;
}

/** Pooled billboard sparks for bey clashes and rim wall impacts. */
export function createCollisionSparksVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), makeSparkMat());
    mesh.visible = false;
    mesh.renderOrder = 10;
    root.add(mesh);
    pool.push({ mesh, active: false, life: 0, maxLife: 0, vx: 0, vz: 0, vy: 0 });
  }

  function acquire() {
    for (const p of pool) {
      if (!p.active) return p;
    }
    return null;
  }

  function reset() {
    for (const p of pool) {
      p.active = false;
      p.life = 0;
      p.mesh.visible = false;
      p.mesh.material.opacity = 0;
    }
  }

  function spawn({
    x,
    z,
    nx,
    nz,
    speed,
    colorA = WHITE_HOT,
    colorB = ORANGE,
    kind = 'clash',
    special = false,
    sustained = false,
    countMult = 1,
  }) {
    const burst = computeSparkBurst(speed, special, sustained);
    burst.count = Math.max(3, Math.round(burst.count * countMult));
    const dir = normalize2D(nx, nz);

    for (let i = 0; i < burst.count; i++) {
      const p = acquire();
      if (!p) break;
      const tint = kind === 'wall' ? colorA : i % 2 === 0 ? colorA : colorB;
      initParticle(p, burst, i, x, z, dir, tint);
    }
  }

  function update(camera, dt) {
    if (!camera) return;
    for (const p of pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        p.mesh.material.opacity = 0;
        continue;
      }

      const t = p.life / p.maxLife;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 6 * dt;
      p.vx *= 1 - 2.5 * dt;
      p.vz *= 1 - 2.5 * dt;
      p.mesh.quaternion.copy(camera.quaternion);
      p.mesh.material.opacity = t * t * 1.25;
      p.mesh.scale.multiplyScalar(1 - 0.4 * dt);
    }
  }

  return { spawn, update, reset };
}
