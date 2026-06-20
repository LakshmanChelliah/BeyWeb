/** Shared readers for per-top runtime flags stamped on `body.userData`. */

export function isRingOutActive(body) {
  return !!body?.userData?.ringOut;
}

export function isLaunching(body) {
  return !!body?.userData?.launching;
}

export function isAirborne(body) {
  return !!body?.userData?.airborne;
}

export function flightLift(body) {
  return body?.userData?.flightLift ?? 0;
}

/** True when rim position correction should be skipped (KO slide / aerial exit). */
export function shouldBypassWallConstraint(body) {
  if (!body) return true;
  if (isRingOutActive(body) || isLaunching(body)) return true;
  if (body.userData.starPhase != null) return true;
  if (flightLift(body) > 0.55) return true;
  if (isAirborne(body) && flightLift(body) > 0.2) return true;
  return false;
}

export function shouldPinTopToFloor(body) {
  if (!body) return false;
  return (
    !isAirborne(body) &&
    !body.userData.bullFlipPhase &&
    !isRingOutActive(body) &&
    !isLaunching(body)
  );
}

export function shouldSettleSleep(body) {
  if (!body) return false;
  return !isAirborne(body) && !body.userData.bullFlipPhase;
}

export function shouldApplyCenterPull(body) {
  if (!body) return false;
  return !isAirborne(body) && !isRingOutActive(body);
}

export function shouldStabilizeSpin(body) {
  if (!body) return false;
  return !body.userData.bullFlipPhase && !isRingOutActive(body);
}
