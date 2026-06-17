import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { LEONE_WALL_DURATION, LEONE_WALL_REACH_MULT } from '../game/abilities.js';

function makeMat(color, opacity, { additive = false, doubleSide = false } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    // Billboarded quads face the camera — FrontSide halves fragment cost vs DoubleSide.
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/** Reuse materials by color/blend mode to cut draw-call batch breaks. */
function createMatCache() {
  const cache = new Map();
  return (color, additive = false, doubleSide = false) => {
    const key = `${color}|${additive ? 1 : 0}|${doubleSide ? 1 : 0}`;
    if (!cache.has(key)) cache.set(key, makeMat(color, 0, { additive, doubleSide }));
    return cache.get(key);
  };
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

// Tuned down from 279 total — each particle was a separate draw call.
const DUST_SPECK_COUNT = 72;
const MIST_WISP_COUNT = 28;
const DEBRIS_CHUNK_COUNT = 24;
const WIND_STREAK_COUNT = 20;

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
      sizeTier: Math.floor(rand(s + 6) * 3),
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

const DUST_GEOS = [
  new THREE.PlaneGeometry(0.03, 0.028),
  new THREE.PlaneGeometry(0.045, 0.04),
  new THREE.PlaneGeometry(0.06, 0.052),
];
const MIST_GEOS = [
  new THREE.PlaneGeometry(0.05, 0.12),
  new THREE.PlaneGeometry(0.08, 0.2),
  new THREE.PlaneGeometry(0.11, 0.28),
];
const DEBRIS_GEOS = [
  new THREE.PlaneGeometry(0.04, 0.03),
  new THREE.PlaneGeometry(0.06, 0.045),
  new THREE.PlaneGeometry(0.08, 0.06),
];
const STREAK_GEOS = [
  new THREE.PlaneGeometry(0.02, 0.1),
  new THREE.PlaneGeometry(0.028, 0.14),
  new THREE.PlaneGeometry(0.035, 0.18),
];

/**
 * Per-bey Three.js VFX for Rock Leone's two abilities.
 */
export function createLeoneAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const getMat = createMatCache();

  // --- Anchor (unchanged green dig-in) ----------------------------------------
  const anchorRing = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 1.1, 24),
    getMat(ANCHOR_GREEN, true)
  );
  anchorRing.rotation.x = -Math.PI / 2;
  anchorRing.renderOrder = 3;
  root.add(anchorRing);

  const shockRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.05, 24),
    getMat(ANCHOR_GREEN, true)
  );
  shockRing.rotation.x = -Math.PI / 2;
  shockRing.renderOrder = 2;
  root.add(shockRing);

  const wisps = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.55),
      getMat(ANCHOR_GREEN, true)
    );
    m.renderOrder = 4;
    root.add(m);
    wisps.push({ mesh: m, phase: (i / 4) * Math.PI * 2, speed: 0.9 + i * 0.15 });
  }

  let anchorShockT = 0;

  // --- Tornado particle systems -------------------------------------------------
  const tornadoGroup = new THREE.Group();
  root.add(tornadoGroup);

  const GEO_BY_KIND = {
    dust: DUST_GEOS,
    mist: MIST_GEOS,
    debris: DEBRIS_GEOS,
    streak: STREAK_GEOS,
  };

  function spawnPool(count, kind) {
    const traits = buildParticleTraits(count, kind);
    const pool = [];
    const colors = kind === 'mist' ? MIST_COLORS : DUST_COLORS;
    const geos = GEO_BY_KIND[kind];
    for (let i = 0; i < count; i++) {
      const tr = traits[i];
      const mat = getMat(colors[tr.colorIdx], kind === 'mist').clone();
      const mesh = new THREE.Mesh(geos[tr.sizeTier], mat);
      mesh.renderOrder = kind === 'mist' ? 6 : kind === 'debris' ? 4 : 5;
      mesh.visible = false;
      tornadoGroup.add(mesh);
      pool.push({ mesh, traits: tr, kind });
    }
    return pool;
  }

  const dustPool = spawnPool(DUST_SPECK_COUNT, 'dust');
  const mistPool = spawnPool(MIST_WISP_COUNT, 'mist');
  const debrisPool = spawnPool(DEBRIS_CHUNK_COUNT, 'debris');
  const streakPool = spawnPool(WIND_STREAK_COUNT, 'streak');

  const allParticles = [...dustPool, ...mistPool, ...debrisPool, ...streakPool];

  let wallOrbitAngle = 0;
  let wallT = 0;

  function hideTornado() {
    for (const p of allParticles) {
      p.mesh.visible = false;
      p.mesh.material.opacity = 0;
    }
  }

  function setParticleVisible(mesh, opacity) {
    const show = opacity > 0.02;
    mesh.visible = show;
    mesh.material.opacity = show ? opacity : 0;
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
    setParticleVisible(mesh, baseFade * flicker * env);
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
      const reach = body.userData.lionWallReach ?? R * LEONE_WALL_REACH_MULT;
      const reachScale = reach / (R * LEONE_WALL_REACH_MULT);

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
              p.mesh.visible = false;
              p.mesh.material.opacity = 0;
              continue;
            }
            const tr = p.traits;
            const ang = tr.orbitPhase + preSpin;
            const r = R * (0.35 + e * 0.9) * tr.radiusJitter;
            p.mesh.position.set(Math.cos(ang) * r, 0.08 + e * 0.5, Math.sin(ang) * r);
            billboard(p.mesh, camera);
            setParticleVisible(p.mesh, 0.22 * e * (p.kind === 'debris' ? 1 : 0.55));
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
