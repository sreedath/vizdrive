"""Tests for car-sensing LiDAR and Python car-car collision resolution."""

import math

from racing import constants as C
from racing.sim.car import CarState
from racing.sim.collision import (
    CAR_CIRCLE_OFFSETS,
    CAR_CIRCLE_RADIUS,
    car_circles,
    resolve_car_car,
)
from racing.sim.lidar import Lidar, ray_circle
from racing.track.load import load_track


# --- ray_circle ---


def test_ray_circle_head_on():
    # Circle 5 m ahead, radius 1: hit at t = 4.
    t = ray_circle(0.0, 0.0, 1.0, 0.0, 5.0, 0.0, 1.0)
    assert abs(t - 4.0) < 1e-12


def test_ray_circle_miss_behind():
    t = ray_circle(0.0, 0.0, 1.0, 0.0, -5.0, 0.0, 1.0)
    assert t == -1.0


def test_ray_circle_miss_offset():
    # Circle offset 2 m laterally with radius 1: clean miss.
    t = ray_circle(0.0, 0.0, 1.0, 0.0, 5.0, 2.0, 1.0)
    assert t == -1.0


def test_ray_circle_tangent_grazing():
    # Lateral offset exactly r: tangent hit, t >= 0.
    t = ray_circle(0.0, 0.0, 1.0, 0.0, 5.0, 1.0, 1.0)
    assert t >= 0.0


def test_ray_circle_origin_inside():
    t = ray_circle(0.0, 0.0, 1.0, 0.0, 0.2, 0.0, 1.0)
    assert t == 0.0


# --- lidar scan with cars ---


def test_scan_sees_car_ahead():
    track = load_track()
    lidar = Lidar(track)
    grid = track["grid"][0]
    x, z, heading = grid["x"], grid["z"], grid["heading"]
    base = lidar.scan(x, z, heading)

    # Opponent 10 m out along ray `mid`'s exact angle, facing away, so that
    # ray hits the capsule dead-center on the rear circle.
    n = C.LIDAR_NUM_RAYS
    mid = n // 2
    ang = heading - C.LIDAR_FOV / 2.0 + (C.LIDAR_FOV * mid) / (n - 1)
    opp = CarState(
        x + 10.0 * math.cos(ang), z + 10.0 * math.sin(ang), ang, 0.0
    )
    with_car = lidar.scan(x, z, heading, [opp])

    # 10 - rear circle offset (1.1) - circle radius (1.0) = 7.9 m.
    expect = 7.9 / C.LIDAR_MAX_RANGE
    assert abs(with_car[mid] - expect) < 1e-9
    assert with_car[mid] < base[mid]
    # No ray got longer because of the car.
    assert all(w <= b + 1e-12 for w, b in zip(with_car, base))


def test_scan_without_cars_unchanged():
    track = load_track()
    lidar = Lidar(track)
    grid = track["grid"][0]
    x, z, heading = grid["x"], grid["z"], grid["heading"]
    assert lidar.scan(x, z, heading) == lidar.scan(x, z, heading, [])
    assert lidar.scan(x, z, heading) == lidar.scan(x, z, heading, None)


def test_scan_ignores_car_behind():
    track = load_track()
    lidar = Lidar(track)
    grid = track["grid"][0]
    x, z, heading = grid["x"], grid["z"], grid["heading"]
    ox = x - 10.0 * math.cos(heading)
    oz = z - 10.0 * math.sin(heading)
    opp = CarState(ox, oz, heading, 0.0)
    assert lidar.scan(x, z, heading, [opp]) == lidar.scan(x, z, heading)


# --- car-car collision ---


def test_car_circles_layout():
    circles = car_circles(0.0, 0.0, 0.0)
    assert len(circles) == len(CAR_CIRCLE_OFFSETS)
    xs = [c[0] for c in circles]
    assert xs == sorted(xs)
    assert abs(xs[0] - CAR_CIRCLE_OFFSETS[0]) < 1e-12


def test_resolve_car_car_no_contact():
    a = CarState(0.0, 0.0, 0.0, 5.0)
    b = CarState(10.0, 0.0, 0.0, 5.0)
    ra, rb, contact = resolve_car_car(a, b)
    assert not contact
    assert ra is a and rb is b


def test_resolve_car_car_pushes_apart_symmetric():
    # Side-by-side overlap: centers 1.2 m apart laterally (< 2 * radius).
    a = CarState(0.0, 0.0, 0.0, 5.0)
    b = CarState(0.0, 1.2, 0.0, 5.0)
    ra, rb, contact = resolve_car_car(a, b)
    assert contact
    # Pushed apart along +/- z, equally.
    assert ra.z < 0.0 < rb.z
    assert abs(ra.z + rb.z - 1.2) < 1e-9
    # No overlap remains between any circle pair.
    for pa in car_circles(ra.x, ra.z, ra.heading):
        for pb in car_circles(rb.x, rb.z, rb.heading):
            d = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
            assert d >= 2.0 * CAR_CIRCLE_RADIUS - 1e-9
    # Heading and speed untouched.
    assert ra.heading == a.heading and ra.speed == a.speed
    assert rb.heading == b.heading and rb.speed == b.speed


def test_resolve_car_car_nose_to_tail():
    # b directly ahead of a, meshes overlapping nose-to-tail.
    a = CarState(0.0, 0.0, 0.0, 5.0)
    b = CarState(3.5, 0.0, 0.0, 5.0)  # nose(1.1)+1 vs tail(-1.1)+1 overlap
    ra, rb, contact = resolve_car_car(a, b)
    assert contact
    assert ra.x < a.x and rb.x > b.x
