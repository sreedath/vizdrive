"""Closed centripetal Catmull-Rom spline + uniform arc-length resampling."""

import math


def _catmull_rom_point(p0, p1, p2, p3, t: float):
    """Centripetal Catmull-Rom (alpha=0.5) evaluated at t in [0,1] between p1,p2."""
    alpha = 0.5

    def tj(ti, pa, pb):
        d = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
        return ti + d ** alpha

    t0 = 0.0
    t1 = tj(t0, p0, p1)
    t2 = tj(t1, p1, p2)
    t3 = tj(t2, p2, p3)
    t = t1 + (t2 - t1) * t

    def lerp(pa, pb, ta, tb):
        if tb - ta < 1e-12:
            return pa
        u = (t - ta) / (tb - ta)
        return (pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u)

    a1 = lerp(p0, p1, t0, t1)
    a2 = lerp(p1, p2, t1, t2)
    a3 = lerp(p2, p3, t2, t3)
    b1 = lerp(a1, a2, t0, t2)
    b2 = lerp(a2, a3, t1, t3)
    return lerp(b1, b2, t1, t2)


def sample_closed_spline(points, samples_per_segment: int = 40):
    """Densely sample a closed Catmull-Rom through `points`. Returns list of (x, z)."""
    n = len(points)
    out = []
    for i in range(n):
        p0 = points[(i - 1) % n]
        p1 = points[i]
        p2 = points[(i + 1) % n]
        p3 = points[(i + 2) % n]
        for k in range(samples_per_segment):
            out.append(_catmull_rom_point(p0, p1, p2, p3, k / samples_per_segment))
    return out


def resample_uniform(dense, spacing: float):
    """Resample a closed polyline at uniform arc-length spacing.

    Returns (points, total_length). Point count is round(total/spacing) so the
    loop closes with near-uniform spacing.
    """
    n = len(dense)
    seg_len = []
    total = 0.0
    for i in range(n):
        a, b = dense[i], dense[(i + 1) % n]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        seg_len.append(d)
        total += d

    count = max(4, round(total / spacing))
    step = total / count
    points = []
    target = 0.0
    acc = 0.0
    i = 0
    for _ in range(count):
        while acc + seg_len[i] < target - 1e-9:
            acc += seg_len[i]
            i += 1
        a, b = dense[i], dense[(i + 1) % n]
        u = (target - acc) / seg_len[i] if seg_len[i] > 1e-12 else 0.0
        points.append((a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u))
        target += step
    return points, total
