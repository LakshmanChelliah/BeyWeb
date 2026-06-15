import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { LDRAGO_FLIGHT_DURATION, LDRAGO_SPIN_STEAL_DURATION } from '../game/abilities.js';

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

const CRIMSON = 0xef4444;
const RED_DEEP = 0xdc2626;
const RED_DARK = 0x7f1d1d;
const ORANGE = 0xfb923c;
const PALE = 0xfca5a5;
const WHITE_HOT = 0xfee2e2;

const DRAIN_COUNT = 55;
const EMBER_COUNT = 12;
const STEAL_BEAM_COUNT = 10;
const DRAGON_WING_COUNT = 6;
const HELIX_FLAME_COUNT = 52;
const WINDUP_OUT_DUST = 36;
const WINDUP_IN_GATHER = 28;
const ORBIT_EMBER_COUNT = 18;
const REPULSE_SPARK_COUNT = 40;
const REPULSE_RING_COUNT = 3;
const FLIGHT_COLUMN_HEIGHT = 4.2;

function rand(seed) {
  const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function buildTraits(count, kind) {
  const traits = [];
  for (let i = 0; i < count; i++) {
    const s = i + kind.charCodeAt(0) * 13;
    traits.push({
      phase: rand(s) * Math.PI * 2,
      speed: 0.6 + rand(s + 1) * 1.3,
      radius: 0.65 + rand(s + 2) * 0.45,
      height: rand(s + 3),
      size: kind === 'drain'
        ? 0.025 + rand(s + 4) * 0.055
        : kind === 'ember'
          ? 0.06 + rand(s + 4) * 0.1
          : kind === 'wing'
            ? 0.28 + rand(s + 4) * 0.22
            : kind === 'helix'
              ? 0.04 + rand(s + 4) * 0.07
              : 0.03 + rand(s + 4) * 0.05,
      colorPick: Math.floor(rand(s + 5) * 3),
    });
  }
  return traits;
}

/** L-Drago Spin Steal + Supreme Flight scene VFX. */
export function createLdragoAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const stealGroup = new THREE.Group();
  const flightGroup = new THREE.Group();
  root.add(stealGroup);
  root.add(flightGroup);

  function spawnPool(parent, count, kind, geoFn, additive) {
    const traits = buildTraits(count, kind);
    const pool = [];
    const colors = [CRIMSON, RED_DEEP, RED_DARK];
    for (let i = 0; i < count; i++) {
      const mat = makeMat(
        kind === 'ember' || kind === 'flame' ? ORANGE : colors[traits[i].colorPick % 3],
        0,
        { additive: additive || kind === 'ember' }
      );
      const mesh = new THREE.Mesh(geoFn(traits[i]), mat);
      mesh.renderOrder = kind === 'drain' ? 4 : 5;
      parent.add(mesh);
      pool.push({ mesh, traits: traits[i], kind });
    }
    return pool;
  }

  const drainPool = spawnPool(
    stealGroup,
    DRAIN_COUNT,
    'drain',
    (t) => new THREE.PlaneGeometry(t.size, t.size * 0.85),
    false
  );
  const emberPool = spawnPool(
    stealGroup,
    EMBER_COUNT,
    'ember',
    (t) => new THREE.PlaneGeometry(t.size, t.size),
    true
  );
  const stealBeams = [];
  for (let i = 0; i < STEAL_BEAM_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.05),
      makeMat(PALE, 0, { additive: true })
    );
    mesh.renderOrder = 6;
    stealGroup.add(mesh);
    stealBeams.push({ mesh, offset: i / STEAL_BEAM_COUNT });
  }

  const stealCore = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    makeMat(WHITE_HOT, 0, { additive: true })
  );
  stealCore.renderOrder = 7;
  stealGroup.add(stealCore);

  const dragonWings = [];
  for (let i = 0; i < DRAGON_WING_COUNT; i++) {
    const side = i < 3 ? -1 : 1;
    const tier = i % 3;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42 + tier * 0.16, 1.55 + tier * 0.42),
      makeMat(tier === 0 ? ORANGE : tier === 1 ? CRIMSON : RED_DEEP, 0, { additive: true })
    );
    mesh.renderOrder = 6;
    flightGroup.add(mesh);
    dragonWings.push({
      mesh,
      side,
      tier,
      flapPhase: rand(i + 90) * Math.PI * 2,
    });
  }

  const helixPool = spawnPool(
    flightGroup,
    HELIX_FLAME_COUNT,
    'helix',
    (t) => new THREE.PlaneGeometry(t.size, t.size * 2.4),
    true
  );

  const orbitEmbers = [];
  for (let i = 0; i < ORBIT_EMBER_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.07),
      makeMat(i % 2 === 0 ? PALE : ORANGE, 0, { additive: true })
    );
    mesh.renderOrder = 7;
    flightGroup.add(mesh);
    orbitEmbers.push({ mesh, phase: (i / ORBIT_EMBER_COUNT) * Math.PI * 2, band: i % 3 });
  }

  const windupOutDust = [];
  for (let i = 0; i < WINDUP_OUT_DUST; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05 + (i % 4) * 0.015, 0.05 + (i % 3) * 0.012),
      makeMat(i % 3 === 0 ? RED_DARK : RED_DEEP, 0)
    );
    mesh.renderOrder = 3;
    flightGroup.add(mesh);
    windupOutDust.push({ mesh, phase: (i / WINDUP_OUT_DUST) * Math.PI * 2 });
  }

  const windupGather = [];
  for (let i = 0; i < WINDUP_IN_GATHER; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, 0.04),
      makeMat(i % 2 === 0 ? CRIMSON : ORANGE, 0, { additive: true })
    );
    mesh.renderOrder = 4;
    flightGroup.add(mesh);
    windupGather.push({ mesh, phase: (i / WINDUP_IN_GATHER) * Math.PI * 2, band: rand(i + 40) });
  }

  const windupCrater = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 1.15, 48),
    makeMat(CRIMSON, 0, { additive: true })
  );
  windupCrater.rotation.x = -Math.PI / 2;
  windupCrater.renderOrder = 2;
  flightGroup.add(windupCrater);

  const windupPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.55, 1, 16, 1, true),
    makeMat(ORANGE, 0, { additive: true })
  );
  windupPillar.renderOrder = 3;
  flightGroup.add(windupPillar);

  const pillarOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.85, 1, 20, 1, true),
    makeMat(RED_DARK, 0, { additive: true })
  );
  pillarOuter.renderOrder = 1;
  flightGroup.add(pillarOuter);

  const pillarInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 1, 16, 1, true),
    makeMat(WHITE_HOT, 0, { additive: true })
  );
  pillarInner.renderOrder = 2;
  flightGroup.add(pillarInner);

  const hoverAura = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.35, 48),
    makeMat(CRIMSON, 0, { additive: true })
  );
  hoverAura.rotation.x = -Math.PI / 2;
  hoverAura.renderOrder = 5;
  flightGroup.add(hoverAura);

  const dragonBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 2.2),
    makeMat(RED_DEEP, 0, { additive: true })
  );
  dragonBackdrop.renderOrder = 4;
  flightGroup.add(dragonBackdrop);

  const repulseRings = [];
  for (let i = 0; i < REPULSE_RING_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 40),
      makeMat(i === 0 ? WHITE_HOT : PALE, 0, { additive: true })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 9;
    flightGroup.add(mesh);
    repulseRings.push({ mesh, delay: i * 0.12 });
  }

  const repulseSparks = [];
  for (let i = 0; i < REPULSE_SPARK_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06 + (i % 3) * 0.025, 0.06 + (i % 2) * 0.02),
      makeMat(i % 4 === 0 ? WHITE_HOT : PALE, 0, { additive: true })
    );
    mesh.renderOrder = 8;
    flightGroup.add(mesh);
    repulseSparks.push({ mesh, angle: (i / REPULSE_SPARK_COUNT) * Math.PI * 2, band: i % 5 });
  }

  let stealSpin = 0;
  let flightSpin = 0;
  let flightT = 0;

  function hideSteal() {
    for (const p of drainPool) p.mesh.material.opacity = 0;
    for (const p of emberPool) p.mesh.material.opacity = 0;
    for (const b of stealBeams) b.mesh.material.opacity = 0;
    stealCore.material.opacity = 0;
  }

  function hideFlight() {
    for (const w of dragonWings) w.mesh.material.opacity = 0;
    for (const p of helixPool) p.mesh.material.opacity = 0;
    for (const e of orbitEmbers) e.mesh.material.opacity = 0;
    for (const d of windupOutDust) d.mesh.material.opacity = 0;
    for (const g of windupGather) g.mesh.material.opacity = 0;
    windupCrater.material.opacity = 0;
    windupPillar.material.opacity = 0;
    pillarOuter.material.opacity = 0;
    pillarInner.material.opacity = 0;
    hoverAura.material.opacity = 0;
    dragonBackdrop.material.opacity = 0;
    for (const r of repulseRings) r.mesh.material.opacity = 0;
    for (const s of repulseSparks) s.mesh.material.opacity = 0;
  }

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function reset() {
    root.visible = false;
    hideSteal();
    hideFlight();
    stealSpin = 0;
    flightSpin = 0;
    flightT = 0;
  }

  reset();

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const spinStealing = !!body.userData.spinStealing;
      const flightWindup = !!body.userData.ldragoFlightWindup;
      const inFlight = !!body.userData.airborne && !!body.userData.invulnerable;

      if (!spinStealing && !flightWindup && !inFlight) {
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

      if (spinStealing) {
        hideFlight();
        stealGroup.position.set(0, 0, 0);
        stealSpin -= dt * 4.2;

        const stealT = body.userData.spinStealT ?? 0;
        const life = clamp01(1 - stealT / LDRAGO_SPIN_STEAL_DURATION);
        const burst = body.userData.spinStealBurstT ?? 0;
        const fromX = body.userData.spinStealFromX ?? bx;
        const fromZ = body.userData.spinStealFromZ ?? bz;

        // Inward spiral drain particles (counter-clockwise).
        for (const p of drainPool) {
          const tr = p.traits;
          tr.phase -= dt * tr.speed * 2.8;
          const orbitR = R * tr.radius * (1.6 + 0.25 * Math.sin(tr.phase * 2));
          const h = 0.15 + tr.height * R * 0.5 + Math.sin(tr.phase) * 0.12;
          p.mesh.position.set(
            bx + Math.cos(tr.phase) * orbitR,
            yBase + h,
            bz + Math.sin(tr.phase) * orbitR
          );
          billboard(p.mesh, camera);
          p.mesh.material.opacity = (0.28 + 0.2 * Math.sin(tr.phase * 3)) * life;
        }

        // Counter-rotating embers.
        for (const p of emberPool) {
          const tr = p.traits;
          tr.phase -= dt * (3.5 + tr.speed);
          const orbitR = R * (1.05 + 0.15 * Math.sin(tr.phase));
          p.mesh.position.set(
            bx + Math.cos(tr.phase) * orbitR,
            yBase + 0.2 + Math.sin(tr.phase * 2) * 0.15,
            bz + Math.sin(tr.phase) * orbitR
          );
          billboard(p.mesh, camera);
          p.mesh.material.opacity = (0.35 + 0.15 * Math.sin(tr.phase)) * life;
        }

        // Steal burst beams from opponent toward L-Drago.
        if (burst > 0.05) {
          for (let i = 0; i < stealBeams.length; i++) {
            const beam = stealBeams[i];
            const t = (beam.offset + performance.now() * 0.002) % 1;
            const ease = t * t * (3 - 2 * t);
            beam.mesh.position.set(
              fromX + (bx - fromX) * ease,
              yBase + 0.25 + Math.sin(t * Math.PI) * 0.35,
              fromZ + (bz - fromZ) * ease
            );
            billboard(beam.mesh, camera);
            beam.mesh.material.opacity = burst * (1 - t) * 0.7 * life;
          }
        } else {
          for (const b of stealBeams) b.mesh.material.opacity = 0;
        }

        stealCore.position.set(bx, yBase, bz);
        billboard(stealCore, camera);
        stealCore.scale.setScalar(topGroup.scale.x * (0.4 + 0.15 * Math.sin(stealSpin * 3)));
        stealCore.material.opacity = (0.15 + burst * 0.35) * life;
      }

      if (flightWindup || inFlight) {
        hideSteal();
        flightGroup.position.set(bx, floorY, bz);
        flightT += dt;

        if (flightWindup && !inFlight) {
          const growT = clamp01(flightT / 0.5);
          const e = 1 - (1 - growT) * (1 - growT);
          flightSpin += dt * 4.5;

          // Crater ring — energy gathering on the floor (anime wind-up).
          const craterR = R * (1.6 - e * 0.55);
          windupCrater.scale.set(craterR, craterR, 1);
          windupCrater.position.set(0, 0.04, 0);
          windupCrater.material.opacity = (0.22 + e * 0.38) * (0.75 + 0.25 * Math.sin(flightSpin * 5));

          // Rising preview pillar under the bey.
          const previewH = R * (0.4 + e * 1.8);
          windupPillar.scale.set(R * 0.55, previewH, R * 0.55);
          windupPillar.position.set(0, previewH * 0.5, 0);
          windupPillar.material.opacity = 0.18 + e * 0.42;

          // Outward stadium dust pushed away.
          for (const d of windupOutDust) {
            d.phase += dt * (5 + d.phase % 3);
            const r = R * (0.55 + e * 2.2) * (0.88 + 0.12 * Math.sin(d.phase * 2));
            d.mesh.position.set(
              Math.cos(d.phase + flightSpin * 0.6) * r,
              0.05 + e * 0.55 + Math.sin(d.phase) * 0.08,
              Math.sin(d.phase + flightSpin * 0.6) * r
            );
            billboard(d.mesh, camera);
            d.mesh.material.opacity = 0.42 * e * (0.45 + 0.55 * Math.sin(d.phase * 3));
          }

          // Inward spiraling energy motes converging on L-Drago.
          for (const g of windupGather) {
            g.phase += dt * (6 + g.band * 2);
            const t = (g.phase * 0.15 + g.band * 0.2 + flightSpin * 0.08) % 1;
            const gatherR = R * (2.4 * (1 - t) + 0.25);
            const h = 0.12 + t * (0.35 + e * 0.9);
            g.mesh.position.set(
              Math.cos(g.phase) * gatherR,
              h,
              Math.sin(g.phase) * gatherR
            );
            billboard(g.mesh, camera);
            g.mesh.material.opacity = (0.25 + t * 0.45) * e;
          }

          for (const w of dragonWings) w.mesh.material.opacity = 0;
          for (const p of helixPool) p.mesh.material.opacity = 0;
          for (const em of orbitEmbers) em.mesh.material.opacity = 0;
          pillarOuter.material.opacity = 0;
          pillarInner.material.opacity = 0;
          hoverAura.material.opacity = 0;
          dragonBackdrop.material.opacity = 0;
          for (const r of repulseRings) r.mesh.material.opacity = 0;
          for (const s of repulseSparks) s.mesh.material.opacity = 0;
        } else {
          flightSpin += dt * 3.6;
          const ft = body.userData.ldragoFlightT ?? 0;
          const fadeIn = clamp01(ft / 0.28);
          const fadeOut = clamp01((LDRAGO_FLIGHT_DURATION - ft) / 0.25);
          const env = fadeIn * fadeOut;
          const hoverY = R * 0.35 + (body.userData.flightLift ?? 0);
          const lift = hoverY;
          const repulse = body.userData.flightRepulseT ?? 0;

          for (const d of windupOutDust) d.mesh.material.opacity = 0;
          for (const g of windupGather) g.mesh.material.opacity = 0;
          windupCrater.material.opacity = 0;
          windupPillar.material.opacity = 0;

          // Anime dragon wings — three tiers per side, spread wide at hover height.
          for (const wing of dragonWings) {
            const { side, tier, flapPhase } = wing;
            const spread = R * (1.85 + tier * 0.42 + 0.12 * Math.sin(flightSpin * 2 + tier));
            const flap = Math.sin(flightSpin * 3.5 + flapPhase + tier * 0.7) * 0.22;
            const yaw = side * (0.42 + tier * 0.22);
            const h = hoverY + 0.05 + tier * 0.12 + flap * 0.15;
            wing.mesh.position.set(
              side * spread * 0.92,
              h,
              spread * 0.18 * side
            );
            wing.mesh.rotation.set(
              -0.35 + flap + tier * 0.08,
              yaw,
              side * (0.28 + tier * 0.06)
            );
            wing.mesh.material.opacity = (0.48 + tier * 0.08) * env;
          }

          // Soft dragon silhouette glow behind the hovering bey.
          dragonBackdrop.position.set(0, hoverY + 0.08, -R * 0.35);
          dragonBackdrop.rotation.set(-0.15, 0, 0);
          dragonBackdrop.scale.set(
            R * (1.35 + 0.08 * Math.sin(flightSpin * 2)),
            R * (1.05 + 0.06 * Math.sin(flightSpin * 1.6)),
            1
          );
          dragonBackdrop.material.opacity = 0.22 * env;

          // Pulsing hover halo at flight altitude.
          const auraPulse = 0.85 + 0.15 * Math.sin(flightSpin * 4);
          hoverAura.position.set(0, hoverY - 0.08, 0);
          hoverAura.scale.set(R * auraPulse * 1.55, R * auraPulse * 1.55, 1);
          hoverAura.material.opacity = 0.34 * env;

          // Energy column anchored at the stadium floor around the bey.
          const colH = FLIGHT_COLUMN_HEIGHT * R * 0.55;
          const colPulse = 0.92 + 0.08 * Math.sin(flightSpin * 3.2);
          pillarOuter.scale.set(R * 0.95 * colPulse, colH, R * 0.95 * colPulse);
          pillarOuter.position.set(0, colH * 0.5, 0);
          pillarOuter.material.opacity = 0.28 * env;

          pillarInner.scale.set(R * 0.48 * colPulse, colH * 0.92, R * 0.48 * colPulse);
          pillarInner.position.set(0, colH * 0.48, 0);
          pillarInner.material.opacity = 0.38 * env;

          // Helix flame strands spiraling up the column.
          for (const p of helixPool) {
            const tr = p.traits;
            tr.phase += dt * (tr.speed * 1.6 + 0.4);
            const t = (tr.height + tr.phase * 0.06) % 1;
            const h = t * colH;
            const taper = 1 - t * 0.55;
            const r = R * (0.55 + taper * 0.85) * tr.radius * (0.92 + 0.08 * Math.sin(tr.phase * 5));
            const angle = tr.phase * 2.4 + flightSpin * 1.8 + t * Math.PI * 4;
            p.mesh.position.set(Math.cos(angle) * r, h, Math.sin(angle) * r);
            p.mesh.rotation.set(Math.sin(angle) * 0.35, angle, 0.12);
            p.mesh.material.color.setHex(t < 0.35 ? WHITE_HOT : t < 0.7 ? ORANGE : CRIMSON);
            p.mesh.material.opacity = (0.32 + 0.28 * (1 - Math.abs(t - 0.45))) * env;
          }

          // Orbiting embers at hover height.
          for (const em of orbitEmbers) {
            em.phase += dt * (2.8 + em.band * 0.6);
            const bandR = R * (1.15 + em.band * 0.22);
            em.mesh.position.set(
              Math.cos(em.phase + flightSpin) * bandR,
              hoverY + 0.12 + Math.sin(em.phase * 2.5) * 0.18,
              Math.sin(em.phase + flightSpin) * bandR
            );
            billboard(em.mesh, camera);
            em.mesh.material.opacity = 0.42 * env * (0.6 + 0.4 * Math.sin(em.phase * 3));
          }

          // Repulse — expanding shock rings + radial spark burst.
          if (repulse > 0.04) {
            for (let ri = 0; ri < repulseRings.length; ri++) {
              const ring = repulseRings[ri];
              const wave = clamp01((repulse - ring.delay) * 1.35);
              if (wave <= 0) {
                ring.mesh.material.opacity = 0;
                continue;
              }
              const rr = R * (1.1 + (1 - wave) * 3.8 + ri * 0.35);
              ring.mesh.position.set(0, hoverY * 0.25 + ri * 0.08, 0);
              ring.mesh.scale.set(rr, rr, 1);
              ring.mesh.material.opacity = wave * (0.55 - ri * 0.12) * env;
            }
            for (const sp of repulseSparks) {
              const burst = repulse * (1 + sp.band * 0.12);
              const dist = R * (1.4 + (1 - burst) * 3.2 + Math.sin(sp.angle * 4 + sp.band) * 0.35);
              const liftOff = hoverY * (0.25 + burst * 0.55) + sp.band * 0.06;
              sp.mesh.position.set(
                Math.cos(sp.angle + flightSpin * 1.5) * dist,
                liftOff,
                Math.sin(sp.angle + flightSpin * 1.5) * dist
              );
              billboard(sp.mesh, camera);
              sp.mesh.material.opacity = burst * 0.72 * env;
            }
          } else {
            for (const r of repulseRings) r.mesh.material.opacity = 0;
            for (const sp of repulseSparks) sp.mesh.material.opacity = 0;
          }
        }
      }
    },
    reset,
  };
}
