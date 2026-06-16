import * as THREE from 'three';
import { clamp01 } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { BULL_STAMPEDE_DURATION, BULL_UPPERCUT_WINDUP, BULL_DASH_BUILD_DUR } from '../game/abilities.js';

const _pos = new THREE.Vector3();
const _lastPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _smoothVel = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _smoothDir = new THREE.Vector3();
const _right = new THREE.Vector3();

const RED_CORE = 0xdc2626;
const RED_BRIGHT = 0xef4444;
const ORANGE = 0xfb923c;
const AMBER = 0xfbbf24;
const PALE = 0xfca5a5;

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

/** Red stampede dust, uppercut gather particles, and impact bursts. */
export function createBullAbilityVfx(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const dustStreaks = [];
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 1.4),
      makeMat(ORANGE, 0.42 - i * 0.04)
    );
    mesh.visible = false;
    mesh.renderOrder = 4;
    root.add(mesh);
    dustStreaks.push(mesh);
  }

  const hoofSparks = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.14),
      makeMat(AMBER, 0)
    );
    mesh.renderOrder = 5;
    root.add(mesh);
    hoofSparks.push({ mesh, phase: (i / 6) * Math.PI * 2 });
  }

  const emberRing = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1.0, 36),
    makeMat(RED_BRIGHT, 0)
  );
  emberRing.rotation.x = -Math.PI / 2;
  emberRing.renderOrder = 3;
  root.add(emberRing);

  const gatherPool = [];
  for (let i = 0; i < 12; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.1),
      makeMat(RED_CORE, 0)
    );
    mesh.renderOrder = 6;
    root.add(mesh);
    gatherPool.push({ mesh, phase: (i / 12) * Math.PI * 2 });
  }

  const impactRing = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.72, 40),
    makeMat(AMBER, 0)
  );
  impactRing.rotation.x = -Math.PI / 2;
  impactRing.renderOrder = 8;
  root.add(impactRing);

  const debrisPool = [];
  for (let i = 0; i < 10; i++) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, 0.08),
      makeMat(ORANGE, 0)
    );
    mesh.renderOrder = 7;
    root.add(mesh);
    debrisPool.push({ mesh, angle: (i / 10) * Math.PI * 2 });
  }

  const flipBurst = new THREE.Mesh(
    new THREE.PlaneGeometry(1.0, 1.0),
    makeMat(PALE, 0)
  );
  flipBurst.renderOrder = 6;
  root.add(flipBurst);

  let hasLast = false;
  let smoothSpeed = 0;
  let impactT = 0;
  let wasStampede = false;
  let wasUpper = false;

  function billboard(mesh, camera) {
    mesh.quaternion.copy(camera.quaternion);
  }

  function reset() {
    root.visible = false;
    hasLast = false;
    smoothSpeed = 0;
    impactT = 0;
    wasStampede = false;
    wasUpper = false;
    _smoothVel.set(0, 0, 0);
    _smoothDir.set(0, 0, -1);
    for (const s of dustStreaks) s.visible = false;
    for (const sp of hoofSparks) sp.mesh.material.opacity = 0;
    emberRing.material.opacity = 0;
    impactRing.material.opacity = 0;
    for (const g of gatherPool) g.mesh.material.opacity = 0;
    for (const d of debrisPool) d.mesh.material.opacity = 0;
    flipBurst.material.opacity = 0;
  }

  reset();

  return {
    update(topGroup, body, camera, dt) {
      if (!topGroup || !body || !camera) {
        reset();
        return;
      }

      const stampeding = !!body.userData.stampeding;
      const phase = body.userData.bullUpperPhase;
      const inUpper =
        phase === 'windup' || phase === 'dash';
      const flipBurstT = body.userData.bullFlipBurstT ?? 0;

      if (!stampeding && !inUpper && flipBurstT <= 0 && impactT <= 0) {
        reset();
        return;
      }

      root.visible = true;
      topGroup.getWorldPosition(_pos);
      const R = body.userData.outerRadius ?? CONFIG.DEFAULT_OUTER_RADIUS;
      const yBase = body.position.y + (body.userData.visualYOffset ?? 0) * 0.35;

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
      } else if (body.userData.bullCoastNx != null && body.userData.bullCoastNz != null) {
        _dir.set(body.userData.bullCoastNx, 0, body.userData.bullCoastNz);
      } else if (body.velocity) {
        const len = Math.hypot(body.velocity.x, body.velocity.z);
        if (len > 0.15) _dir.set(body.velocity.x / len, 0, body.velocity.z / len);
      }
      _smoothDir.lerp(_dir, blend);
      if (_smoothDir.lengthSq() > 1e-6) _smoothDir.normalize();
      _right.crossVectors(_smoothDir, camera.up).normalize();
      if (_right.lengthSq() < 1e-4) _right.set(1, 0, 0);

      // --- Maximum Stampede ---
      if (stampeding) {
        wasStampede = true;
        const t = body.userData.stampedeT ?? 0;
        const life = clamp01(1 - t / BULL_STAMPEDE_DURATION);
        const speedFactor = clamp01(smoothSpeed / 16);
        const intensity = (0.5 + speedFactor * 0.5) * (0.4 + life * 0.6);

        const pulse = 0.55 + 0.45 * Math.sin(t * 7.5);
        emberRing.position.set(_pos.x, yBase + 0.04, _pos.z);
        emberRing.scale.setScalar(R * (1.15 + pulse * 0.35));
        emberRing.material.opacity = 0.28 * intensity * pulse;

        const streakLen = 0.8 + speedFactor * 2.0;
        const yaw = Math.atan2(_smoothDir.x, _smoothDir.z);
        for (let i = 0; i < dustStreaks.length; i++) {
          const streak = dustStreaks[i];
          const side = i % 2 === 0 ? 1 : -1;
          const offset = (Math.floor(i / 2) + 0.5) * 0.22;
          streak.visible = speedFactor > 0.06;
          if (!streak.visible) continue;
          streak.position
            .copy(_pos)
            .addScaledVector(_right, side * R * 0.55)
            .addScaledVector(_smoothDir, -offset - streakLen * 0.5);
          streak.position.y = yBase + 0.02;
          streak.rotation.set(0, yaw, 0);
          streak.scale.set(1, streakLen, 1);
          streak.material.opacity = Math.max(0.05, (0.38 - i * 0.03) * intensity);
        }

        for (const sp of hoofSparks) {
          sp.phase += dt * (8 + speedFactor * 6);
          const side = Math.sin(sp.phase) > 0 ? 1 : -1;
          sp.mesh.position
            .copy(_pos)
            .addScaledVector(_right, side * R * 0.72)
            .addScaledVector(_smoothDir, -0.35);
          sp.mesh.position.y = yBase + 0.06 + Math.abs(Math.sin(sp.phase * 2)) * 0.08;
          billboard(sp.mesh, camera);
          sp.mesh.material.opacity = speedFactor > 0.1 ? 0.35 * intensity : 0;
        }
      } else if (wasStampede) {
        emberRing.material.opacity *= 0.85;
        if (emberRing.material.opacity < 0.02) wasStampede = false;
      }

      // --- Red Horn Uppercut ---
      if (inUpper) {
        wasUpper = true;
        const phaseT = body.userData.bullUpperPhaseT ?? 0;

        if (phase === 'windup') {
          for (let i = 0; i < gatherPool.length; i++) {
            const g = gatherPool[i];
            const tr = g.phase + phaseT * 4;
            const orbit = R * (1.8 - clamp01(phaseT / BULL_UPPERCUT_WINDUP) * 1.1);
            g.mesh.position.set(
              _pos.x + Math.cos(tr) * orbit,
              yBase + 0.2 + Math.sin(tr * 2) * 0.1,
              _pos.z + Math.sin(tr) * orbit
            );
            billboard(g.mesh, camera);
            g.mesh.material.opacity = 0.25 + 0.35 * Math.sin(tr * 3);
          }
          for (const s of dustStreaks) s.visible = false;
        } else if (phase === 'dash') {
          for (const g of gatherPool) g.mesh.material.opacity = 0;
          const build = clamp01(phaseT / BULL_DASH_BUILD_DUR);
          const intensity = 0.35 + build * 0.45;
          const streakLen = 0.9 + build * 1.4;
          const yaw = Math.atan2(_smoothDir.x, _smoothDir.z);
          for (let i = 0; i < dustStreaks.length; i++) {
            const streak = dustStreaks[i];
            const side = i % 2 === 0 ? 1 : -1;
            const offset = (Math.floor(i / 2) + 0.5) * 0.2;
            streak.visible = true;
            streak.position
              .copy(_pos)
              .addScaledVector(_right, side * R * 0.5)
              .addScaledVector(_smoothDir, -offset - streakLen * 0.5);
            streak.position.y = yBase + 0.03;
            streak.rotation.set(0, yaw, 0);
            streak.scale.set(1, streakLen, 1);
            streak.material.opacity = Math.max(0.06, (0.32 - i * 0.025) * intensity);
          }
          emberRing.position.set(_pos.x, yBase + 0.04, _pos.z);
          emberRing.scale.setScalar(R * (1.1 + build * 0.2));
          emberRing.material.opacity = 0.18 * intensity;
        } else {
          for (const g of gatherPool) g.mesh.material.opacity = 0;
          for (const s of dustStreaks) s.visible = false;
        }
      } else if (wasUpper && !stampeding) {
        emberRing.material.opacity *= 0.88;
        if (emberRing.material.opacity < 0.02) wasUpper = false;
      }

      if (body.userData.bullImpactFlash) {
        impactT = 0.22;
        const ix = body.userData.bullImpactX ?? _pos.x;
        const iz = body.userData.bullImpactZ ?? _pos.z;
        impactRing.position.set(ix, yBase + 0.08, iz);
        impactRing.scale.setScalar(R * 2.2);
        impactRing.material.opacity = 0.75;

        for (const d of debrisPool) {
          const spread = R * 1.6;
          d.mesh.position.set(
            ix + Math.cos(d.angle) * spread,
            yBase + 0.1 + Math.sin(d.angle * 3) * 0.15,
            iz + Math.sin(d.angle) * spread
          );
          billboard(d.mesh, camera);
          d.mesh.material.opacity = 0.55;
        }
      }

      if (impactT > 0) {
        impactT -= dt;
        const fade = clamp01(impactT / 0.22);
        impactRing.material.opacity = Math.max(impactRing.material.opacity, 0) * fade;
        for (const d of debrisPool) {
          d.mesh.material.opacity *= fade;
        }
      }

      if (flipBurstT > 0) {
        flipBurst.position.copy(_pos);
        flipBurst.position.y = yBase + 0.25;
        billboard(flipBurst, camera);
        const f = clamp01(flipBurstT);
        flipBurst.scale.setScalar(R * (1.2 + (1 - f) * 0.8));
        flipBurst.material.opacity = 0.5 * f;
      } else {
        flipBurst.material.opacity = 0;
      }
    },
    reset,
  };
}
