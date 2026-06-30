import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { STRIKER_VANISH_DUR } from '../game/abilities.js';

const TEAL = 0x14b8a6;
const TEAL_LIGHT = 0x2dd4bf;
const TEAL_PALE = 0x5eead4;
const TEAL_WHITE = 0xccfbf1;

function makeMat(color, opacity, additive = true) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

/** Teal lightning bursts for Ray Striker's vanish / reappear Lightning Sword Flash. */
export function createStrikerAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const vanishGroup = new THREE.Group();
  const dashGroup = new THREE.Group();
  root.add(vanishGroup);
  root.add(dashGroup);

  const vanishRing = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 1.0, 32),
    makeMat(TEAL_LIGHT, 0)
  );
  vanishRing.rotation.x = -Math.PI / 2;
  vanishRing.renderOrder = 8;
  vanishGroup.add(vanishRing);

  const vanishCore = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    makeMat(TEAL_WHITE, 0)
  );
  vanishCore.renderOrder = 9;
  vanishGroup.add(vanishCore);

  const vanishStreaks = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 1.8),
      makeMat(TEAL_PALE, 0)
    );
    mesh.renderOrder = 7;
    vanishGroup.add(mesh);
    vanishStreaks.push({ mesh, angle: (i / 12) * Math.PI * 2 });
  }

  const afterimage = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.35),
    makeMat(TEAL, 0, false)
  );
  afterimage.renderOrder = 4;
  vanishGroup.add(afterimage);

  const reappearRing = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 1.15, 36),
    makeMat(TEAL_WHITE, 0)
  );
  reappearRing.rotation.x = -Math.PI / 2;
  reappearRing.renderOrder = 9;
  dashGroup.add(reappearRing);

  const reappearBurst = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    makeMat(TEAL_WHITE, 0)
  );
  reappearBurst.renderOrder = 10;
  dashGroup.add(reappearBurst);

  const dashStreaks = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 2.2),
      makeMat(TEAL_PALE, 0)
    );
    mesh.renderOrder = 6;
    dashGroup.add(mesh);
    dashStreaks.push({ mesh, offset: i / 8 });
  }

  let dashSpin = 0;

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function setOpacity(mesh, opacity) {
    const show = opacity > 0.02;
    mesh.visible = show;
    mesh.material.opacity = show ? opacity : 0;
  }

  function reset() {
    root.visible = false;
    setOpacity(vanishRing, 0);
    setOpacity(vanishCore, 0);
    setOpacity(afterimage, 0);
    setOpacity(reappearRing, 0);
    setOpacity(reappearBurst, 0);
    for (const s of vanishStreaks) setOpacity(s.mesh, 0);
    for (const s of dashStreaks) setOpacity(s.mesh, 0);
    dashSpin = 0;
  }

  reset();

  return {
    update(topGroup, body, camera, dt) {
      if (!body || !camera) {
        reset();
        return;
      }

      const phase = body.userData.strikerFlashPhase;
      const vanish = body.userData.topVanish ?? 0;
      const reappear = body.userData.strikerReappearFlash ?? 0;
      const inDash = phase === 'dash' && body.userData.strikerSlamming;
      const vanishing = phase === 'vanish' || vanish > 0.02;
      const reappearing = phase === 'reappear' || reappear > 0.02;

      if (!vanishing && !reappearing && !inDash) {
        reset();
        return;
      }

      root.visible = true;
      const floorY = CONFIG.FLOOR_Y + 0.03;
      const R = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;

      if (vanishing && phase === 'vanish') {
        dashGroup.position.set(body.position.x, floorY, body.position.z);
        const vx = body.userData.strikerVanishX ?? body.position.x;
        const vz = body.userData.strikerVanishZ ?? body.position.z;
        vanishGroup.position.set(vx, floorY, vz);
        const t = clamp01((body.userData.strikerFlashPhaseT ?? 0) / STRIKER_VANISH_DUR);
        const burst = 1 - t;

        vanishRing.scale.setScalar(R * (0.8 + t * 2.4));
        setOpacity(vanishRing, burst * 0.75);

        vanishCore.position.set(0, R * 0.45, 0);
        billboard(vanishCore, camera);
        vanishCore.scale.setScalar(R * (1.1 - t * 0.55));
        setOpacity(vanishCore, burst * 0.9);

        afterimage.position.set(0, R * 0.42, 0);
        billboard(afterimage, camera);
        afterimage.scale.setScalar(R * 1.05);
        setOpacity(afterimage, (1 - t) * 0.42);

        for (const s of vanishStreaks) {
          const len = R * (1.2 + t * 2.8);
          s.mesh.position.set(
            Math.cos(s.angle) * len * 0.5,
            R * 0.35 + Math.sin(s.angle * 2) * 0.08,
            Math.sin(s.angle) * len * 0.5
          );
          s.mesh.rotation.y = s.angle;
          billboard(s.mesh, camera);
          setOpacity(s.mesh, burst * 0.55 * (0.65 + 0.35 * Math.sin(s.angle * 3)));
        }

        setOpacity(reappearRing, 0);
        setOpacity(reappearBurst, 0);
        for (const s of dashStreaks) setOpacity(s.mesh, 0);
        return;
      }

      vanishGroup.position.set(
        body.userData.strikerVanishX ?? body.position.x,
        floorY,
        body.userData.strikerVanishZ ?? body.position.z
      );
      setOpacity(vanishCore, 0);
      setOpacity(vanishRing, 0);
      setOpacity(afterimage, 0);
      for (const s of vanishStreaks) setOpacity(s.mesh, 0);

      dashGroup.position.set(body.position.x, floorY, body.position.z);
      dashSpin += dt * 9;

      if (reappearing) {
        const flash = phase === 'reappear' ? reappear : 0;
        reappearRing.scale.setScalar(R * (1.4 + (1 - flash) * 1.6));
        setOpacity(reappearRing, flash * 0.85);

        reappearBurst.position.set(0, R * 0.5, 0);
        billboard(reappearBurst, camera);
        reappearBurst.scale.setScalar(R * (0.9 + (1 - flash) * 0.5));
        setOpacity(reappearBurst, flash * 0.95);
      } else {
        setOpacity(reappearRing, 0);
        setOpacity(reappearBurst, 0);
      }

      if (inDash) {
        const nx = body.userData.strikerCoastNx ?? 0;
        const nz = body.userData.strikerCoastNz ?? 0;
        for (let i = 0; i < dashStreaks.length; i++) {
          const s = dashStreaks[i];
          const lag = s.offset * R * 1.8;
          s.mesh.position.set(-nx * lag, R * 0.4, -nz * lag);
          s.mesh.rotation.y = Math.atan2(nx, nz);
          billboard(s.mesh, camera);
          setOpacity(s.mesh, 0.45 + 0.25 * Math.sin(dashSpin * 4 + i));
        }
      } else {
        for (const s of dashStreaks) setOpacity(s.mesh, 0);
      }
    },
    reset,
  };
}
