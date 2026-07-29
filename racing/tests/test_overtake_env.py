"""Tests for the multi-car overtaking environment."""

import math

import numpy as np

from racing import constants as C
from racing.env.overtake_env import OvertakeEnv, RewardSignals

OBS_DIM = C.LIDAR_NUM_RAYS + 4


def make_env(**kw):
    kw.setdefault("n_opponents", 2)
    return OvertakeEnv(**kw)


def test_reset_obs_shape_and_range():
    env = make_env()
    obs, info = env.reset(seed=3)
    assert obs.shape == (OBS_DIM,)
    assert np.all(obs >= -1.0) and np.all(obs <= 1.0)
    assert len(env.opponents) == 2


def test_opponents_spawn_ahead():
    env = make_env()
    env.reset(seed=5)
    lap = env.track["lap_length"]
    my_s = env.prog.locate(env.state.x, env.state.z, None).s
    for opp in env.opponents:
        os_ = env.prog.locate(opp.state.x, opp.state.z, None).s
        ahead = (os_ - my_s) % lap
        assert 5.0 < ahead < 80.0


def test_step_runs_and_reports_signals():
    env = make_env()
    env.reset(seed=1)
    obs, reward, term, trunc, info = env.step(np.array([0.0, 0.5]))
    assert obs.shape == (OBS_DIM,)
    assert isinstance(reward, float)
    assert "car_contact" in info and "contact" in info and "laps" in info


def test_rear_end_gives_car_contact():
    # Slow opponents; learner floors it from right behind one -> contact.
    env = make_env(opponent_speed_scale=(0.2, 0.2))
    env.reset(seed=2)
    opp = env.opponents[0]
    fx = math.cos(opp.state.heading)
    fz = math.sin(opp.state.heading)
    env.state = env.state._replace(
        x=opp.state.x - 5.0 * fx,
        z=opp.state.z - 5.0 * fz,
        heading=opp.state.heading,
        speed=0.0,
    )
    loc = env.prog.locate(env.state.x, env.state.z, None)
    env.hint = loc.index
    env.prev_s = loc.s
    hit = False
    for _ in range(60):
        _, _, term, trunc, info = env.step(np.array([0.0, 1.0]))
        if info["car_contact"]:
            hit = True
            break
        if term or trunc:
            break
    assert hit


def test_lidar_sees_opponents():
    # Obs lidar must shorten when an opponent is right ahead.
    env = make_env(opponent_speed_scale=(0.2, 0.2))
    obs0, _ = env.reset(seed=2)
    opp = env.opponents[0]
    fx = math.cos(opp.state.heading)
    fz = math.sin(opp.state.heading)
    env.state = env.state._replace(
        x=opp.state.x - 6.0 * fx,
        z=opp.state.z - 6.0 * fz,
        heading=opp.state.heading,
        speed=0.0,
    )
    loc = env.prog.locate(env.state.x, env.state.z, None)
    scan_with = env.lidar.scan(
        env.state.x, env.state.z, env.state.heading,
        [o.state for o in env.opponents],
    )
    scan_without = env.lidar.scan(env.state.x, env.state.z, env.state.heading)
    assert min(scan_with) < min(scan_without) + 1e-12
    assert any(w < b - 1e-9 for w, b in zip(scan_with, scan_without))


def test_custom_reward_fn_receives_car_signals():
    seen = []

    def rf(sig: RewardSignals) -> float:
        seen.append(sig)
        return sig.delta_s - (5.0 if sig.new_car_hit else 0.0)

    env = make_env(reward_fn=rf)
    env.reset(seed=4)
    env.step(np.array([0.0, 1.0]))
    assert seen
    sig = seen[-1]
    for field in (
        "delta_s", "speed", "wall_contact", "new_wall_hit",
        "car_contact", "new_car_hit", "terminated", "lateral",
        "heading_error",
    ):
        assert hasattr(sig, field)
