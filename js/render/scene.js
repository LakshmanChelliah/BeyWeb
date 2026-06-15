import * as THREE from 'three';
import { CONFIG } from '../config.js';

/** Scene, renderer, camera, and lighting */
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141b30);
  scene.fog = new THREE.Fog(0x141b30, 60, 130);

  const camera = new THREE.PerspectiveCamera(
    48,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 24, 20);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xaab4d0, 1.05));

  const overhead = new THREE.HemisphereLight(0xffffff, 0x556070, 0.9);
  overhead.position.set(0, 30, 0);
  scene.add(overhead);

  const sun = new THREE.DirectionalLight(0xfff4e2, 1.9);
  sun.position.set(6, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const rimLight = new THREE.DirectionalLight(0x6688ff, 0.35);
  rimLight.position.set(-8, 6, -6);
  scene.add(rimLight);

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, onResize };
}

export function updateCamera(camera, state, mode, cameraCue = 0) {
  if (!state.playerBody) return;

  const cue = typeof cameraCue === 'number' ? { lift: cameraCue, stabilized: false } : cameraCue;
  const lift = Math.min(cue.lift ?? 0, 45);
  const stabilized = cue.stabilized ?? false;
  const camY = 24 + lift * 0.5;
  const lookY = lift * 0.38;
  const camZ = 20 + lift * 0.1;
  const lerp = stabilized ? 0.04 : lift > 0.5 ? 0.12 : 0.06;

  let midX;
  let midZ;
  if (stabilized && cue.focusX != null && cue.focusZ != null) {
    midX = cue.focusX;
    midZ = cue.focusZ;
  } else if (mode === 'pc' && state.aiBody) {
    midX = (state.playerBody.position.x + state.aiBody.position.x) * 0.5;
    midZ = (state.playerBody.position.z + state.aiBody.position.z) * 0.5;
  } else {
    midX = state.playerBody.position.x;
    midZ = state.playerBody.position.z;
  }

  if (mode === 'pc' && state.aiBody) {
    camera.position.lerp(new THREE.Vector3(midX, camY, midZ + camZ), lerp);
    camera.lookAt(midX, lookY, midZ);
    return;
  }

  camera.position.lerp(new THREE.Vector3(midX, camY, midZ + camZ), lerp);
  camera.lookAt(midX, lookY, midZ);
}
