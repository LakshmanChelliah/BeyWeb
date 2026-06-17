import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';
import {
  LDRAGO_FLIGHT_DURATION,
  LDRAGO_FLIGHT_LAND_DUR,
  LDRAGO_FLIGHT_LAUNCH_DUR,
  LDRAGO_LIGHTNING_CHARGE_DUR,
  LDRAGO_LIGHTNING_COUNT,
  LDRAGO_LIGHTNING_RADIUS,
  LDRAGO_SPIN_STEAL_DURATION,
} from '../game/abilities.js';

function makeMat(color, opacity, { additive = false, doubleSide = false, map = null } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function createMatCache() {
  const cache = new Map();
  return (color, additive = false, doubleSide = false) => {
    const key = `${color}|${additive ? 1 : 0}|${doubleSide ? 1 : 0}`;
    if (!cache.has(key)) cache.set(key, makeMat(color, 0, { additive, doubleSide }));
    return cache.get(key);
  };
}

const CRIMSON = 0xef4444;
const RED_DEEP = 0xdc2626;
const RED_DARK = 0x7f1d1d;
const ORANGE = 0xfb923c;
const PALE = 0xfca5a5;
const WHITE_HOT = 0xfee2e2;

const DRAIN_COUNT = 28;
const EMBER_COUNT = 8;
const STEAL_BEAM_COUNT = 6;
const DRAGON_WING_COUNT = 6;
const HELIX_FLAME_COUNT = 28;
const WINDUP_OUT_DUST = 20;
const WINDUP_IN_GATHER = 16;
const ORBIT_EMBER_COUNT = 10;
const REPULSE_SPARK_COUNT = 20;
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
      sizeTier: Math.floor(rand(s + 4) * 3),
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
      // Pre-baked heat band for helix strands — avoids per-frame material.color.setHex.
      heatBand: Math.floor(rand(s + 11) * 3),
    });
  }
  return traits;
}

const DRAIN_GEOS = [
  new THREE.PlaneGeometry(0.03, 0.026),
  new THREE.PlaneGeometry(0.045, 0.038),
  new THREE.PlaneGeometry(0.06, 0.05),
];
const HELIX_GEOS = [
  new THREE.PlaneGeometry(0.04, 0.1),
  new THREE.PlaneGeometry(0.055, 0.13),
  new THREE.PlaneGeometry(0.07, 0.16),
];
const EMBER_GEOS = [
  new THREE.PlaneGeometry(0.06, 0.06),
  new THREE.PlaneGeometry(0.08, 0.08),
  new THREE.PlaneGeometry(0.1, 0.1),
];
const HELIX_HEAT_COLORS = [WHITE_HOT, ORANGE, CRIMSON];
const BOLT_VIOLET = 0xc4b5fd;
const BOLT_GLOW = 0xfff7ed;
const LIGHTNING_SKY_Y = 26;
const LIGHTNING_BOLT_SPREAD = 2.85;
const STRIKE_MAIN_BOLT_COUNT = 8;
const STRIKE_BRANCH_BOLT_COUNT = 6;
const STRIKE_SIDE_BOLT_COUNT = 5;
const STRIKE_CHARGE_ARC_COUNT = 3;
const MAIN_BOLT_COLORS = [WHITE_HOT, BOLT_GLOW, BOLT_VIOLET, ORANGE, PALE, CRIMSON, WHITE_HOT, BOLT_GLOW];
const BRANCH_BOLT_COLORS = [BOLT_GLOW, CRIMSON, BOLT_VIOLET, ORANGE, PALE, WHITE_HOT];

function boltRand(seed) {
  return rand(seed) * 2 - 1;
}

function buildBoltPoints(seed, x, z, topY, bottomY, spread) {
  const pts = [];
  const segs = 16;
  let px = x;
  let pz = z;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = topY + (bottomY - topY) * t;
    if (i > 0 && i < segs) {
      px = x + boltRand(seed + i * 1.9) * spread * (1 - t * 0.72);
      pz = z + boltRand(seed + i * 2.4 + 40) * spread * (1 - t * 0.72);
    }
    pts.push(new THREE.Vector3(px, y, pz));
  }
  return pts;
}

