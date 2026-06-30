import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';

const _pos = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _lastProj = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _smoothVel = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _smoothDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _ghostPos = new THREE.Vector3();

const HISTORY_LEN = 14;

const PURPLE = 0x5b21d9;
const PURPLE_BRIGHT = 0x9333ea;
const PURPLE_PALE = 0xc4b5fd;
const VIOLET_GLOW = 0x7c3aed;

function makeMat(color, opacity, { additive = true } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function makeTrailMat(color, opacity) {
  return makeMat(color, opacity, { additive: true });
}

function projWorldPos(body, out) {
  const floor = CONFIG.FLOOR_Y + (body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS) + CONFIG.FLOOR_EPSILON;
  out.set(
    body.userData.darkMoveProjX ?? body.position.x,
    floor + (body.userData.darkMoveProjLift ?? 0),
    body.userData.darkMoveProjZ ?? body.position.z
  );
}

/** Purple orb, sky beam, and Star-Blast-style dive projectiles for Dark Move. */
export function createDarkMoveVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 18),
    makeMat(PURPLE, 0.22, { additive: false })
  );
  orb.visible = false;
  orb.renderOrder = 8;
  root.add(orb);

  const orbCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 16, 12),
    makeMat(VIOLET_GLOW, 0.35)
  );
  orbCore.visible = false;
  orbCore.renderOrder = 9;
  root.add(orbCore);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.55, 1, 12, 1, true),
    makeMat(PURPLE_BRIGHT, 0.42)
  );
  beam.visible = false;
  beam.renderOrder = 6;
  root.add(beam);

  const beamCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 1, 8, 1, true),
    makeMat(PURPLE_PALE, 0.55)
  );
  beamCore.visible = false;
  beamCore.renderOrder = 7;
  root.add(beamCore);

  const strikeGhosts = [];
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      makeTrailMat(PURPLE_BRIGHT, 0.36 - i * 0.06)
    );
    mesh.visible = false;
    mesh.renderOrder = 4;
    root.add(mesh);
    strikeGhosts.push(mesh);
  }

  const strikeStreaks = [];
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 2.1),
      makeTrailMat(PURPLE_PALE, 0.52 - i * 0.038)
    );
    mesh.visible = false;
    mesh.renderOrder = 5;
    root.add(mesh);
    strikeStreaks.push(mesh);
  }

  const strikeRibbon = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 3.2),
    makeTrailMat(VIOLET_GLOW, 0.26)
  );
  strikeRibbon.visible = false;
  strikeRibbon.renderOrder = 3;
  root.add(strikeRibbon);

  const strikeCore = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, 1.45),
    makeTrailMat(0xe9d5ff, 0.48)
  );
  strikeCore.visible = false;
  strikeCore.renderOrder = 6;
  root.add(strikeCore);

  const history = Array.from({ length: HISTORY_LEN }, () => new THREE.Vector3());
  let historyCount = 0;
  let hasLastProj = false;
  let smoothSpeed = 0;

  function reset() {
    root.visible = false;
    orb.visible = false;
    orbCore.visible = false;
    beam.visible = false;
    beamCore.visible = false;
    strikeRibbon.visible = false;
    strikeCore.visible = false;
    for (const g of strikeGhosts) g.visible = false;
    for (const s of strikeStreaks) s.visible = false;
    historyCount = 0;
    hasLastProj = false;
    smoothSpeed = 0;
    _smoothVel.set(0, 0, 0);
    _smoothDir.set(0, -1, 0);
  }

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function sampleHistory(t, target) {
    if (historyCount < 2) {
      target.copy(_proj);
      return;
    }
    const maxIdx = historyCount - 1;
    const f = t * maxIdx;
    const i0 = Math.floor(f);
    const i1 = Math.min(i0 + 1, maxIdx);
    const frac = f - i0;
    target.lerpVectors(history[i0], history[i1], frac);
  }

  function updateStrikeProjectile(topGroup, body, camera, dt) {
    const strikePhase = body.userData.darkMovePhase === 'strike';
    const diving = strikePhase && body.userData.darkMoveStrikeSub === 'dive';
    const diveT = body.userData.darkMoveStrikeDiveT ?? 0;
    if (!diving || diveT <= 0.01) {
      strikeRibbon.visible = false;
      strikeCore.visible = false;
      for (const g of strikeGhosts) g.visible = false;
      for (const s of strikeStreaks) s.visible = false;
      historyCount = 0;
      hasLastProj = false;
      return;
    }

    projWorldPos(body, _proj);

    if (hasLastProj) {
      _vel.subVectors(_proj, _lastProj).divideScalar(Math.max(dt, 0.001));
    } else {
      _vel.set(0, -28, 0);
      hasLastProj = true;
    }
    _lastProj.copy(_proj);

    if (_vel.lengthSq() < 0.5) _vel.set(0, -30, 0);
    const blend = 1 - Math.exp(-16 * dt);
    _smoothVel.lerp(_vel, blend);
    smoothSpeed += (_smoothVel.length() - smoothSpeed) * blend;

    if (_smoothVel.lengthSq() > 0.25) {
      _dir.copy(_smoothVel).normalize();
    } else {
      _dir.set(0, -1, 0);
    }
    _smoothDir.lerp(_dir, blend);
    if (_smoothDir.lengthSq() > 1e-6) _smoothDir.normalize();

    for (let i = Math.min(historyCount, HISTORY_LEN - 1); i > 0; i--) {
      history[i].copy(history[i - 1]);
    }
    history[0].copy(_proj);
    historyCount = Math.min(historyCount + 1, HISTORY_LEN);

    const scale = topGroup.scale.x;
    const speedFactor = clamp01(smoothSpeed / 28);
    const intensity = 1.25 * (0.55 + speedFactor * 0.55);

    _right.crossVectors(_smoothDir, camera.up).normalize();
    if (_right.lengthSq() < 1e-4) _right.set(1, 0, 0);

    for (let i = 0; i < strikeGhosts.length; i++) {
      const ghost = strikeGhosts[i];
      const t = (i + 1) / (strikeGhosts.length + 0.5);
      sampleHistory(t * 0.82, _ghostPos);
      ghost.visible = historyCount > 2;
      if (!ghost.visible) continue;
      ghost.position.copy(_ghostPos).addScaledVector(_smoothDir, -t * 1.2);
      billboard(ghost, camera);
      const s = scale * (0.9 - t * 0.12);
      ghost.scale.set(s, s, s);
      ghost.material.opacity = Math.max(0.04, (0.38 - t * 0.32) * intensity);
    }

    const streakLen = 0.85 + speedFactor * 2.3;
    const yaw = Math.atan2(_smoothDir.x, _smoothDir.z);
    const pitch = -Math.asin(Math.max(-1, Math.min(1, _smoothDir.y)));

    for (let i = 0; i < strikeStreaks.length; i++) {
      const streak = strikeStreaks[i];
      const t = i / (strikeStreaks.length - 1);
      streak.visible = true;
      const back = 0.35 + t * 2.8;
      const fan = (i - (strikeStreaks.length - 1) * 0.5) * 0.09;
      streak.position.copy(_proj);
      streak.position.addScaledVector(_smoothDir, -back);
      streak.position.addScaledVector(_right, fan);
      streak.rotation.order = 'YXZ';
      streak.rotation.y = yaw;
      streak.rotation.x = pitch * 0.65;
      streak.rotation.z = fan * 0.35;
      streak.scale.set(1, streakLen * (1 - t * 0.35), 1);
      streak.material.opacity = Math.max(0.05, (0.55 - t * 0.48) * intensity);
    }

    strikeRibbon.visible = true;
    strikeRibbon.position.copy(_proj).addScaledVector(_smoothDir, -1.05);
    strikeRibbon.scale.set(0.75 + speedFactor * 0.5, 1.1 + speedFactor * 1.6, 1);
    strikeRibbon.material.opacity = 0.14 + speedFactor * 0.22 * intensity;
    billboard(strikeRibbon, camera);

    strikeCore.visible = true;
    strikeCore.position.copy(_proj);
    billboard(strikeCore, camera);
    strikeCore.scale.setScalar(scale * (0.52 + speedFactor * 0.34));
    strikeCore.material.opacity = 0.2 + speedFactor * 0.38 * intensity;
  }

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const phase = body.userData.darkMovePhase;
      const windup = body.userData.darkMoveWindup;
      const active =
        windup ||
        phase === 'rise' ||
        phase === 'beam' ||
        phase === 'strike' ||
        phase === 'descend';
      if (!active) {
        reset();
        return;
      }

      root.visible = true;
      topGroup.getWorldPosition(_pos);
      const lift = body.userData.flightLift ?? 0;
      _pos.y += lift;

      const scale = topGroup.scale.x;
      const r = (body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS) * scale * 1.35;
      const orbFade = body.userData.darkMoveOrbFade ?? 0;
      const orbAlpha = phase === 'descend' ? 1 - orbFade : clamp01((body.userData.darkMoveOrbT ?? 0) / 0.35);

      if (windup || (phase && orbFade < 0.98)) {
        orb.visible = true;
        orbCore.visible = true;
        orb.position.copy(_pos);
        orbCore.position.copy(_pos);
        const pulse = 1 + Math.sin((body.userData.darkMoveOrbT ?? 0) * 4.5) * 0.06;
        orb.scale.setScalar(r * pulse);
        orbCore.scale.setScalar(r * 0.62 * pulse);
        orb.material.opacity = Math.max(0, 0.22 * orbAlpha);
        orbCore.material.opacity = Math.max(0, 0.38 * orbAlpha);
        billboard(orb, camera);
        billboard(orbCore, camera);
      } else {
        orb.visible = false;
        orbCore.visible = false;
      }

      const beamOn = body.userData.darkMoveBeamActive;
      if (beamOn) {
        const t = clamp01((body.userData.darkMovePhaseT ?? 0) / 0.65);
        const beamH = 12 + t * 28;
        beam.visible = true;
        beamCore.visible = true;
        beam.position.copy(_pos);
        beam.position.y += beamH * 0.5;
        beamCore.position.copy(beam.position);
        beam.scale.set(r * 0.5, beamH, r * 0.5);
        beamCore.scale.set(r * 0.18, beamH * 1.02, r * 0.18);
        beam.material.opacity = 0.25 + t * 0.28;
        beamCore.material.opacity = 0.35 + t * 0.35;
      } else {
        beam.visible = false;
        beamCore.visible = false;
      }

      updateStrikeProjectile(topGroup, body, camera, dt);
    },
    reset,
  };
}
