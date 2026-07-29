"""LiDAR: N rays over a forward FOV arc against wall segments, accelerated by
a uniform spatial grid + DDA walk.

MUST match web/js/sim/lidar.js line by line (parity-tested).
"""

import math

from racing import constants as C

EPS = 1e-12


def ray_segment(ox, oz, dx, dz, ax, az, bx, bz):
    """Ray vs segment; returns t along ray or -1.0."""
    ex = bx - ax
    ez = bz - az
    denom = dx * ez - dz * ex
    if -EPS < denom < EPS:
        return -1.0
    wx = ax - ox
    wz = az - oz
    t = (wx * ez - wz * ex) / denom
    u = (wx * dz - wz * dx) / denom
    if t >= 0.0 and 0.0 <= u <= 1.0:
        return t
    return -1.0


class Lidar:
    def __init__(self, track: dict):
        self.cell = C.LIDAR_GRID_CELL
        segs = []
        for wall in (track["left_wall"], track["right_wall"]):
            n = len(wall)
            for i in range(n):
                a = wall[i]
                b = wall[(i + 1) % n]
                segs.append((a[0], a[1], b[0], b[1]))
        self.segs = segs
        self.grid: dict[tuple[int, int], list[int]] = {}
        for i, (ax, az, bx, bz) in enumerate(segs):
            ix0 = math.floor(min(ax, bx) / self.cell)
            ix1 = math.floor(max(ax, bx) / self.cell)
            iz0 = math.floor(min(az, bz) / self.cell)
            iz1 = math.floor(max(az, bz) / self.cell)
            for ix in range(ix0, ix1 + 1):
                for iz in range(iz0, iz1 + 1):
                    self.grid.setdefault((ix, iz), []).append(i)
        self.stamp = [-1] * len(segs)
        self.ray_id = 0

    def cast_ray(self, ox, oz, dx, dz):
        """Single ray distance, capped at LIDAR_MAX_RANGE. DDA over grid cells
        with early exit once the best hit is closer than the next boundary."""
        cell = self.cell
        max_r = C.LIDAR_MAX_RANGE
        ray_id = self.ray_id
        self.ray_id += 1
        best_t = max_r

        ix = math.floor(ox / cell)
        iz = math.floor(oz / cell)
        step_x = 1 if dx > 0.0 else -1
        step_z = 1 if dz > 0.0 else -1
        t_delta_x = abs(cell / dx) if dx != 0.0 else math.inf
        t_delta_z = abs(cell / dz) if dz != 0.0 else math.inf
        if dx != 0.0:
            t_max_x = ((ix + 1) * cell - ox if dx > 0.0 else ox - ix * cell) / abs(dx)
        else:
            t_max_x = math.inf
        if dz != 0.0:
            t_max_z = ((iz + 1) * cell - oz if dz > 0.0 else oz - iz * cell) / abs(dz)
        else:
            t_max_z = math.inf

        t_entry = 0.0
        for _ in range(64):
            if t_entry > best_t:
                break
            lst = self.grid.get((ix, iz))
            if lst is not None:
                for si in lst:
                    if self.stamp[si] == ray_id:
                        continue
                    self.stamp[si] = ray_id
                    ax, az, bx, bz = self.segs[si]
                    t = ray_segment(ox, oz, dx, dz, ax, az, bx, bz)
                    if t >= 0.0 and t < best_t:
                        best_t = t
            if t_max_x < t_max_z:
                t_entry = t_max_x
                t_max_x += t_delta_x
                ix += step_x
            else:
                t_entry = t_max_z
                t_max_z += t_delta_z
                iz += step_z
            if t_entry > max_r:
                break
        return best_t

    def scan(self, x, z, heading):
        """List of LIDAR_NUM_RAYS normalized [0,1] distances.
        Ray i angle: heading - FOV/2 + FOV * i / (N - 1)."""
        n = C.LIDAR_NUM_RAYS
        out = []
        for i in range(n):
            ang = heading - C.LIDAR_FOV / 2.0 + (C.LIDAR_FOV * i) / (n - 1)
            d = self.cast_ray(x, z, math.cos(ang), math.sin(ang))
            out.append(d / C.LIDAR_MAX_RANGE)
        return out