function buildBranchPoints(seed, mainPts, startIdx, spread) {
  const start = mainPts[startIdx];
  const dir = boltRand(seed) > 0 ? 1 : -1;
  const pts = [start.clone()];
  const segs = 6;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    pts.push(new THREE.Vector3(
      start.x + dir * spread * t * (0.55 + boltRand(seed + i) * 0.45),
      start.y - t * (2.4 + boltRand(seed + i + 3) * 1.2),
      start.z + boltRand(seed + i + 7) * spread * 0.35 * t
    ));
  }
  return pts;
}

function spawnBoltLines(parent, count, colors, baseOrder) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const line = createBoltLine(colors[i % colors.length], baseOrder - (i % 4));
    parent.add(line);
    lines.push(line);
  }
  return lines;
}

function createBoltLine(color, renderOrder = 11) {
  const geo = new THREE.BufferGeometry();
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = renderOrder;
  line.frustumCulled = false;
  return line;
}

function setBoltPoints(line, points) {
  line.geometry.setFromPoints(points);
}

/** Soft lumpy cloud shadow for lightning target areas (normal blend, not additive). */
function createCloudShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 128, 128);

  for (let i = 0; i < 5; i++) {
    const cx = 40 + Math.random() * 48;
    const cy = 40 + Math.random() * 48;
    const r = 22 + Math.random() * 28;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(18,14,32,0.62)');
    grad.addColorStop(0.55, 'rgba(28,24,42,0.32)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 1.1, r * 0.75, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShadowMat(map) {
  return new THREE.MeshBasicMaterial({
    map,
    color: 0xc8c4d8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

/** Vertical fire streak texture for the Supreme Flight energy column. */
function createFireStreakTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 128, 256);

  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 128;
    const w = 0.8 + Math.random() * 3.2;
    const peak = 0.08 + Math.random() * 0.32;
    const grad = ctx.createLinearGradient(x, 0, x, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.12, `rgba(255,240,220,${peak})`);
    grad.addColorStop(0.45, `rgba(255,120,60,${peak * 0.85})`);
    grad.addColorStop(0.78, `rgba(220,40,30,${peak * 0.55})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, w, 256);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1.8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dragon head + wings silhouette for the hover backdrop glow. */
function createDragonSilhouetteTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 256, 192);

  const cx = 128;
  const cy = 108;

  // Spread wings
  ctx.fillStyle = 'rgba(220,38,38,0.55)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.bezierCurveTo(40, cy - 50, 8, cy + 20, 24, cy + 52);
  ctx.lineTo(cx - 18, cy + 12);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.bezierCurveTo(216, cy - 50, 248, cy + 20, 232, cy + 52);
  ctx.lineTo(cx + 18, cy + 12);
  ctx.closePath();
  ctx.fill();

  // Inner wing glow
  ctx.fillStyle = 'rgba(251,146,60,0.45)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4);
  ctx.bezierCurveTo(62, cy - 28, 38, cy + 10, 52, cy + 38);
  ctx.lineTo(cx - 12, cy + 10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 4);
  ctx.bezierCurveTo(194, cy - 28, 218, cy + 10, 204, cy + 38);
  ctx.lineTo(cx + 12, cy + 10);
  ctx.closePath();
  ctx.fill();

  // Dragon head / neck
  ctx.fillStyle = 'rgba(239,68,68,0.7)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 58);
  ctx.bezierCurveTo(cx - 22, cy - 38, cx - 28, cy - 8, cx - 14, cy + 8);
  ctx.lineTo(cx + 14, cy + 8);
  ctx.bezierCurveTo(cx + 28, cy - 8, cx + 22, cy - 38, cx, cy - 58);
  ctx.closePath();
  ctx.fill();

  // Eye glint
  ctx.fillStyle = 'rgba(254,226,226,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy - 28, 4, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 8, cy - 28, 4, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** L-Drago Spin Steal + Supreme Flight scene VFX. */
export function createLdragoAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const getMat = createMatCache();
  const fireOuterTex = createFireStreakTexture();
  const fireInnerTex = createFireStreakTexture();
  const cloudShadowTex = createCloudShadowTexture();
  const dragonSilhouetteTex = createDragonSilhouetteTexture();

  const stealGroup = new THREE.Group();
  const flightGroup = new THREE.Group();
  root.add(stealGroup);
  root.add(flightGroup);

  function setVisible(mesh, opacity) {
    const show = opacity > 0.02;
    mesh.visible = show;
    mesh.material.opacity = show ? opacity : 0;
  }

  function spawnPool(parent, count, kind, geos, additive) {
    const traits = buildTraits(count, kind);
    const pool = [];
    const colors = [CRIMSON, RED_DEEP, RED_DARK];
    for (let i = 0; i < count; i++) {
      const tr = traits[i];
      const color = kind === 'ember'
        ? ORANGE
        : kind === 'helix'
          ? HELIX_HEAT_COLORS[tr.heatBand]
          : colors[tr.colorPick % 3];
      const mat = getMat(color, additive || kind === 'ember' || kind === 'helix');
      const geo = geos ? geos[tr.sizeTier] : new THREE.PlaneGeometry(tr.size, tr.size * 0.85);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = kind === 'drain' ? 4 : 5;
      mesh.visible = false;
      parent.add(mesh);
      pool.push({ mesh, traits: tr, kind });
    }
    return pool;
  }

  const drainPool = spawnPool(stealGroup, DRAIN_COUNT, 'drain', DRAIN_GEOS, false);
  const emberPool = spawnPool(stealGroup, EMBER_COUNT, 'ember', EMBER_GEOS, true);
  const helixPool = spawnPool(flightGroup, HELIX_FLAME_COUNT, 'helix', HELIX_GEOS, true);
  const stealBeams = [];
  const beamMat = getMat(PALE, true);
  for (let i = 0; i < STEAL_BEAM_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.05),
      beamMat
    );
    mesh.renderOrder = 6;
    stealGroup.add(mesh);
    stealBeams.push({ mesh, offset: i / STEAL_BEAM_COUNT });
  }

  const stealCore = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    getMat(WHITE_HOT, true)
  );
  stealCore.renderOrder = 7;
  stealGroup.add(stealCore);

  const dragonWings = [];
  for (let i = 0; i < DRAGON_WING_COUNT; i++) {
    const side = i < 3 ? -1 : 1;
    const tier = i % 3;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42 + tier * 0.16, 1.55 + tier * 0.42),
      getMat(tier === 0 ? ORANGE : tier === 1 ? CRIMSON : RED_DEEP, true)
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

  const orbitEmbers = [];
  for (let i = 0; i < ORBIT_EMBER_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.07, 0.07),
      getMat(i % 2 === 0 ? PALE : ORANGE, true)
    );
    mesh.renderOrder = 7;
    flightGroup.add(mesh);
    orbitEmbers.push({ mesh, phase: (i / ORBIT_EMBER_COUNT) * Math.PI * 2, band: i % 3 });
  }

  const windupOutDust = [];
  for (let i = 0; i < WINDUP_OUT_DUST; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05 + (i % 4) * 0.015, 0.05 + (i % 3) * 0.012),
      getMat(i % 3 === 0 ? RED_DARK : RED_DEEP)
    );
    mesh.renderOrder = 3;
    flightGroup.add(mesh);
    windupOutDust.push({ mesh, phase: (i / WINDUP_OUT_DUST) * Math.PI * 2 });
  }

  const windupGather = [];
  for (let i = 0; i < WINDUP_IN_GATHER; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, 0.04),
      getMat(i % 2 === 0 ? CRIMSON : ORANGE, true)
    );
    mesh.renderOrder = 4;
    flightGroup.add(mesh);
    windupGather.push({ mesh, phase: (i / WINDUP_IN_GATHER) * Math.PI * 2, band: rand(i + 40) });
  }

  const windupCrater = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 1.15, 24),
    getMat(CRIMSON, true)
  );
  windupCrater.rotation.x = -Math.PI / 2;
  windupCrater.renderOrder = 2;
  flightGroup.add(windupCrater);

  const windupPillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.55, 1, 12, 1, true),
    getMat(ORANGE, true)
  );
  windupPillar.renderOrder = 3;
  flightGroup.add(windupPillar);

  const pillarOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.85, 1, 14, 1, true),
    makeMat(RED_DARK, 0, { additive: true, map: fireOuterTex })
  );
  pillarOuter.renderOrder = 1;
  flightGroup.add(pillarOuter);

  const pillarInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 1, 12, 1, true),
    makeMat(WHITE_HOT, 0, { additive: true, map: fireInnerTex })
  );
  pillarInner.renderOrder = 2;
  flightGroup.add(pillarInner);

  const hoverAura = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.35, 24),
    getMat(CRIMSON, true)
  );
  hoverAura.rotation.x = -Math.PI / 2;
  hoverAura.renderOrder = 5;
  flightGroup.add(hoverAura);

  const dragonBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 2.2),
    makeMat(WHITE_HOT, 0, { additive: true, map: dragonSilhouetteTex })
  );
  dragonBackdrop.renderOrder = 4;
  flightGroup.add(dragonBackdrop);

  const repulseRings = [];
  for (let i = 0; i < REPULSE_RING_COUNT; i++) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 24),
      getMat(i === 0 ? WHITE_HOT : PALE, true)
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
      getMat(i % 4 === 0 ? WHITE_HOT : PALE, true)
    );
    mesh.renderOrder = 8;
    flightGroup.add(mesh);
    repulseSparks.push({ mesh, angle: (i / REPULSE_SPARK_COUNT) * Math.PI * 2, band: i % 5 });
  }

  const lightningGroup = new THREE.Group();
  root.add(lightningGroup);
  const lightningStrikes = [];
  const CLOUD_PIECES_PER_STRIKE = 3;
  for (let i = 0; i < LDRAGO_LIGHTNING_COUNT; i++) {
    const cloudShadows = [];
    for (let ci = 0; ci < CLOUD_PIECES_PER_STRIKE; ci++) {
      const w = 2.8 + ci * 0.55 + rand(i * 7 + ci) * 1.2;
      const h = w * (0.62 + rand(i + ci * 3) * 0.28);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        makeShadowMat(cloudShadowTex)
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.rotation.z = rand(i + ci * 11) * Math.PI * 2;
      shadow.renderOrder = 9;
      lightningGroup.add(shadow);
      cloudShadows.push({
        mesh: shadow,
        offX: boltRand(i + ci * 5) * 1.4,
        offZ: boltRand(i + ci * 9 + 3) * 1.4,
        scaleBias: 0.85 + rand(i + ci) * 0.35,
      });
    }

    const chargeArcs = spawnBoltLines(lightningGroup, STRIKE_CHARGE_ARC_COUNT, [BOLT_VIOLET, CRIMSON, BOLT_GLOW], 10);
    const mainBolts = spawnBoltLines(lightningGroup, STRIKE_MAIN_BOLT_COUNT, MAIN_BOLT_COLORS, 13);
    const branchBolts = spawnBoltLines(lightningGroup, STRIKE_BRANCH_BOLT_COUNT, BRANCH_BOLT_COLORS, 12);
    const sideBolts = spawnBoltLines(lightningGroup, STRIKE_SIDE_BOLT_COUNT, [BOLT_VIOLET, PALE, BOLT_GLOW, ORANGE, CRIMSON], 11);

    const skyFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1.6),
      getMat(WHITE_HOT, true)
    );
    skyFlash.renderOrder = 14;
    lightningGroup.add(skyFlash);

    const skyFlashOuter = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 2.8),
      getMat(BOLT_VIOLET, true)
    );
    skyFlashOuter.renderOrder = 13;
    lightningGroup.add(skyFlashOuter);

    lightningStrikes.push({
      cloudShadows,
      chargeArcs,
      mainBolts,
      branchBolts,
      sideBolts,
      skyFlash,
      skyFlashOuter,
    });
  }

  let stealSpin = 0;
  let flightSpin = 0;
  let flightT = 0;

  function hideSteal() {
    for (const p of drainPool) { p.mesh.visible = false; p.mesh.material.opacity = 0; }
    for (const p of emberPool) { p.mesh.visible = false; p.mesh.material.opacity = 0; }
    for (const b of stealBeams) { b.mesh.visible = false; b.mesh.material.opacity = 0; }
    stealCore.visible = false;
    stealCore.material.opacity = 0;
  }

  function hideFlight() {
    for (const w of dragonWings) { w.mesh.visible = false; w.mesh.material.opacity = 0; }
    for (const p of helixPool) { p.mesh.visible = false; p.mesh.material.opacity = 0; }
    for (const e of orbitEmbers) { e.mesh.visible = false; e.mesh.material.opacity = 0; }
    for (const d of windupOutDust) { d.mesh.visible = false; d.mesh.material.opacity = 0; }
    for (const g of windupGather) { g.mesh.visible = false; g.mesh.material.opacity = 0; }
    windupCrater.visible = false;
    windupPillar.visible = false;
    pillarOuter.visible = false;
    pillarInner.visible = false;
    hoverAura.visible = false;
    dragonBackdrop.visible = false;
    windupCrater.material.opacity = 0;
    windupPillar.material.opacity = 0;
    pillarOuter.material.opacity = 0;
    pillarInner.material.opacity = 0;
    hoverAura.material.opacity = 0;
    dragonBackdrop.material.opacity = 0;
    for (const r of repulseRings) { r.mesh.visible = false; r.mesh.material.opacity = 0; }
    for (const s of repulseSparks) { s.mesh.visible = false; s.mesh.material.opacity = 0; }
    hideLightning();
  }

  function hideLightning() {
    for (const strike of lightningStrikes) {
      for (const cloud of strike.cloudShadows) {
        cloud.mesh.visible = false;
        cloud.mesh.material.opacity = 0;
      }
      strike.skyFlash.visible = false;
      strike.skyFlash.material.opacity = 0;
      strike.skyFlashOuter.visible = false;
      strike.skyFlashOuter.material.opacity = 0;
      for (const group of [strike.chargeArcs, strike.mainBolts, strike.branchBolts, strike.sideBolts]) {
        for (const line of group) {
          line.visible = false;
          line.material.opacity = 0;
        }
      }
    }
  }

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function reset() {
    root.visible = false;
    hideSteal();
    hideFlight();
    hideLightning();
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
          setVisible(p.mesh, (0.28 + 0.2 * Math.sin(tr.phase * 3)) * life);
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
          setVisible(p.mesh, (0.35 + 0.15 * Math.sin(tr.phase)) * life);
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
            setVisible(beam.mesh, burst * (1 - t) * 0.7 * life);
          }
        } else {
          for (const b of stealBeams) { b.mesh.visible = false; b.mesh.material.opacity = 0; }
        }

        stealCore.position.set(bx, yBase, bz);
        billboard(stealCore, camera);
        stealCore.scale.setScalar(topGroup.scale.x * (0.4 + 0.15 * Math.sin(stealSpin * 3)));
        stealCore.visible = true;
        setVisible(stealCore, (0.15 + burst * 0.35) * life);
      }

      if (flightWindup || inFlight) {
        hideSteal();
        flightGroup.position.set(bx, floorY, bz);
        flightT += dt;

        if (flightWindup && !inFlight) {
          const growT = clamp01(flightT / 0.65);
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
          const launch = body.userData.ldragoFlightLaunchT ?? 0;
          const repulse = body.userData.flightRepulseT ?? 0;
          const fadeIn = clamp01(ft / LDRAGO_FLIGHT_LAUNCH_DUR);
          const inLand = ft >= LDRAGO_FLIGHT_DURATION - LDRAGO_FLIGHT_LAND_DUR;
          const landFade = inLand
            ? clamp01((LDRAGO_FLIGHT_DURATION - ft) / LDRAGO_FLIGHT_LAND_DUR)
            : 1;
          const env = fadeIn * landFade;
          const wingRevealStart = LDRAGO_FLIGHT_LAUNCH_DUR * 0.45;
          const wingRevealSpan = LDRAGO_FLIGHT_LAUNCH_DUR * 0.35;
          const wingReveal = ft < wingRevealStart
            ? 0
            : clamp01((ft - wingRevealStart) / wingRevealSpan);
          const hoverY = body.userData.flightLift ?? 0;
          const launchBoost = launch > 0 ? 1 + (1 - launch) * 0.55 : 1;

          fireOuterTex.offset.y -= dt * 2.2;
          fireInnerTex.offset.y += dt * 2.2;

          for (const d of windupOutDust) d.mesh.material.opacity = 0;
          for (const g of windupGather) g.mesh.material.opacity = 0;
          windupCrater.material.opacity = 0;
          windupPillar.material.opacity = launch > 0 ? (1 - launch) * 0.35 : 0;

          // Energy column anchored at the stadium floor around the bey.
          const colH = FLIGHT_COLUMN_HEIGHT * R * 0.55 * launchBoost * landFade;
          const colPulse = 0.92 + 0.08 * Math.sin(flightSpin * 3.2);
          pillarOuter.scale.set(R * 0.95 * colPulse, colH, R * 0.95 * colPulse);
          pillarOuter.position.set(0, colH * 0.5, 0);
          pillarOuter.material.opacity = (0.28 + launch * 0.22) * env;

          pillarInner.scale.set(R * 0.48 * colPulse, colH * 0.92, R * 0.48 * colPulse);
          pillarInner.position.set(0, colH * 0.48, 0);
          pillarInner.material.opacity = (0.38 + launch * 0.28) * env;

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
            setVisible(p.mesh, (0.32 + 0.28 * (1 - Math.abs(t - 0.45))) * env * wingReveal);
          }

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
            if (tier === 2) {
              billboard(wing.mesh, camera);
            } else {
              wing.mesh.rotation.set(
                -0.35 + flap + tier * 0.08,
                yaw,
                side * (0.28 + tier * 0.06)
              );
            }
            wing.mesh.material.opacity = (0.48 + tier * 0.08) * env * wingReveal;
          }

          // Dragon silhouette glow behind the hovering bey.
          dragonBackdrop.position.set(0, hoverY + 0.08, -R * 0.35);
          dragonBackdrop.rotation.set(-0.15, 0, 0);
          dragonBackdrop.scale.set(
            R * (1.35 + 0.08 * Math.sin(flightSpin * 2)),
            R * (1.05 + 0.06 * Math.sin(flightSpin * 1.6)),
            1
          );
          dragonBackdrop.material.opacity = 0.38 * env * wingReveal;

          // Pulsing hover halo at flight altitude.
          const auraPulse = 0.85 + 0.15 * Math.sin(flightSpin * 4);
          hoverAura.position.set(0, hoverY - 0.08, 0);
          hoverAura.scale.set(R * auraPulse * 1.55, R * auraPulse * 1.55, 1);
          hoverAura.material.opacity = 0.34 * env * wingReveal;

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
            em.mesh.material.opacity = 0.42 * env * wingReveal * (0.6 + 0.4 * Math.sin(em.phase * 3));
          }

          // Launch detonation + repulse — expanding shock rings + radial spark burst.
          const burstT = Math.max(launch, repulse);
          if (burstT > 0.04) {
            for (let ri = 0; ri < repulseRings.length; ri++) {
              const ring = repulseRings[ri];
              const delay = launch > 0 ? ri * 0.06 : ring.delay;
              const rate = launch > 0 ? 1.8 : 1.35;
              const wave = clamp01((burstT - delay) * rate);
              if (wave <= 0) {
                ring.mesh.material.opacity = 0;
                continue;
              }
              const rr = R * (1.1 + (1 - wave) * (launch > 0 ? 4.6 : 3.8) + ri * 0.35);
              ring.mesh.position.set(0, hoverY * 0.25 + ri * 0.08, 0);
              ring.mesh.scale.set(rr, rr, 1);
              ring.mesh.material.opacity = wave * (0.55 - ri * 0.12) * env;
            }
            for (const sp of repulseSparks) {
              const burst = burstT * (1 + sp.band * 0.12);
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

          // Lightning telegraphs + strike bolts (world-space targets).
          const spots = body.userData.ldragoLightningSpots;
          const chargeStart = LDRAGO_FLIGHT_LAUNCH_DUR;
          const chargeEnd = chargeStart + LDRAGO_LIGHTNING_CHARGE_DUR;
          const inCharge = ft >= chargeStart && ft < chargeEnd;
          const chargeProg = inCharge
            ? clamp01((ft - chargeStart) / LDRAGO_LIGHTNING_CHARGE_DUR)
            : ft >= chargeEnd ? 1 : 0;
          const chargeEase = 1 - (1 - chargeProg) * (1 - chargeProg);

          if (spots && ft >= chargeStart) {
            for (let li = 0; li < LDRAGO_LIGHTNING_COUNT; li++) {
              const spot = spots[li];
              const strike = lightningStrikes[li];
              if (!spot || !strike) continue;

              const pulse = 0.62 + 0.38 * Math.sin(flightSpin * 5 + li * 1.35);
              const cloudBase = inCharge
                ? (0.12 + chargeProg * 0.28) * pulse
                : spot.flashT > 0.02
                  ? (0.28 + spot.flashT * 0.35) * env
                  : 0.16 * pulse * env;
              const cloudScale = LDRAGO_LIGHTNING_RADIUS * (inCharge ? 0.55 + chargeEase * 0.45 : 0.75);

              strike.cloudShadows.forEach((cloud, ci) => {
                const drift = Math.sin(flightSpin * 1.8 + li + ci * 2.1) * 0.18;
                cloud.mesh.position.set(
                  spot.x + cloud.offX + drift,
                  floorY + 0.03 + ci * 0.008,
                  spot.z + cloud.offZ - drift * 0.6
                );
                const s = cloudScale * cloud.scaleBias * (0.92 + ci * 0.06);
                cloud.mesh.scale.set(s, s, 1);
                cloud.mesh.material.opacity = cloudBase * (0.75 + ci * 0.12);
                cloud.mesh.visible = cloud.mesh.material.opacity > 0.02;
              });

              // Pre-strike charge arcs — multiple flickering crawlers.
              if (inCharge && chargeProg > 0.3) {
                const arcT = (chargeProg - 0.3) / 0.7;
                const arcTop = floorY + LIGHTNING_SKY_Y * (0.3 + arcT * 0.5);
                const arcBot = floorY + 0.15;
                strike.chargeArcs.forEach((arc, ai) => {
                  const arcSpread = 0.28 + arcT * (0.4 + ai * 0.18);
                  const arcSeed = li * 19 + ai * 31 + flightSpin * 2.5;
                  const offX = boltRand(arcSeed) * arcSpread * 0.35;
                  const offZ = boltRand(arcSeed + 17) * arcSpread * 0.35;
                  setBoltPoints(
                    arc,
                    buildBoltPoints(arcSeed, spot.x + offX, spot.z + offZ, arcTop, arcBot, arcSpread)
                  );
                  arc.material.opacity = arcT * (0.22 + ai * 0.08) * pulse;
                  arc.visible = arc.material.opacity > 0.02;
                });
              } else {
                for (const arc of strike.chargeArcs) {
                  arc.visible = false;
                  arc.material.opacity = 0;
                }
              }

              if (spot.flashT > 0.02) {
                const flicker = 0.55 + 0.45 * Math.abs(Math.sin(flightSpin * 52 + li * 9.7));
                const strikePow = spot.flashT * flicker * env;
                const jitter = (1 - spot.flashT) * 0.65;
                const spread = LIGHTNING_BOLT_SPREAD + jitter;
                const seed = li * 23 + Math.floor(flightSpin * 14);
                const topY = floorY + LIGHTNING_SKY_Y;
                const botY = floorY + 0.08;

                const mainPath = buildBoltPoints(seed, spot.x, spot.z, topY, botY, spread);
                strike.mainBolts.forEach((line, bi) => {
                  const boltSpread = spread * (0.72 + bi * 0.09);
                  const offX = boltRand(seed + bi * 4.1) * spread * 0.22;
                  const offZ = boltRand(seed + bi * 6.3) * spread * 0.22;
                  setBoltPoints(
                    line,
                    buildBoltPoints(seed + bi * 7.3, spot.x + offX, spot.z + offZ, topY, botY, boltSpread)
                  );
                  const tier = bi === 0 ? 1 : bi < 3 ? 0.78 : bi < 5 ? 0.58 : 0.42;
                  line.material.opacity = strikePow * tier;
                  line.visible = line.material.opacity > 0.02;
                });

                strike.branchBolts.forEach((line, bi) => {
                  const branchStart = 3 + (bi % 5) + Math.floor(bi / 3);
                  setBoltPoints(
                    line,
                    buildBranchPoints(seed + 50 + bi * 11, mainPath, branchStart, spread * (0.65 + bi * 0.08))
                  );
                  line.material.opacity = strikePow * (0.62 - bi * 0.06);
                  line.visible = line.material.opacity > 0.02;
                });

                strike.sideBolts.forEach((line, sb) => {
                  const sideSpread = spread * (0.55 + sb * 0.06);
                  const sideX = spot.x + boltRand(seed + sb * 3.1) * (1.0 + sb * 0.22);
                  const sideZ = spot.z + boltRand(seed + sb * 5.7 + 20) * (1.0 + sb * 0.22);
                  const sideTop = floorY + LIGHTNING_SKY_Y * (0.86 + sb * 0.025);
                  setBoltPoints(
                    line,
                    buildBoltPoints(seed + 120 + sb * 9, sideX, sideZ, sideTop, botY, sideSpread)
                  );
                  line.material.opacity = strikePow * (0.48 - sb * 0.05);
                  line.visible = line.material.opacity > 0.02;
                });

                strike.skyFlash.position.set(spot.x, topY - 0.5, spot.z);
                billboard(strike.skyFlash, camera);
                strike.skyFlash.scale.set(1.4 + spot.flashT * 1.8, 0.55 + spot.flashT * 1.0, 1);
                strike.skyFlash.material.opacity = strikePow * 0.85;
                strike.skyFlash.visible = true;

                strike.skyFlashOuter.position.set(spot.x, topY - 0.2, spot.z);
                billboard(strike.skyFlashOuter, camera);
                strike.skyFlashOuter.scale.set(2.2 + spot.flashT * 2.6, 1.0 + spot.flashT * 1.4, 1);
                strike.skyFlashOuter.material.opacity = strikePow * 0.45;
                strike.skyFlashOuter.visible = true;
              } else {
                for (const group of [strike.mainBolts, strike.branchBolts, strike.sideBolts]) {
                  for (const line of group) {
                    line.visible = false;
                    line.material.opacity = 0;
                  }
                }
                strike.skyFlash.visible = false;
                strike.skyFlash.material.opacity = 0;
                strike.skyFlashOuter.visible = false;
                strike.skyFlashOuter.material.opacity = 0;
              }
            }
          } else {
            hideLightning();
          }
        }
      }
    },
    reset,
  };
}
