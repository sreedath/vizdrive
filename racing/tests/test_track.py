import math

import pytest

from racing import constants as C
from racing.track import geometry as geo
from racing.track.build_track import MIN_RADIUS_FACTOR, build_track, validate_track


@pytest.fixture(scope="module")
def track():
    return build_track()


def test_validates(track):
    validate_track(track)


def test_lap_length(track):
    assert 1000.0 < track["lap_length"] < 1500.0


def test_uniform_spacing(track):
    c = track["centerline"]
    n = len(c)
    for i in range(n):
        a, b = c[i], c[(i + 1) % n]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        assert abs(d - C.CENTERLINE_SPACING) < 0.5


def test_min_radius(track):
    radii = geo.curvature_radii([tuple(p) for p in track["centerline"]])
    assert min(radii) > MIN_RADIUS_FACTOR * track["half_width"]


def test_walls_offset(track):
    c, l, r = track["centerline"], track["left_wall"], track["right_wall"]
    for i in range(len(c)):
        dl = math.hypot(l[i][0] - c[i][0], l[i][1] - c[i][1])
        dr = math.hypot(r[i][0] - c[i][0], r[i][1] - c[i][1])
        assert abs(dl - C.TRACK_HALF_WIDTH) < 1e-6
        assert abs(dr - C.TRACK_HALF_WIDTH) < 1e-6


def test_s_table_monotonic(track):
    s = track["s_table"]
    assert s[0] == 0.0
    for i in range(1, len(s)):
        assert s[i] > s[i - 1]
    assert s[-1] < track["lap_length"]


def test_checkpoints(track):
    cps = track["checkpoints"]
    assert len(cps) == C.NUM_CHECKPOINTS
    idxs = [cp["index"] for cp in cps]
    assert idxs[0] == 0
    assert idxs == sorted(idxs)
    assert len(set(idxs)) == len(idxs)


def test_start_on_straight(track):
    # Start heading roughly +x (the south straight).
    assert abs(track["start"]["heading"]) < 0.2
    # Grid slots are inside the track.
    for slot in track["grid"]:
        d = math.hypot(slot["x"] - track["start"]["x"], slot["z"] - track["start"]["z"])
        assert d < 10.0
