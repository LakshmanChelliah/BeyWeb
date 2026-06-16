import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { fitColliderToModel } from '../physics/top.js';

const gltfLoader = new GLTFLoader();

function orientSpinAxisToY(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());

  if (size.y < size.x * 0.75 && size.y < size.z * 0.75) return;

  if (size.x < size.y * 0.75 && size.x < size.z * 0.75) {
    object.rotation.z = Math.PI / 2;
    return;
  }

  if (size.z < size.x * 0.75 && size.z < size.y * 0.75) {
    object.rotation.x = -Math.PI / 2;
    return;
  }

  object.rotation.x = -Math.PI / 2;
}

function centerModelOnAxis(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.set(-center.x, -center.y, -center.z);
}

export function createFallbackTopMesh(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.25 });
  const r = CONFIG.DEFAULT_OUTER_RADIUS;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.85, r, CONFIG.TOP_HEIGHT * 0.55, 20),
    mat
  );
  body.position.y = CONFIG.TOP_HEIGHT * 0.12;
  body.castShadow = true;
  const tip = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.35, r * 0.7, CONFIG.TOP_HEIGHT * 0.35, 16),
    mat
  );
  tip.position.y = CONFIG.TOP_HEIGHT * 0.45;
  tip.castShadow = true;
  group.add(body, tip);
  return group;
}

export function loadTopModel(url, fallbackColor, parentGroup, physicsBody, onReady) {
  gltfLoader.load(
    url,
    (gltf) => {
      const model = gltf.scene;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            if (!mat) continue;
            if (child.geometry?.attributes?.color) mat.vertexColors = true;
            if (/libra/i.test(url)) {
              mat.metalness = 0.12;
              mat.roughness = 0.65;
            } else if (/leone|bull/i.test(url)) {
              mat.metalness = 0.15;
              mat.roughness = 0.48;
            }
            if (mat.transparent || mat.alphaTest > 0) {
              mat.depthWrite = mat.opacity >= 0.99;
            }
          }
        }
      });

      const modelHolder = new THREE.Group();
      modelHolder.add(model);
      orientSpinAxisToY(modelHolder);
      // Leone / Libra / Bull: pole faces -Z in the baked mesh; map to +Y spin axis.
      if (/leone|libra|bull/i.test(url)) modelHolder.rotation.x = Math.PI / 2;
      // Dark Bull wheel art is 90° off the baked UV frame — align before scaling.
      if (/bull/i.test(url)) model.rotation.z = Math.PI / 2;

      const box = new THREE.Box3().setFromObject(modelHolder);
      const size = box.getSize(new THREE.Vector3());
      const scale = (CONFIG.TOP_HEIGHT / size.y) * 1.1;
      modelHolder.scale.setScalar(scale);
      centerModelOnAxis(modelHolder);

      parentGroup.clear();
      parentGroup.add(modelHolder);

      if (physicsBody) {
        const radius = fitColliderToModel(physicsBody, modelHolder);
        if (onReady) onReady(radius);
      }
    },
    undefined,
    () => {
      const fallback = createFallbackTopMesh(fallbackColor);
      centerModelOnAxis(fallback);
      parentGroup.clear();
      parentGroup.add(fallback);
      if (physicsBody) {
        const radius = fitColliderToModel(physicsBody, fallback);
        if (onReady) onReady(radius);
      }
    }
  );
}

export function createTopGroups(scene) {
  const playerGroup = new THREE.Group();
  const aiGroup = new THREE.Group();
  scene.add(playerGroup, aiGroup);
  return { playerGroup, aiGroup };
}

const _emissive = new THREE.Color();

/**
 * Tints a top's materials with an emissive glow for ability VFX.
 * intensity 0 removes the glow. Safe to call every frame.
 */
export function setTopEmissive(group, colorHex, intensity) {
  if (!group) return;
  _emissive.set(colorHex ?? 0x000000);
  group.traverse((child) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat || !mat.emissive) continue;
      mat.emissive.copy(_emissive);
      mat.emissiveIntensity = intensity;
    }
  });
}
