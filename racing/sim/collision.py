"""Car-vs-wall collision (slide, no bounce).

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
