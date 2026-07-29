"""Track-relative localization: arc-length s, signed lateral offset, tangent.

MUST match web/js/sim/progress.js line by line (parity-tested).
"""

import math
from typing import NamedTuple

from racing.sim.car import wrap_pi

SEARCH_WINDOW = 12  # centerline indices searched around the hint


class Location(NamedTuple):
    s: float
    lateral: float
    tangent_angle: float
    index: int


class ProgressTracker:
    def __init__(self, track: dict):
        self.center = track["centerline"]
        self.s_table = track["s_table"]
        self.lap_length = track["lap_length"]
        self.n = len(self.center)

    def locate(self, x, z, hint_index=None) -> Location:
        center = self.center
        n = self.n
        if hint_index is None:
            i0, i1 = 0, n - 1
        else:
            i0, i1 = hint_index - SEARCH_WINDOW, hint_index + SEARCH_WINDOW
        best = math.inf
        best_idx = 0
        best_t = 0.0
        for k in range(i0, i1 + 1):
            i = k % n
            a = center[i]
            b = center[(i + 1) % n]
            dx = b[0] - a[0]
            dz = b[1] - a[1]
            len2 = dx * dx + dz * dz
            t = 0.0
            if len2 > 1e-12:
                t = ((x - a[0]) * dx + (z - a[1]) * dz) / len2
                if t < 0.0:
                    t = 0.0
                elif t > 1.0:
                    t = 1.0
            cx = a[0] + dx * t
            cz = a[1] + dz * t
            ddx = x - cx
            ddz = z - cz
            d2 = ddx * ddx + ddz * ddz
            if d2 < best:
                best = d2
                best_idx = i
                best_t = t
        a = center[best_idx]
        b = center[(best_idx + 1) % n]
        dx = b[0] - a[0]
        dz = b[1] - a[1]
        seg_len = math.sqrt(dx * dx + dz * dz)
        tx = dx / seg_len
        tz = dz / seg_len
        cx = a[0] + dx * best_t
        cz = a[1] + dz * best_t
        # Signed lateral: positive on the left of the tangent.
        lateral = tx * (z - cz) - tz * (x - cx)
        s = self.s_table[best_idx] + seg_len * best_t
        if s >= self.lap_length:
            s -= self.lap_length
        return Location(s, lateral, math.atan2(tz, tx), best_idx)

    def delta_s(self, s0, s1):
        """Shortest signed arc distance from s0 to s1 around the lap."""
        d = s1 - s0
        if d > self.lap_length / 2.0:
            d -= self.lap_length
        elif d < -self.lap_length / 2.0:
            d += self.lap_length
        return d

    def heading_error(self, heading, tangent_angle):
        return wrap_pi(heading - tangent_angle)
