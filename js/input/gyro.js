import { CONFIG } from '../config.js';
import { applySteerForce } from '../physics/steer.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

/**
 * Mobile tilt + touch-drag steering.
 * iOS requires motion permission from a direct user gesture (tap).
 */
export function createGyroInput(canvas) {
  let calibBeta = 0;
  let calibGamma = 0;
  let rawBeta = 0;
  let rawGamma = 0;
  let hasOrientation = false;
  let permissionGranted = false;
  let listening = false;
  let gyroBeta = 0;
  let gyroGamma = 0;
  let usingTouch = false;
  let touchSteerX = 0;
  let touchSteerZ = 0;
  let activePointerId = null;

  function portraitFactor() {
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    return angle === 90 || angle === -90 ? -1 : 1;
  }

  function onDeviceOrientation(event) {
    if (event.beta == null || event.gamma == null) return;
    rawBeta = event.beta;
    rawGamma = event.gamma;
    hasOrientation = true;
    const factor = portraitFactor();
    gyroBeta = (event.beta - calibBeta) * factor;
    gyroGamma = (event.gamma - calibGamma) * factor;
  }

  async function requestMotionPermission() {
    if (permissionGranted) return true;

    let orientationOk = true;
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        orientationOk = state === 'granted';
      } catch {
        orientationOk = false;
      }
    }

    let motionOk = true;
    if (
      typeof DeviceMotionEvent !== 'undefined' &&
      typeof DeviceMotionEvent.requestPermission === 'function'
    ) {
      try {
        const state = await DeviceMotionEvent.requestPermission();
        motionOk = state === 'granted';
      } catch {
        motionOk = false;
      }
    }

    permissionGranted = orientationOk || motionOk;
    return permissionGranted;
  }

  function calibrateGyro(event) {
    calibBeta = event.beta || 0;
    calibGamma = event.gamma || 0;
    gyroBeta = 0;
    gyroGamma = 0;
  }

  function calibrateNow() {
    if (!hasOrientation) return false;
    calibrateGyro({ beta: rawBeta, gamma: rawGamma });
    return true;
  }

  async function calibrateOnce() {
    if (calibrateNow()) return;
    return new Promise((resolve) => {
      const handler = (e) => {
        if (e.beta == null || e.gamma == null) return;
        calibrateGyro(e);
        hasOrientation = true;
        rawBeta = e.beta || 0;
        rawGamma = e.gamma || 0;
        window.removeEventListener('deviceorientation', handler, true);
        resolve();
      };
      window.addEventListener('deviceorientation', handler, true);
      setTimeout(resolve, 500);
    });
  }

  function updateTouchSteer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 2 - 1 : 0;
    const ny = rect.height > 0 ? ((clientY - rect.top) / rect.height) * 2 - 1 : 0;
    touchSteerX = nx * CONFIG.GYRO_CLAMP;
    touchSteerZ = ny * CONFIG.GYRO_CLAMP;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      usingTouch = true;
      activePointerId = e.pointerId;
      canvas.setPointerCapture?.(e.pointerId);
      updateTouchSteer(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && e.pointerId === activePointerId) {
      usingTouch = true;
      updateTouchSteer(e.clientX, e.clientY);
    }
  });

  function endTouch(e) {
    if (e.pointerType !== 'touch' || e.pointerId !== activePointerId) return;
    activePointerId = null;
    touchSteerX = 0;
    touchSteerZ = 0;
    usingTouch = false;
  }

  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  function startListening() {
    if (listening) return;
    listening = true;
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
  }

  function readTilt() {
    if (usingTouch || !hasOrientation) {
      return { tiltX: touchSteerX, tiltZ: touchSteerZ };
    }
    return {
      tiltX: clamp(gyroGamma, -CONFIG.GYRO_CLAMP, CONFIG.GYRO_CLAMP),
      tiltZ: clamp(gyroBeta, -CONFIG.GYRO_CLAMP, CONFIG.GYRO_CLAMP),
    };
  }

  function applyGyroSteer(body, spin) {
    const { tiltX, tiltZ } = readTilt();
    applySteerForce(
      body,
      tiltX / CONFIG.GYRO_CLAMP,
      tiltZ / CONFIG.GYRO_CLAMP,
      spin,
      CONFIG.GYRO_FORCE,
      { minSpin: CONFIG.SLEEP_THRESHOLD, normalize: false }
    );
  }

  async function enable({ calibrate = true } = {}) {
    const granted = await requestMotionPermission();
    startListening();
    if (calibrate) await calibrateOnce();
    return granted;
  }

  return {
    requestMotionPermission,
    calibrateOnce,
    calibrateNow,
    startListening,
    enable,
    applyGyroSteer,
    getSteerDirection() {
      const { tiltX, tiltZ } = readTilt();
      const len = Math.hypot(tiltX, tiltZ);
      if (len < 0.01) return { x: 0, y: 0 };
      return { x: tiltX / len, y: tiltZ / len };
    },
    isUsingFallback() {
      return usingTouch || !hasOrientation;
    },
    isActive() {
      return hasOrientation && !usingTouch;
    },
    isIos: isIos(),
  };
}
