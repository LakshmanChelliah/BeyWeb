import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';

const _pos = new THREE.Vector3();
const _lastPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _smoothVel = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _smoothDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _ghostPos = new THREE.Vector3();

const BLUE_CORE = 0x60a5fa;
const BLUE_LIGHT = 0x7dd3fc;
const BLUE_PALE = 0xbae6fd;
const BLUE_WHITE = 0xe0f2fe;

const BOOST_DUR = 3;
const HISTORY_LEN = 14;

function makeTrailMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Blue speed lines, afterimages, and orbit sparks during Pegasus Speed Boost. */
export function createPegasusSpeedBoostVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const ghosts = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      makeTrailMat(BLUE_LIGHT, 0.34 - i * 0.07)
    );
    mesh.visible = false;
    mesh.renderOrder = 4;
    root.add(mesh);
    ghosts.push(mesh);
  }

  const streaks = [];
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.04, 1.6),
      makeTrailMat(BLUE_PALE, 0.5 - i * 0.04)
    );
    mesh.visible = false;
    mesh.renderOrder = 5;
    root.add(mesh);
    streaks.push(mesh);
  }

  const sparks = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 0.12),
      makeTrailMat(BLUE_WHITE, 0)
    );
    mesh.renderOrder = 6;
    root.add(mesh);
    sparks.push({ mesh, phase: (i / 8) * Math.PI * 2 });
  }

  const core = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.2),
    makeTrailMat(BLUE_WHITE, 0)
  );
  core.renderOrder = 7;
  root.add(core);

  const burstRing = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.0, 40),
    makeTrailMat(BLUE_CORE, 0)
  );
  burstRing.rotation.x = -Math.PI / 2;
  burstRing.renderOrder = 3;
  root.add(burstRing);

  const history = Array.from({ length: HISTORY_LEN }, () => new THREE.Vector3());
  let historyCount = 0;
  let hasLast = false;
  let smoothSpeed = 0;
  let wasBoosting = false;

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function reset() {
    root.visible = false;
    historyCount = 0;
    hasLast = false;
    smoothSpeed = 0;
    wasBoosting = false;
    _smoothVel.set(0, 0, 0);
    _smoothDir.set(0, 0, -1);
    for (const g of ghosts) g.visible = false;
    for (const s of streaks) s.visible = false;
    for (const sp of sparks) sp.mesh.material.opacity = 0;
    core.material.opacity = 0;
    burstRing.material.opacity = 0;
  }

  function sampleHistory(t, target) {
    if (historyCount < 2) {
      target.copy(_pos);
      return;
    }
    const maxIdx = historyCount - 1;
    const f = t * maxIdx;
    const i0 = Math.floor(f);
    const i1 = Math.min(i0 + 1, maxIdx);
    const frac = f - i0;
    target.lerpVectors(history[i0], history[i1], frac);
  }

  reset();

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const boosting = !!body.userData.boosting;
      if (!boosting) {
        reset();
        return;
      }

      if (!wasBoosting) {
        body.userData.boostT = 0;
        historyCount = 0;
        hasLast = false;
      }
      wasBoosting = true;
      body.userData.boostT = (body.userData.boostT ?? 0) + dt;

      root.visible = true;
      topGroup.getWorldPosition(_pos);

      if (hasLast) {
        _vel.subVectors(_pos, _lastPos).divideScalar(Math.max(dt, 0.001));
      } else {
        _vel.set(body.velocity.x, 0, body.velocity.z);
        hasLast = true;
      }
      _lastPos.copy(_pos);

      const blend = 1 - Math.exp(-14 * dt);
      _smoothVel.lerp(_vel, blend);
      smoothSpeed += (_smoothVel.length() - smoothSpeed) * blend;

      if (_smoothVel.lengthSq() > 0.2) {
        _dir.copy(_smoothVel).normalize();
      } else if (body.velocity) {
        const vx = body.velocity.x;
        const vz = body.velocity.z;
        const len = Math.hypot(vx, vz);
        if (len > 0.15) _dir.set(vx / len, 0, vz / len);
      }
      _smoothDir.lerp(_dir, blend);
      if (_smoothDir.lengthSq() > 1e-6) _smoothDir.normalize();

      for (let i = Math.min(historyCount, HISTORY_LEN - 1); i > 0; i--) {
        history[i].copy(history[i - 1]);
      }
      history[0].copy(_pos);
      historyCount = Math.min(historyCount + 1, HISTORY_LEN);

      const boostT = body.userData.boostT ?? 0;
      const life = clamp01(1 - boostT / BOOST_DUR);
      const speedFactor = clamp01(smoothSpeed / 18);
      const intensity = (0.55 + speedFactor * 0.55) * (0.35 + life * 0.65);

      // Activation burst — tight ring at the bey, fades in ~0.35s.
      if (boostT < 0.38) {
        const t = boostT / 0.38;
        const e = 1 - (1 - t) * (1 - t);
        const R = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
        burstRing.position.copy(_pos);
        burstRing.position.y = body.position.y + (body.userData.visualYOffset ?? 0) * 0.5;
        burstRing.scale.setScalar(R * (1 + e * 2.2));
        burstRing.material.opacity = 0.45 * (1 - t);
      } else {
        burstRing.material.opacity = 0;
      }

      _right.crossVectors(_smoothDir, camera.up).normalize();
      if (_right.lengthSq() < 1e-4) _right.set(1, 0, 0);

      // Afterimage ghosts.
      for (let i = 0; i < ghosts.length; i++) {
        const ghost = ghosts[i];
        const t = (i + 1) / (ghosts.length + 0.5);
        sampleHistory(t * 0.75, _ghostPos);
        ghost.visible = historyCount > 2 && speedFactor > 0.08;
        if (!ghost.visible) continue;

        ghost.position.copy(_ghostPos).addScaledVector(_smoothDir, -t * 1.1);
        billboard(ghost, camera);
        const s = topGroup.scale.x * (0.9 - t * 0.14);
        ghost.scale.set(s, s, s);
        ghost.material.opacity = Math.max(0.04, (0.36 - t * 0.3) * intensity);
      }

      // Speed lines behind the bey.
      const streakLen = 0.7 + speedFactor * 2.1;
      const yaw = Math.atan2(_smoothDir.x, _smoothDir.z);
      const showStreaks = smoothSpeed > 0.6 || speedFactor > 0.05;

      for (let i = 0; i < streaks.length; i++) {
        const streak = streaks[i];
        const t = i / (streaks.length - 1);
        streak.visible = showStreaks;
        if (!showStreaks) continue;

        const back = 0.3 + t * 2.6;
        const fan = (i - (streaks.length - 1) * 0.5) * 0.09;
        streak.position.copy(_pos);
        streak.position.addScaledVector(_smoothDir, -back);
        streak.position.addScaledVector(_right, fan);
        streak.rotation.order = 'YXZ';
        streak.rotation.y = yaw;
        streak.rotation.z = fan * 0.3;
        streak.scale.set(1, streakLen * (1 - t * 0.35), 1);
        streak.material.opacity = Math.max(0.05, (0.52 - t * 0.44) * intensity);
      }

      // Orbit sparks — always visible while boosting, faster when moving.
      const R = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const yBase = body.position.y + (body.userData.visualYOffset ?? 0)
        + (body.userData.flightLift ?? 0);
      const orbitRate = 5 + speedFactor * 8;

      for (const sp of sparks) {
        sp.phase += dt * orbitRate;
        const orbitR = R * (1.15 + 0.12 * Math.sin(sp.phase * 2));
        const lift = 0.15 + Math.sin(sp.phase * 1.5) * 0.12;
        sp.mesh.position.set(
          _pos.x + Math.cos(sp.phase) * orbitR,
          yBase + lift,
          _pos.z + Math.sin(sp.phase) * orbitR
        );
        billboard(sp.mesh, camera);
        sp.mesh.material.opacity = (0.22 + speedFactor * 0.28) * life;
        sp.mesh.scale.setScalar(0.7 + speedFactor * 0.5);
      }

      // Core shimmer on the disc.
      core.position.copy(_pos);
      core.position.y = yBase;
      billboard(core, camera);
      core.scale.setScalar(topGroup.scale.x * (0.45 + speedFactor * 0.25));
      core.material.opacity = (0.12 + speedFactor * 0.22) * life;
    },
    reset,
  };
}
