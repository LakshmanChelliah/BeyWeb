import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { applySteerForce } from '../physics/steer.js';

export function createGyroInput(canvas) {
  let calibBeta = 0;
  let calibGamma = 0;
  let gyroBeta = 0;
  let gyroGamma = 0;
  let usingMouse = false;
  let mouseSteerX = 0;
  let mouseSteerZ = 0;

  function onDeviceOrientation(event) {
    if (event.beta == null || event.gamma == null) return;
    gyroBeta = event.beta - calibBeta;
    gyroGamma = event.gamma - calibGamma;
  }

  async function requestMotionPermission() {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        return state === 'granted';
      } catch {
        return false;
      }
    }
    return true;
  }

  function calibrateGyro(event) {
    calibBeta = event.beta || 0;
    calibGamma = event.gamma || 0;
    gyroBeta = 0;
    gyroGamma = 0;
  }

  async function calibrateOnce() {
    return new Promise((resolve) => {
      const handler = (e) => {
        calibrateGyro(e);
        window.removeEventListener('deviceorientation', handler, true);
        resolve();
      };
      window.addEventListener('deviceorientation', handler, true);
      setTimeout(resolve, 300);
    });
  }

  canvas.addEventListener('pointermove', (e) => {
    usingMouse = true;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    mouseSteerX = nx * CONFIG.GYRO_CLAMP;
    mouseSteerZ = ny * CONFIG.GYRO_CLAMP;
  });

  function startListening() {
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
  }

  function applyGyroSteer(body, spin) {
    let tiltX;
    let tiltZ;
    if (usingMouse) {
      tiltX = mouseSteerX;
      tiltZ = mouseSteerZ;
    } else {
      tiltX = THREE.MathUtils.clamp(gyroGamma, -CONFIG.GYRO_CLAMP, CONFIG.GYRO_CLAMP);
      tiltZ = THREE.MathUtils.clamp(gyroBeta, -CONFIG.GYRO_CLAMP, CONFIG.GYRO_CLAMP);
    }

    applySteerForce(
      body,
      tiltX / CONFIG.GYRO_CLAMP,
      tiltZ / CONFIG.GYRO_CLAMP,
      spin,
      CONFIG.GYRO_FORCE,
      { minSpin: CONFIG.SLEEP_THRESHOLD, normalize: false }
    );
  }

  return {
    requestMotionPermission,
    calibrateOnce,
    startListening,
    applyGyroSteer,
    setMouseFallback() {
      usingMouse = true;
    },
  };
}
