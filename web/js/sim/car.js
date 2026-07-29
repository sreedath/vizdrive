// Kinematic bicycle car physics. MUST stay a line-by-line match of
// racing/sim/car.py; any change here requires the same change there and a
// green parity test.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapPi(h) {
  return h - 2 * Math.PI * Math.floor((h + Math.PI) / (2 * Math.PI));
}

// state: { x, z, heading, speed } (heading rad from +x toward +z, speed signed)
// Returns a NEW state object (never mutates).
export function stepCar(state, steerCmd, throttleCmd, C) {
  const steer = clamp(steerCmd, -1.0, 1.0);
  const throttle = clamp(throttleCmd, -1.0, 1.0);
  const v0 = state.speed;

  // Longitudinal acceleration from pedals.
  let accel;
  if (throttle > 0.0) {
    accel = v0 >= 0.0 ? throttle * C.ACCEL : throttle * C.BRAKE_DECEL;
  } else if (throttle < 0.0) {
    accel = v0 > 0.0 ? throttle * C.BRAKE_DECEL : throttle * C.ACCEL * 0.5;
  } else {
    accel = 0.0;
  }

  // Linear drag + rolling friction, always opposing motion.
  if (v0 > 0.0) {
    accel -= C.DRAG * v0 + C.ROLL_DECEL;
  } else if (v0 < 0.0) {
    accel += C.DRAG * -v0 + C.ROLL_DECEL;
  }

  let v = v0 + accel * C.DT;
  // Deadband: coasting friction must not push the car through zero.
  if (throttle === 0.0 && v0 !== 0.0 && v * v0 <= 0.0) {
    v = 0.0;
  }
  v = clamp(v, -C.MAX_REVERSE_SPEED, C.MAX_SPEED);

  // Speed-attenuated steering, then kinematic bicycle.
  const gain = 1.0 / (1.0 + (C.STEER_SPEED_FACTOR * Math.abs(v)) / 10.0);
  const delta = steer * C.MAX_STEER * gain;
  const heading = wrapPi(
    state.heading + (v / C.WHEELBASE) * Math.tan(delta) * C.DT
  );
  const x = state.x + v * Math.cos(heading) * C.DT;
  const z = state.z + v * Math.sin(heading) * C.DT;
  return { x, z, heading, speed: v };
}
