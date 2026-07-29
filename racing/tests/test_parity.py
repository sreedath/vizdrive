"""Gatekeeper: the JS sim (run under Node) must match the Python sim to
<1e-9 on state, progress, and lidar over seeded random rollouts."""

import json
import math
import subprocess
from pathlib import Path

import pytest

from racing import constants as C
from racing.sim.car import CarState, step_car
from racing.sim.collision import WallCollider, resolve_car_car
from racing.sim.lidar import Lidar
from racing.sim.progress import ProgressTracker
from racing.track.load import load_track

ROOT = Path(__file__).resolve().parent.parent.parent
NODE_SCRIPT = ROOT / "web" / "js" / "sim" / "parity_dump_node.js"
TOL = 1e-9
STEPS = 500


def mulberry32(seed: int):
    """Exact Python port of the JS mulberry32 PRNG (32-bit semantics)."""
    a = seed & 0xFFFFFFFF

    def next_float() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = ((a ^ (a >> 15)) * (a | 1)) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) ^ t
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return next_float


def python_rollout(track: dict, seed: int, steps: int):
    collider = WallCollider(track)
    lidar = Lidar(track)
    prog = ProgressTracker(track)
    rng = mulberry32(seed)
    grid = track["grid"][0]
    state = CarState(grid["x"], grid["z"], grid["heading"], 0.0)
    hint = None
    out = []
    for _ in range(steps):
        steer = rng() * 2.0 - 1.0
        throttle = rng() * 1.7 - 0.7
        # Ghost car: exercises car-car collision + car-sensing lidar.
        gd = rng() * 30.0
        glat = rng() * 8.0 - 4.0
        gh = state.heading + rng() * 2.0 - 1.0
        fx = math.cos(state.heading)
        fz = math.sin(state.heading)
        ghost = CarState(
            state.x + fx * gd - fz * glat,
            state.z + fz * gd + fx * glat,
            gh,
            0.0,
        )
        contact = False
        car_contact = False
        for _k in range(C.FRAME_SKIP):
            state = step_car(state, steer, throttle)
            state, ghost, cc = resolve_car_car(state, ghost)
            if cc:
                car_contact = True
            state, hit = collider.resolve(state)
            if hit:
                contact = True
        loc = prog.locate(state.x, state.z, hint)
        hint = loc.index
        scan = lidar.scan(state.x, state.z, state.heading, [ghost])
        out.append(
            {
                "x": state.x,
                "z": state.z,
                "heading": state.heading,
                "speed": state.speed,
                "contact": 1 if contact else 0,
                "car_contact": 1 if car_contact else 0,
                "gx": ghost.x,
                "gz": ghost.z,
                "s": loc.s,
                "lateral": loc.lateral,
                "tangent": loc.tangent_angle,
                "scan": scan,
            }
        )
    return out


def node_rollout(seed: int, steps: int):
    res = subprocess.run(
        ["node", str(NODE_SCRIPT), str(seed), str(steps)],
        capture_output=True,
        text=True,
        check=True,
        cwd=ROOT,
    )
    return json.loads(res.stdout)


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_js_python_parity(seed):
    track = load_track()
    py = python_rollout(track, seed, STEPS)
    js = node_rollout(seed, STEPS)
    assert len(py) == len(js) == STEPS
    max_diff = 0.0
    for i, (p, j) in enumerate(zip(py, js)):
        assert p["contact"] == j["contact"], f"contact mismatch at step {i}"
        assert (
            p["car_contact"] == j["car_contact"]
        ), f"car_contact mismatch at step {i}"
        for key in (
            "x", "z", "heading", "speed", "gx", "gz", "s", "lateral", "tangent"
        ):
            d = abs(p[key] - j[key])
            max_diff = max(max_diff, d)
            assert d < TOL, f"{key} diff {d:.3e} at step {i} (seed {seed})"
        for r, (a, b) in enumerate(zip(p["scan"], j["scan"])):
            d = abs(a - b)
            max_diff = max(max_diff, d)
            assert d < TOL, f"scan[{r}] diff {d:.3e} at step {i} (seed {seed})"
    print(f"seed {seed}: max diff {max_diff:.3e}")
