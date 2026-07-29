"""Car-vs-wall collision (slide, no bounce) and car-vs-car push-apart.

MUST match web/js/sim/collision.js line by line (parity-tested).
"""

import math

from racing import constants as C
from racing.sim.car import CarState


def closest_on_segment(px, pz, ax, az, bx, bz):
    """Closest point on segment and squared distance. Pure scalar math."""
    dx = bx - ax
    dz = bz - az
    len2 = dx * dx + dz * dz
    t = 0.0
    if len2 > 1e-12:
        t = ((px - ax) * dx + (pz - az) * dz) / len2
        if t < 0.0:
            t = 0.0
        elif t > 1.0:
            t = 1.0
    cx = ax + dx * t
    cz = az + dz * t
    ddx = px - cx
    ddz = pz - cz
    return ddx * ddx + ddz * ddz, cx, cz


class WallCollider:
    def __init__(self, track: dict):
        segs = []
        for wall in (track["left_wall"], track["right_wall"]):
            n = len(wall)
            for i in range(n):
                a = wall[i]
                b = wall[(i + 1) % n]
                segs.append((a[0], a[1], b[0], b[1]))
        self.segs = segs

    def resolve(self, state: CarState):
        """Returns (new_state, contact)."""
        best = math.inf
        bx = 0.0
        bz = 0.0
        for ax, az, sbx, sbz in self.segs:
            dist2, cx, cz = closest_on_segment(state.x, state.z, ax, az, sbx, sbz)
            if dist2 < best:
                best = dist2
                bx = cx
                bz = cz
        dist = math.sqrt(best)
        if dist >= C.CAR_RADIUS:
            return state, False
        if dist > 1e-9:
            nx = (state.x - bx) / dist
            nz = (state.z - bz) / dist
        else:
            # Degenerate: push back along heading.
            nx = -math.cos(state.heading)
            nz = -math.sin(state.heading)
        return (
            CarState(
                bx + nx * C.CAR_RADIUS,
                bz + nz * C.CAR_RADIUS,
                state.heading,
                state.speed * C.WALL_SPEED_KEEP,
            ),
            True,
        )


# Car-vs-car collision. Each car is a capsule approximated by 3 circles
# along its heading (tail/center/nose), sized to hug the 4.2 x 2.0 body box.
# Deepest-pair resolution, half the overlap each. Port of resolveCarCar in
# web/js/sim/collision.js; the constants and math must stay identical.
CAR_CIRCLE_OFFSETS = (-1.1, 0.0, 1.1)
CAR_CIRCLE_RADIUS = 1.0
CAR_CAR_ITERATIONS = 4


def car_circles(x, z, heading):
    """The 3 capsule circle centers for a car at (x, z, heading)."""
    fx = math.cos(heading)
    fz = math.sin(heading)
    return [(x + fx * o, z + fz * o) for o in CAR_CIRCLE_OFFSETS]


def resolve_car_car(a: CarState, b: CarState):
    """Push two overlapping cars apart. Returns (a2, b2, contact); the
    inputs are never mutated and are returned as-is when not touching."""
    ax = a.x
    az = a.z
    bx = b.x
    bz = b.z
    contact = False
    min_dist = 2.0 * CAR_CIRCLE_RADIUS

    for _ in range(CAR_CAR_ITERATIONS):
        ca = car_circles(ax, az, a.heading)
        cb = car_circles(bx, bz, b.heading)
        # Find the deepest-penetrating circle pair this iteration.
        worst = 0.0
        nx = 0.0
        nz = 0.0
        for pax, paz in ca:
            for pbx, pbz in cb:
                dx = pbx - pax
                dz = pbz - paz
                dist = math.hypot(dx, dz)
                pen = min_dist - dist
                if pen <= worst:
                    continue
                worst = pen
                if dist > 1e-9:
                    nx = dx / dist
                    nz = dz / dist
                else:
                    # Coincident circles: push sideways vs a's heading.
                    nx = -math.sin(a.heading)
                    nz = math.cos(a.heading)
        if worst <= 0.0:
            break
        contact = True
        push = worst * 0.5
        ax -= nx * push
        az -= nz * push
        bx += nx * push
        bz += nz * push

    if not contact:
        return a, b, False
    return (
        CarState(ax, az, a.heading, a.speed),
        CarState(bx, bz, b.heading, b.speed),
        True,
    )
