import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { LIBRA_BUSTER_DURATION, LIBRA_BUSTER_RADIUS_MULT, LIBRA_SHIELD_DURATION } from '../game/abilities.js';

function makeMat(color, opacity, { additive = false } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.FrontSide,
  });
}

function createMatCache() {
  const cache = new Map();
  return (color, additive = false) => {
    const key = `${color}|${additive ? 1 : 0}`;
    if (!cache.has(key)) cache.set(key, makeMat(color, 0, { additive }));
    return cache.get(key);
  };
}

const SHIELD_GREEN = 0x4ade80;
const SHIELD_LIME = 0xa3e635;
const SHIELD_PALE = 0xd9f99d;

const SAND_LIGHT = 0xe8dcc8;
const SAND_MID = 0xc4b59a;
const SAND_DARK = 0x9a8b72;
const SAND_DUST = 0xd6cbb8;

const PIT_PARTICLE_COUNT = 48;
const SHIELD_WISP_COUNT = 8;

function rand(seed) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

/** Flame Libra Sonic Shield + Sonic Buster scene VFX. */
export function createLibraAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const getMat = createMatCache();

  const shieldGroup = new THREE.Group();
  const pitGroup = new THREE.Group();
  root.add(shieldGroup);
  root.add(pitGroup);

  const shieldAura = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 1.08, 28),
    getMat(SHIELD_GREEN, true)
  );
  shieldAura.rotation.x = -Math.PI / 2;
  shieldAura.renderOrder = 4;
  shieldGroup.add(shieldAura);

  const shieldDome = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.95, 24),
    getMat(SHIELD_LIME, true)
  );
  shieldDome.rotation.x = -Math.PI / 2;
  shieldDome.renderOrder = 5;
  shieldGroup.add(shieldDome);

  const shieldWisps = [];
  for (let i = 0; i < SHIELD_WISP_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.5),
      getMat(i % 2 === 0 ? SHIELD_PALE : SHIELD_GREEN, true)
    );
    mesh.renderOrder = 6;
    shieldGroup.add(mesh);
    shieldWisps.push({ mesh, phase: (i / SHIELD_WISP_COUNT) * Math.PI * 2, band: i % 3 });
  }

  const pitRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 1.0, 32),
    getMat(SAND_MID)
  );
  pitRing.rotation.x = -Math.PI / 2;
  pitRing.renderOrder = 2;
  pitGroup.add(pitRing);

  const pitInner = new THREE.Mesh(
    new THREE.CircleGeometry(0.54, 32),
    getMat(SAND_DARK)
  );
  pitInner.rotation.x = -Math.PI / 2;
  pitInner.renderOrder = 1;
  pitGroup.add(pitInner);

  const pitParticles = [];
  const sandColors = [SAND_LIGHT, SAND_MID, SAND_DARK, SAND_DUST];
  for (let i = 0; i < PIT_PARTICLE_COUNT; i++) {
    const s = i + 41;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.03 + rand(s) * 0.05, 0.028 + rand(s + 1) * 0.04),
      getMat(sandColors[Math.floor(rand(s + 2) * sandColors.length)])
    );
    mesh.renderOrder = 3;
    pitGroup.add(mesh);
    pitParticles.push({
      mesh,
      phase: rand(s + 3) * Math.PI * 2,
      radius: 0.2 + rand(s + 4) * 0.75,
      speed: 0.5 + rand(s + 5) * 1.1,
      rise: rand(s + 6) * 0.35,
    });
  }

  let shieldSpin = 0;
  let pitSpin = 0;
  let pitT = 0;

  function hideShield() {
    shieldAura.material.opacity = 0;
    shieldDome.material.opacity = 0;
    for (const w of shieldWisps) w.mesh.material.opacity = 0;
  }

  function hidePit() {
    pitRing.material.opacity = 0;
    pitInner.material.opacity = 0;
    for (const p of pitParticles) p.mesh.material.opacity = 0;
  }

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function reset() {
    root.visible = false;
    hideShield();
    hidePit();
    shieldSpin = 0;
    pitSpin = 0;
    pitT = 0;
  }

  reset();

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const sonicShield = !!body.userData.sonicShield;
      const busterWindup = !!body.userData.sonicBusterWindup;
      const sonicBuster = !!body.userData.sonicBuster;

      if (!sonicShield && !busterWindup && !sonicBuster) {
        reset();
        return;
      }

      root.visible = true;

      const bx = body.position.x;
      const bz = body.position.z;
      const floorY = CONFIG.FLOOR_Y + 0.02;
      const R = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const yBase = body.position.y + (body.userData.visualYOffset ?? 0)
        + (body.userData.flightLift ?? 0);

      if (sonicShield) {
        hidePit();
        shieldGroup.position.set(bx, floorY, bz);
        shieldSpin += dt * 4.8;

        const t = body.userData.sonicShieldT ?? 0;
        const life = clamp01(1 - t / LIBRA_SHIELD_DURATION);
        const burst = body.userData.sonicShieldBurstT ?? 0;
        const pulse = 0.72 + 0.28 * Math.sin(shieldSpin * 2.2);
        const reach = body.userData.sonicShieldReach ?? R * 2.75;
        const scale = (reach / (R * 2.75)) * R * (1.05 + burst * 0.18);

        shieldAura.position.set(0, 0.04, 0);
        shieldAura.scale.set(scale, scale, 1);
        shieldAura.material.opacity = (0.28 + pulse * 0.22 + burst * 0.2) * life;

        shieldDome.position.set(0, 0.06, 0);
        shieldDome.scale.set(scale * 0.92, scale * 0.92, 1);
        shieldDome.material.opacity = (0.18 + pulse * 0.14) * life;

        for (const w of shieldWisps) {
          w.phase += dt * (2.2 + w.band * 0.4);
          const orbitR = scale * (0.75 + w.band * 0.12);
          const h = 0.2 + w.band * 0.14 + Math.sin(w.phase * 2) * 0.08;
          w.mesh.position.set(
            Math.cos(w.phase + shieldSpin) * orbitR,
            h,
            Math.sin(w.phase + shieldSpin) * orbitR
          );
          billboard(w.mesh, camera);
          w.mesh.material.opacity = (0.32 + burst * 0.25) * life;
        }
      }

      if (busterWindup || sonicBuster) {
        hideShield();
        const pitX = body.userData.sonicBusterX ?? bx;
        const pitZ = body.userData.sonicBusterZ ?? bz;
        const reach = body.userData.sonicBusterReach ?? R * LIBRA_BUSTER_RADIUS_MULT;
        pitGroup.position.set(pitX, floorY, pitZ);
        pitSpin += dt * (busterWindup ? 2.8 : 4.6);
        pitT += dt;

        if (busterWindup && !sonicBuster) {
          const grow = clamp01(pitT / 0.45);
          const e = easeOut(grow);
          const r = R * (0.5 + e * 1.4);
          pitRing.scale.set(r, r, 1);
          pitRing.material.opacity = 0.35 * e;
          pitInner.scale.set(r * 0.55, r * 0.55, 1);
          pitInner.material.opacity = 0.2 * e;
          for (const p of pitParticles) {
            p.phase += dt * p.speed * 2;
            const pr = r * p.radius * e;
            p.mesh.position.set(
              Math.cos(p.phase) * pr,
              0.04 + p.rise * e,
              Math.sin(p.phase) * pr
            );
            billboard(p.mesh, camera);
            p.mesh.material.opacity = 0.3 * e;
          }
        } else {
          const fadeIn = easeOut(Math.min(1, pitT / 0.22));
          const fadeOut = clamp01((LIBRA_BUSTER_DURATION - pitT) / 0.35);
          const env = fadeIn * fadeOut;
          const pitR = reach;

          pitRing.scale.set(pitR, pitR, 1);
          pitRing.material.opacity = 0.55 * env;
          pitInner.scale.set(pitR * 0.88, pitR * 0.88, 1);
          pitInner.material.opacity = 0.38 * env;

          for (const p of pitParticles) {
            p.phase += dt * p.speed * (1 + pitSpin * 0.08);
            const swirl = p.radius * (0.35 + 0.65 * Math.sin(pitSpin * 0.4 + p.phase));
            const pr = pitR * swirl;
            const h = 0.03 + p.rise * (0.5 + 0.5 * Math.sin(p.phase * 2));
            p.mesh.position.set(
              Math.cos(p.phase + pitSpin) * pr,
              h,
              Math.sin(p.phase + pitSpin) * pr
            );
            billboard(p.mesh, camera);
            const flicker = 0.55 + 0.45 * Math.sin(p.phase * 3 + pitSpin);
            p.mesh.material.opacity = 0.42 * flicker * env;
          }
        }
      }
    },
    reset,
  };
}
