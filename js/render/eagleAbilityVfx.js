import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';

const _pos = new THREE.Vector3();
const _lastPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _dir = new THREE.Vector3(0, -1, 0);
const _right = new THREE.Vector3(1, 0, 0);

function makeMat(color, opacity, { additive = true, doubleSide = true } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

function billboard(mesh, camera) {
  mesh.quaternion.copy(camera.quaternion);
}

export function createEagleAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const counterRing = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.16, 48),
    makeMat(0xfbbf24, 0.45)
  );
  counterRing.rotation.x = -Math.PI / 2;
  counterRing.visible = false;
  root.add(counterRing);

  const counterBurst = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 1.36, 32),
    makeMat(0x7c3aed, 0.0)
  );
  counterBurst.rotation.x = -Math.PI / 2;
  counterBurst.visible = false;
  root.add(counterBurst);

  const talons = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 2.75),
      makeMat(i === 1 ? 0xfef3c7 : 0xf59e0b, 0.62)
    );
    mesh.visible = false;
    mesh.renderOrder = 6;
    root.add(mesh);
    talons.push(mesh);
  }

  const diveCore = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8),
    makeMat(0xfef3c7, 0.35)
  );
  diveCore.visible = false;
  diveCore.renderOrder = 5;
  root.add(diveCore);

  let hasLast = false;
  let spinT = 0;

  function reset() {
    root.visible = false;
    counterRing.visible = false;
    counterBurst.visible = false;
    diveCore.visible = false;
    for (const t of talons) t.visible = false;
    hasLast = false;
    _vel.set(0, 0, 0);
  }

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const counterActive = !!body.userData.counterStance;
      const counterFlash = body.userData.eagleCounterFlashT ?? 0;
      const divePhase = body.userData.eagleDivePhase;
      const diving = divePhase === 'ascend' || divePhase === 'hover' || divePhase === 'dive';
      const impact = body.userData.eagleImpactFlash ? 1 : 0;

      if (!counterActive && counterFlash <= 0 && !diving && !impact && !body.userData.eagleDiveWindup) {
        reset();
        return;
      }

      root.visible = true;
      topGroup.getWorldPosition(_pos);
      spinT += dt;

      if (hasLast) {
        _vel.subVectors(_pos, _lastPos).divideScalar(Math.max(dt, 0.001));
      } else {
        _vel.set(0, 0, 0);
        hasLast = true;
      }
      _lastPos.copy(_pos);

      if (_vel.lengthSq() > 0.25) {
        _dir.copy(_vel).normalize();
      } else if (divePhase === 'dive') {
        _dir.set(0, -1, 0);
      } else {
        _dir.set(0, 1, 0);
      }
      _right.crossVectors(_dir, camera.up).normalize();
      if (_right.lengthSq() < 1e-4) _right.set(1, 0, 0);

      const radius = body.userData.outerRadius ?? 1.6;
      counterRing.visible = counterActive;
      if (counterActive) {
        const pulse = 0.5 + 0.5 * Math.sin(spinT * 15);
        counterRing.position.set(body.position.x, body.position.y + 0.08, body.position.z);
        counterRing.scale.setScalar(radius * (1.08 + pulse * 0.08));
        counterRing.material.opacity = 0.22 + pulse * 0.24;
        counterRing.rotation.z -= dt * 3.5;
      }

      counterBurst.visible = counterFlash > 0;
      if (counterFlash > 0) {
        const t = 1 - clamp01(counterFlash);
        counterBurst.position.set(body.position.x, body.position.y + 0.12, body.position.z);
        counterBurst.scale.setScalar(radius * (1.0 + t * 1.7));
        counterBurst.material.opacity = 0.42 * counterFlash;
        counterBurst.rotation.z += dt * 8;
      }

      const showTalons = diving || body.userData.eagleDiveWindup;
      for (let i = 0; i < talons.length; i++) {
        const talon = talons[i];
        talon.visible = showTalons;
        if (!showTalons) continue;
        const fan = (i - 1) * 0.34;
        const back = divePhase === 'dive' ? 1.35 + i * 0.16 : -0.35 - i * 0.08;
        talon.position.copy(_pos)
          .addScaledVector(_dir, -back)
          .addScaledVector(_right, fan);
        billboard(talon, camera);
        const speed = clamp01(_vel.length() / 26);
        const phaseBoost = divePhase === 'dive' ? 1.3 : 0.8;
        talon.scale.set(1, phaseBoost + speed * 1.4, 1);
        talon.material.opacity = (0.28 + speed * 0.42) * (divePhase === 'hover' ? 0.65 : 1);
      }

      diveCore.visible = diving || impact > 0;
      if (diveCore.visible) {
        diveCore.position.copy(_pos);
        billboard(diveCore, camera);
        const lift = body.userData.flightLift ?? 0;
        const impactScale = impact ? 1.65 : 0.65 + clamp01(lift / 24) * 0.45;
        diveCore.scale.setScalar(topGroup.scale.x * impactScale);
        diveCore.material.opacity = impact ? 0.52 : 0.16 + clamp01(lift / 24) * 0.18;
      }
    },
    reset,
  };
}
