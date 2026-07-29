import math

from racing import constants as C
from racing.sim.car import CarState, step_car, wrap_pi


def drive(state, steer, throttle, ticks):
    for _ in range(ticks):
        state = step_car(state, steer, throttle)
    return state


def test_top_speed():
    # Terminal speed solves ACCEL = DRAG*v + ROLL_DECEL -> exactly MAX_SPEED
    # with the current constants (12 = 0.35*30 + 1.5).
    s = drive(CarState(0, 0, 0, 0), 0.0, 1.0, 60 * 30)
    assert abs(s.speed - C.MAX_SPEED) < 0.2


def test_brake_distance():
    s = CarState(0, 0, 0, C.MAX_SPEED)
    start_x = s.x
    ticks = 0
    while s.speed > 0.0 and ticks < 600:
        s = step_car(s, 0.0, -1.0)
        ticks += 1
    # v^2 / (2*a) with a >= BRAKE_DECEL: <= 18 m; drag helps slightly.
    dist = s.x - start_x
    assert 10.0 < dist < 18.5
    assert ticks < 90  # stops in under 1.5 s


def test_coast_stops_at_zero():
    s = CarState(0, 0, 0, 3.0)
    s = drive(s, 0.0, 0.0, 60 * 5)
    assert s.speed == 0.0


def test_turn_radius_low_speed():
    # Hold ~5 m/s at full lock; measure radius from yaw rate.
    s = CarState(0, 0, 0, 5.0)
    prev_heading = s.heading
    # Throttle chosen to roughly hold 5 m/s: ACCEL*t = DRAG*5 + ROLL.
    t = (C.DRAG * 5.0 + C.ROLL_DECEL) / C.ACCEL
    total_turn = 0.0
    speeds = []
    for _ in range(120):
        s = step_car(s, 1.0, t)
        total_turn += abs(wrap_pi(s.heading - prev_heading))
        prev_heading = s.heading
        speeds.append(s.speed)
    v = sum(speeds) / len(speeds)
    yaw_rate = total_turn / (120 * C.DT)
    radius = v / yaw_rate
    gain = 1.0 / (1.0 + C.STEER_SPEED_FACTOR * v / 10.0)
    expected = C.WHEELBASE / math.tan(C.MAX_STEER * gain)
    assert abs(radius - expected) < 0.4


def test_reverse_capped():
    s = drive(CarState(0, 0, 0, 0), 0.0, -1.0, 60 * 10)
    assert abs(s.speed + C.MAX_REVERSE_SPEED) < 0.2


def test_wrap_pi():
    assert abs(wrap_pi(3 * math.pi) - -math.pi) < 1e-12
    assert wrap_pi(0.5) == 0.5
    assert abs(wrap_pi(math.pi + 0.1) - (-math.pi + 0.1)) < 1e-12
