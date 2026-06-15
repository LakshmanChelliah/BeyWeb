import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';

const _pos = new THREE.Vector3();
const _lastPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _smoothVel = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _smoothDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _ghostPos = new THREE.Vector3();
const _hint = new THREE.Vector3();

const HISTORY_LEN = 18;

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

/** Speed lines, blue afterimages, and ribbon trail during Star Blast. */
export function createStarBlastVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const ghosts = [];
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 2.15),
      makeTrailMat(0x7dd3fc, 0.38 - i * 0.065)
    );
    mesh.visible = false;
    mesh.renderOrder = 4;
    root.add(mesh);
    ghosts.push(mesh);
  }

  const streaks = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 2.2),
      makeTrailMat(0xbae6fd, 0.55 - i * 0.035)
    );
    mesh.visible = false;
    mesh.renderOrder = 5;
    root.add(mesh);
    streaks.push(mesh);
  }

  const ribbon = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 3.6),
    makeTrailMat(0x38bdf8, 0.28)
  );
  ribbon.visible = false;
  ribbon.renderOrder = 3;
  root.add(ribbon);

  const core = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    makeTrailMat(0xe0f2fe, 0.45)
  );
  core.visible = false;
  core.renderOrder = 6;
  root.add(core);

  const history = Array.from({ length: HISTORY_LEN }, () => new THREE.Vector3());
  let historyCount = 0;
  let hasLast = false;
  let smoothSpeed = 0;

  function phaseHint(body, phase, out) {
    out.set(0, 0, 0);
    if (phase === 'ascend') {
      out.y = 26;
    } else if (phase === 'dive') {
      out.y = -30;
    } else if (phase === 'dash') {
      const nx = body.userData.starWallNx ?? 0;
      const nz = body.userData.starWallNz ?? 0;
      out.set(-nx * 32, 0, -nz * 32);
    }
  }

  function phaseStyle(phase) {
    if (phase === 'ascend') return { tint: 0x7dd3fc, intensity: 1.1, ribbon: 1.25 };
    if (phase === 'dive') return { tint: 0xbae6fd, intensity: 1.35, ribbon: 1.5 };
    return { tint: 0x60a5fa, intensity: 1.0, ribbon: 1.0 };
  }

  function reset() {
    root.visible = false;
    historyCount = 0;
    hasLast = false;
    smoothSpeed = 0;
    _smoothVel.set(0, 0, 0);
    _smoothDir.set(0, 0, -1);
    for (const g of ghosts) g.visible = false;
    for (const s of streaks) s.visible = false;
    ribbon.visible = false;
    core.visible = false;
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

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const phase = body.userData.starPhase;
      const active = phase === 'dash' || phase === 'ascend' || phase === 'dive';
      if (!active) {
        reset();
        return;
      }

      root.visible = true;
      topGroup.getWorldPosition(_pos);

      if (hasLast) {
        _vel.subVectors(_pos, _lastPos).divideScalar(Math.max(dt, 0.001));
      } else {
        _vel.set(0, 0, 0);
        hasLast = true;
      }
      _lastPos.copy(_pos);

      phaseHint(body, phase, _hint);
      if (_vel.length() < 10 && _hint.lengthSq() > 0) {
        _vel.lerp(_hint, phase === 'dash' ? 0.62 : 0.78);
      }

      const blend = 1 - Math.exp(-16 * dt);
      _smoothVel.lerp(_vel, blend);
      smoothSpeed += (_smoothVel.length() - smoothSpeed) * blend;

      if (_smoothVel.lengthSq() > 0.25) {
        _dir.copy(_smoothVel).normalize();
      } else if (_hint.lengthSq() > 0) {
        _dir.copy(_hint).normalize();
      }
      _smoothDir.lerp(_dir, blend);
      if (_smoothDir.lengthSq() > 1e-6) _smoothDir.normalize();

      for (let i = Math.min(historyCount, HISTORY_LEN - 1); i > 0; i--) {
        history[i].copy(history[i - 1]);
      }
      history[0].copy(_pos);
      historyCount = Math.min(historyCount + 1, HISTORY_LEN);

      const style = phaseStyle(phase);
      const lift = body.userData.flightLift ?? 0;
      const speedFactor = clamp01(smoothSpeed / 28);
      const intensity = style.intensity * (0.55 + speedFactor * 0.55 + Math.min(lift, 38) / 38 * 0.2);

      _right.crossVectors(_smoothDir, camera.up).normalize();
      if (_right.lengthSq() < 1e-4) _right.set(1, 0, 0);

      for (let i = 0; i < ghosts.length; i++) {
        const ghost = ghosts[i];
        const t = (i + 1) / (ghosts.length + 0.5);
        sampleHistory(t * 0.85, _ghostPos);
        ghost.visible = historyCount > 2;
        if (!ghost.visible) continue;

        ghost.position.copy(_ghostPos).addScaledVector(_smoothDir, -t * 1.4);
        billboard(ghost, camera);
        const s = topGroup.scale.x * (0.94 - t * 0.14);
        ghost.scale.set(s, s, s);
        ghost.material.color.setHex(style.tint);
        ghost.material.opacity = Math.max(0.04, (0.4 - t * 0.34) * intensity);
      }

      const streakLen = 0.85 + speedFactor * 2.4 * style.ribbon;
      const yaw = Math.atan2(_smoothDir.x, _smoothDir.z);
      const pitch = -Math.asin(Math.max(-1, Math.min(1, _smoothDir.y)));

      for (let i = 0; i < streaks.length; i++) {
        const streak = streaks[i];
        const t = i / (streaks.length - 1);
        const show = smoothSpeed > 0.8 || phase !== 'dash';
        streak.visible = show;
        if (!show) continue;

        const back = 0.35 + t * 3.2;
        const fan = (i - (streaks.length - 1) * 0.5) * 0.11;
        streak.position.copy(_pos);
        streak.position.addScaledVector(_smoothDir, -back);
        streak.position.addScaledVector(_right, fan);
        streak.rotation.order = 'YXZ';
        streak.rotation.y = yaw;
        streak.rotation.x = pitch * 0.65;
        streak.rotation.z = fan * 0.35;
        streak.scale.set(1, streakLen * (1 - t * 0.35), 1);
        streak.material.color.setHex(style.tint);
        streak.material.opacity = Math.max(0.05, (0.58 - t * 0.48) * intensity);
      }

      const ribbonShow = smoothSpeed > 1.2 || phase === 'ascend' || phase === 'dive';
      ribbon.visible = ribbonShow;
      if (ribbonShow) {
        ribbon.position.copy(_pos).addScaledVector(_smoothDir, -1.15);
        ribbon.scale.set(0.8 + speedFactor * 0.55, 1.15 + speedFactor * 1.7 * style.ribbon, 1);
        ribbon.material.color.setHex(style.tint);
        ribbon.material.opacity = 0.14 + speedFactor * 0.22 * intensity;
        billboard(ribbon, camera);
      }

      core.visible = true;
      core.position.copy(_pos);
      billboard(core, camera);
      core.scale.setScalar(topGroup.scale.x * (0.55 + speedFactor * 0.35));
      core.material.color.setHex(0xe0f2fe);
      core.material.opacity = 0.18 + speedFactor * 0.35 * intensity;
    },
    reset,
  };
}
