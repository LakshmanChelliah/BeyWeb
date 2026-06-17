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

/** Tops still on the stadium (not in ring-out slide). */
function arenaTopPositions(state) {
  const positions = [];
  for (const body of [state.playerBody, state.aiBody]) {
    if (body && !body.userData.ringOut) positions.push(body.position);
  }
  return positions;
}

/** Horizontal span that should fit in frame — separation plus bey size padding. */
function framingSpan(positions, minSpan) {
  if (positions.length === 0) return minSpan;
  if (positions.length === 1) return minSpan;
  let maxDist = 0;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const dx = positions[i].x - positions[j].x;
      const dz = positions[i].z - positions[j].z;
      maxDist = Math.max(maxDist, Math.hypot(dx, dz));
    }
  }
  return Math.max(minSpan, maxDist + 5.5);
}

function focusFromPositions(positions) {
  if (positions.length === 0) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  for (const p of positions) {
    x += p.x;
    z += p.z;
  }
  return { x: x / positions.length, z: z / positions.length };
}

let _mobileFramePull = 0;
let _lookX = 0;
let _lookZ = 0;
let _lookY = 0;
let _lookReady = false;

export function resetMobileCameraFraming() {
  _mobileFramePull = 0;
  _lookReady = false;
}

export function updateCamera(camera, state, mode, cameraCue = 0) {
  if (!state.playerBody) return;

  const cue = typeof cameraCue === 'number' ? { lift: cameraCue, stabilized: false } : cameraCue;
  const lift = Math.min(cue.lift ?? 0, 45);
  const stabilized = cue.stabilized ?? false;
  const koCinematic = cue.koCinematic ?? false;
  const lerp = koCinematic ? 0.025 : stabilized ? 0.04 : lift > 0.5 ? 0.12 : 0.06;

  const camY = cue.camY ?? 24 + lift * 0.5;
  const lookY = cue.lookY ?? lift * 0.38;
  const camZ = cue.camZ ?? 20 + lift * 0.1;

  const inArena = arenaTopPositions(state);
  let midX;
  let midZ;
  if (cue.focusX != null && cue.focusZ != null) {
    midX = cue.focusX;
    midZ = cue.focusZ;
  } else if (mode === 'mobile' && inArena.length > 0) {
    const focus = focusFromPositions(inArena);
    midX = focus.x;
    midZ = focus.z;
  } else if (mode === 'pc' && state.aiBody) {
    midX = (state.playerBody.position.x + state.aiBody.position.x) * 0.5;
    midZ = (state.playerBody.position.z + state.aiBody.position.z) * 0.5;
  } else {
    midX = state.playerBody.position.x;
    midZ = state.playerBody.position.z;
  }

  let finalCamY = camY;
  let finalCamZ = camZ;
  if (mode === 'mobile' && !stabilized && lift < 0.5) {
    const span = framingSpan(inArena, 11);
    const aspect = camera.aspect;
    const aspectScale = aspect < 0.62 ? 1.55 : aspect < 0.85 ? 1.25 : 1.0;
    const targetPull = Math.max(0, (span - 7) * 1.15 * aspectScale);
    _mobileFramePull += (targetPull - _mobileFramePull) * 0.09;
    finalCamY += _mobileFramePull * 0.44;
    finalCamZ += _mobileFramePull;
  } else {
    _mobileFramePull += (0 - _mobileFramePull) * 0.12;
  }

  camera.position.lerp(new THREE.Vector3(midX, finalCamY, midZ + finalCamZ), lerp);

  if (!_lookReady) {
    _lookX = midX;
    _lookZ = midZ;
    _lookY = lookY;
    _lookReady = true;
  }
  const lookLerp = koCinematic ? 0.025 : lerp;
  _lookX += (midX - _lookX) * lookLerp;
  _lookZ += (midZ - _lookZ) * lookLerp;
  _lookY += (lookY - _lookY) * lookLerp;
  camera.lookAt(_lookX, _lookY, _lookZ);
}
