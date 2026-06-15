import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { LEONE_WALL_DURATION } from '../game/abilities.js';

function makeMat(color, opacity, { additive = false } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

// Anchor — still a subtle green dig-in cue (power move only).
const ANCHOR_GREEN = 0x4ade80;

// Tornado palette — stadium dust, concrete grit, wind haze (not neon green).
const DUST_LIGHT = 0xe2ddd4;
const DUST_MID = 0xb5aea4;
const DUST_DARK = 0x7a7268;
const DEBRIS_TAN = 0x9a8b78;
const DEBRIS_DARK = 0x5c5348;
const MIST_WHITE = 0xf0eeea;
const HAZE_GREY = 0xc8c4bc;

const TORNADO_HEIGHT = 7.2;
const TORNADO_BASE_R = 1.1;
const TORNADO_TOP_R = 2.9;
const WALL_ACTIVE_DUR = LEONE_WALL_DURATION;

const DUST_SPECK_COUNT = 140;
const MIST_WISP_COUNT = 55;
const DEBRIS_CHUNK_COUNT = 48;
const WIND_STREAK_COUNT = 36;

const DUST_COLORS = [DUST_LIGHT, DUST_MID, DUST_DARK, DEBRIS_TAN, DEBRIS_DARK];
const MIST_COLORS = [MIST_WHITE, HAZE_GREY, DUST_LIGHT];

function rand(seed) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Pre-bake random particle traits so motion feels organic but stable per index. */
function buildParticleTraits(count, kind) {
  const traits = [];
  for (let i = 0; i < count; i++) {
    const s = i + kind.charCodeAt(0) * 17;
    traits.push({
      heightBias: rand(s + 1),
      orbitPhase: rand(s + 2) * Math.PI * 2,
      orbitSpeed: 0.7 + rand(s + 3) * 1.4,
      radiusJitter: 0.82 + rand(s + 4) * 0.36,
      riseSpeed: 0.35 + rand(s + 5) * 0.9,
      size: kind === 'dust'
        ? 0.022 + rand(s + 6) * 0.05
        : kind === 'mist'
          ? 0.08 + rand(s + 6) * 0.16
          : kind === 'debris'
            ? 0.035 + rand(s + 6) * 0.08
            : 0.015 + rand(s + 6) * 0.03,
      tumble: rand(s + 7) * Math.PI * 2,
      tumbleRate: (rand(s + 8) - 0.5) * 4,
      colorIdx: Math.floor(rand(s + 9) * (
        kind === 'mist' ? MIST_COLORS.length : DUST_COLORS.length
      )),
      layer: rand(s + 10),
    });
  }
  return traits;
}

/**
 * Per-bey Three.js VFX for Rock Leone's two abilities.
 */
export function createLeoneAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  // --- Anchor (unchanged green dig-in) ----------------------------------------
  const anchorRing = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.1, 40),
    makeMat(ANCHOR_GREEN, 0, { additive: true })
  );
  anchorRing.rotation.x = -Math.PI / 2;
  anchorRing.renderOrder = 3;
  root.add(anchorRing);

  const shockRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.05, 40),
    makeMat(ANCHOR_GREEN, 0, { additive: true })
  );
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.renderOrder = 2;
  root.add(shockRing);

  const wisps = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.55),
      makeMat(ANCHOR_GREEN, 0, { additive: true })
    );
    m.renderOrder = 4;
    root.add(m);
    wisps.push({ mesh: m, phase: (i / 4) * Math.PI * 2, speed: 0.9 + i * 0.15 });
  }

  let anchorShockT = 0;

  // --- Tornado particle systems -------------------------------------------------
  const tornadoGroup = new THREE.Group();
  root.add(tornadoGroup);

  function spawnPool(count, kind, geometryFactory) {
    const traits = buildParticleTraits(count, kind);
    const pool = [];
    for (let i = 0; i < count; i++) {
      const colors = kind === 'mist' ? MIST_COLORS : DUST_COLORS;
      const mat = makeMat(
        colors[traits[i].colorIdx],
        0,
        { additive: kind === 'mist' }
      );
      const mesh = new THREE.Mesh(geometryFactory(traits[i]), mat);
      mesh.renderOrder = kind === 'mist' ? 6 : kind === 'debris' ? 4 : 5;
      tornadoGroup.add(mesh);
      pool.push({ mesh, traits: traits[i], kind });
    }
    return pool;
  }

  const dustPool = spawnPool(DUST_SPECK_COUNT, 'dust', (t) =>
    new THREE.PlaneGeometry(t.size, t.size * (0.8 + t.layer * 0.4))
  );
  const mistPool = spawnPool(MIST_WISP_COUNT, 'mist', (t) =>
    new THREE.PlaneGeometry(t.size * 0.6, t.size * 1.6)
  );
  const debrisPool = spawnPool(DEBRIS_CHUNK_COUNT, 'debris', (t) =>
    new THREE.PlaneGeometry(t.size, t.size * (0.6 + rand(t.layer) * 0.8))
  );
  const streakPool = spawnPool(WIND_STREAK_COUNT, 'streak', (t) =>
    new THREE.PlaneGeometry(t.size, t.size * 4.5 + t.layer * 1.2)
  );

  const allParticles = [...dustPool, ...mistPool, ...debrisPool, ...streakPool];

  let wallOrbitAngle = 0;
  let wallT = 0;

  function hideTornado() {
    for (const p of allParticles) p.mesh.material.opacity = 0;
  }

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function tornadoRadiusAt(t, R, reachScale) {
    const base = R * TORNADO_BASE_R * reachScale;
    const top = R * TORNADO_TOP_R * reachScale;
    // Slight inward pinch mid-column like a real mesocyclone.
    const pinch = 1 - Math.sin(t * Math.PI) * 0.08;
    return (base + (top - base) * t) * pinch;
  }

  function particleHeight(trait, spin, env) {
    const cycle = (trait.orbitPhase + spin * trait.orbitSpeed * 0.15) % 1;
    const h = (trait.heightBias * 0.35 + cycle * trait.riseSpeed) % 1;
    return h * TORNADO_HEIGHT * env;
  }

  function placeHelicalParticle(p, spin, R, reachScale, env, camera) {
    const { mesh, traits: tr, kind } = p;
    const h = particleHeight(tr, spin, 1);
    const t = clamp01(h / TORNADO_HEIGHT);
    const r = tornadoRadiusAt(t, R, reachScale) * tr.radiusJitter;

    const helix = spin * (1.4 + t * 1.8) + tr.orbitPhase + t * Math.PI * 4;
    const turb = Math.sin(spin * 3.1 + tr.layer * 9) * r * 0.11
      + Math.cos(spin * 2.3 + tr.tumble) * r * 0.07;
    const x = Math.cos(helix) * (r + turb);
    const z = Math.sin(helix) * (r + turb);

    mesh.position.set(x, h, z);

    if (kind === 'streak') {
      mesh.rotation.set(0, helix + Math.PI / 2, 0.15);
    } else {
      billboard(mesh, camera);
      mesh.rotation.z = tr.tumble + spin * tr.tumbleRate * 0.12;
    }

    const baseFade = kind === 'mist'
      ? 0.08 + 0.22 * (1 - Math.abs(t - 0.72))
      : kind === 'debris'
        ? 0.35 * (1 - t * 0.75)
        : kind === 'streak'
          ? 0.12 + 0.18 * (1 - Math.abs(t - 0.45))
          : 0.2 + 0.35 * (1 - Math.abs(t - 0.35));

    const flicker = 0.75 + 0.25 * Math.sin(spin * 4 + tr.orbitPhase);
    mesh.material.opacity = baseFade * flicker * env;
    mesh.scale.setScalar(kind === 'mist' ? 1 + t * 0.4 : 1);
  }

  function reset() {
    root.visible = false;
    anchorRing.material.opacity = 0;
    shockRing.material.opacity = 0;
    for (const w of wisps) w.mesh.material.opacity = 0;
    hideTornado();
    anchorShockT = 0;
    wallOrbitAngle = 0;
    wallT = 0;
  }

  reset();

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const anchoring = !!body.userData.anchoring;
      const lionWall = !!body.userData.lionWall;
      const lionWindup = !!body.userData.lionWallWindup;

      if (!anchoring && !lionWall && !lionWindup) {
        reset();
        return;
      }

      root.visible = true;

      const bx = body.position.x;
      const bz = body.position.z;
      const floorY = CONFIG.FLOOR_Y + 0.02;
      const R = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const reach = body.userData.lionWallReach ?? R * 4.35;
      const reachScale = reach / (R * 4.35);

      if (anchoring) {
        wallT = 0;
        wallOrbitAngle = 0;
        hideTornado();
        anchorShockT += dt;

        anchorRing.position.set(bx, floorY, bz);
        shockRing.position.set(bx, floorY, bz);

        if (anchorShockT < 0.35) {
          const t = anchorShockT / 0.35;
          const e = 1 - (1 - t) * (1 - t);
          anchorRing.scale.setScalar(R * (1 + e * 1.8));
          anchorRing.material.opacity = 0.55 * (1 - t);
          shockRing.scale.setScalar(R * (1 + e * 2.8));
          shockRing.material.opacity = 0.35 * (1 - t * t);
        } else {
          const pulse = 0.5 + 0.5 * Math.sin(anchorShockT * 6);
          anchorRing.scale.setScalar(R * 1.35);
          anchorRing.material.opacity = 0.18 + 0.12 * pulse;
          shockRing.material.opacity = 0;
        }

        for (const w of wisps) {
          w.phase += dt * w.speed * 1.4;
          const angle = w.phase;
          const orbitR = R * 1.1;
          const riseAmt = (w.phase * 0.18) % 1.6;
          w.mesh.position.set(
            bx + Math.cos(angle) * orbitR,
            floorY + riseAmt,
            bz + Math.sin(angle) * orbitR
          );
          billboard(w.mesh, camera);
          const fadeOut = 1 - riseAmt / 1.6;
          const fadeIn = clamp01(anchorShockT / 0.4);
          w.mesh.material.opacity = 0.28 * fadeIn * fadeOut;
        }
      }

      if (lionWall || lionWindup) {
        anchorShockT = 0;
        anchorRing.material.opacity = 0;
        shockRing.material.opacity = 0;
        for (const w of wisps) w.mesh.material.opacity = 0;

        wallT += dt;
        tornadoGroup.position.set(bx, floorY, bz);

        if (lionWindup) {
          const growT = clamp01(wallT / 0.45);
          const e = easeOut(growT);

          // Early windup: debris and dust kick up from the floor (no range rings).
          const preSpin = wallT * 2.5;
          for (const p of allParticles) {
            if (p.kind !== 'debris' && p.kind !== 'dust') {
              p.mesh.material.opacity = 0;
              continue;
            }
            const tr = p.traits;
            const ang = tr.orbitPhase + preSpin;
            const r = R * (0.35 + e * 0.9) * tr.radiusJitter;
            p.mesh.position.set(Math.cos(ang) * r, 0.08 + e * 0.5, Math.sin(ang) * r);
            billboard(p.mesh, camera);
            p.mesh.material.opacity = 0.22 * e * (p.kind === 'debris' ? 1 : 0.55);
          }
        } else {
          wallOrbitAngle += dt * 6.2;
          const fadeIn = clamp01(wallT / 0.22);
          const fadeOut = clamp01((WALL_ACTIVE_DUR - wallT) / 0.32);
          const env = fadeIn * fadeOut;
          const spin = wallOrbitAngle;

          for (const p of allParticles) {
            placeHelicalParticle(p, spin, R, reachScale, env, camera);
          }
        }
      }
    },
    reset,
  };
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
