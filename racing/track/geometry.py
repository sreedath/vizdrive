"""Geometry helpers for the track: tangents, offsets, curvature, intersections."""

import math


def tangents(points):
    """Unit tangents of a closed polyline via central differences."""
    n = len(points)
    out = []
    for i in range(n):
        a = points[(i - 1) % n]
        b = points[(i + 1) % n]
        dx, dz = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dz)
        out.append((dx / d, dz / d))
    return out


def normals(tans):
    """Left normals (rotate tangent +90deg: (x,z) -> (-z, x))."""
    return [(-t[1], t[0]) for t in tans]


def offset_polyline(points, norms, dist: float):
    """Offset each point along its normal by dist (closed polyline)."""
    return [(p[0] + n[0] * dist, p[1] + n[1] * dist) for p, n in zip(points, norms)]


def curvature_radii(points):
    """Circumradius through consecutive point triples of a closed polyline."""
    n = len(points)
    radii = []
    for i in range(n):
        a = points[(i - 1) % n]
        b = points[i]
        c = points[(i + 1) % n]
        ab = math.hypot(b[0] - a[0], b[1] - a[1])
        bc = math.hypot(c[0] - b[0], c[1] - b[1])
        ca = math.hypot(a[0] - c[0], a[1] - c[1])
        cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if abs(cross) < 1e-9:
            radii.append(float("inf"))
        else:
            radii.append(ab * bc * ca / (2.0 * abs(cross)))
    return radii


def segments_intersect(p1, p2, p3, p4) -> bool:
    """Proper intersection test for segments p1p2 and p3p4 (excluding shared endpoints)."""
    def orient(a, b, c):
        v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if v > 1e-12:
            return 1
        if v < -1e-12:
            return -1
        return 0

    o1 = orient(p1, p2, p3)
    o2 = orient(p1, p2, p4)
    o3 = orient(p3, p4, p1)
    o4 = orient(p3, p4, p2)
    return o1 != o2 and o3 != o4 and 0 not in (o1, o2, o3, o4)


def polyline_self_intersects(points) -> bool:
    """Check a closed polyline for self-intersection (non-adjacent segments)."""
    n = len(points)
    segs = [(points[i], points[(i + 1) % n]) for i in range(n)]
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue  # adjacent around the loop
            if segments_intersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1]):
                return True
    return False


def polygon_area(points) -> float:
    """Signed area (positive = counter-clockwise)."""
    n = len(points)
    s = 0.0
    for i in range(n):
        a, b = points[i], points[(i + 1) % n]
        s += a[0] * b[1] - b[0] * a[1]
    return 0.5 * s
