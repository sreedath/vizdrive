import math

import pytest

from racing import constants as C
from racing.sim.lidar import Lidar, ray_segment
from racing.track.load import load_track


def square_room_track(size=40.0):
    """Fake 'track' whose walls form a square room centered at origin."""
    h = size / 2.0
    square = [[-h, -h], [h, -h], [h, h], [-h, h]]
    return {"left_wall": square, "right_wall": square}


def test_ray_segment_basic():
    # Ray +x from origin hits vertical segment at x=5.
    assert ray_segment(0, 0, 1, 0, 5, -1, 5, 1) == pytest.approx(5.0)
    # Parallel miss.
    assert ray_segment(0, 0, 1, 0, 1, 1, 5, 1) == -1.0
    # Behind the ray.
    assert ray_segment(0, 0, 1, 0, -5, -1, -5, 1) == -1.0


def test_square_room_analytic():
    room = square_room_track(40.0)
    lidar = Lidar(room)
    # From center heading +x: forward ray hits wall at 20 m.
    scan = lidar.scan(0.0, 0.0, 0.0)
    n = C.LIDAR_NUM_RAYS
    mid = n // 2
    for i in (mid - 1, mid):
        ang = -C.LIDAR_FOV / 2.0 + C.LIDAR_FOV * i / (n - 1)
        # Analytic distance to square walls from center.
        expected = 20.0 / max(abs(math.cos(ang)), abs(math.sin(ang)))
        expected = min(expected, C.LIDAR_MAX_RANGE)
        assert scan[i] * C.LIDAR_MAX_RANGE == pytest.approx(expected, abs=1e-9)


def test_grid_matches_bruteforce():
    track = load_track()
    lidar = Lidar(track)
    start = track["start"]
    poses = [
        (start["x"], start["z"], start["heading"]),
        (start["x"] + 30.0, start["z"] + 2.0, start["heading"] + 1.0),
        (0.0, 5.0, 2.5),
    ]
    for x, z, heading in poses:
        scan = lidar.scan(x, z, heading)
        for i in range(C.LIDAR_NUM_RAYS):
            ang = heading - C.LIDAR_FOV / 2.0 + C.LIDAR_FOV * i / (C.LIDAR_NUM_RAYS - 1)
            dx, dz = math.cos(ang), math.sin(ang)
            best = C.LIDAR_MAX_RANGE
            for ax, az, bx, bz in lidar.segs:
                t = ray_segment(x, z, dx, dz, ax, az, bx, bz)
                if 0.0 <= t < best:
                    best = t
            assert scan[i] * C.LIDAR_MAX_RANGE == pytest.approx(best, abs=1e-9)


def test_scan_in_bounds():
    track = load_track()
    lidar = Lidar(track)
    start = track["start"]
    scan = lidar.scan(start["x"], start["z"], start["heading"])
    assert len(scan) == C.LIDAR_NUM_RAYS
    assert all(0.0 < v <= 1.0 for v in scan)
    # On the track something must be visible sideways (walls 7 m away-ish).
    assert min(scan) < 0.5
