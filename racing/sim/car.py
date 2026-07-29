"""Kinematic bicycle car physics.

MUST stay a line-by-line match of web/js/sim/car.js; any change here requires
the same change there and a green parity test (test_parity.py).
"""

import math
from typing import NamedTuple

from racing import constants as C


class CarState(NamedTuple):
    x: float
    z: float
    heading: float  # rad from +x toward +z
    speed: float    # signed, m/s


def clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


def wrap_pi(h: float) -> float:
    return h - 2.0 * math.pi * math.floor((h + math.pi) / (2.0 * math.pi))


def step_car(state: CarState, steer_cmd: float, throttle_cmd: float) -> CarState:
    steer = clamp(steer_cmd, -1.0, 1.0)
    throttle = clamp(throttle_cmd, -1.0, 1.0)
    v0 = state.speed

    # Longitudinal acceleration from pedals.
    if throttle > 0.0:
        accel = throttle * C.ACCEL if v0 >= 0.0 else throttle * C.BRAKE_DECEL
    elif throttle < 0.0:
        accel = throttle * C.BRAKE_DECEL if v0 > 0.0 else throttle * C.ACCEL * 0.5
    else:
        accel = 0.0

    # Linear drag + rolling friction, always opposing motion.
    if v0 > 0.0:
        accel -= C.DRAG * v0 + C.ROLL_DECEL
    elif v0 < 0.0:
        accel += C.DRAG * -v0 + C.ROLL_DECEL

    v = v0 + accel * C.DT
    # Deadband: coasting friction must not push the car through zero.
    if throttle == 0.0 and v0 != 0.0 and v * v0 <= 0.0:
        v = 0.0
    v = clamp(v, -C.MAX_REVERSE_SPEED, C.MAX_SPEED)

    # Speed-attenuated steering, then kinematic bicycle.
    gain = 1.0 / (1.0 + (C.STEER_SPEED_FACTOR * abs(v)) / 10.0)
    delta = steer * C.MAX_STEER * gain
    heading = wrap_pi(state.heading + (v / C.WHEELBASE) * math.tan(delta) * C.DT)
    x = state.x + v * math.cos(heading) * C.DT
    z = state.z + v * math.sin(heading) * C.DT
    return CarState(x, z, heading, v)
