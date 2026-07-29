import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from racing import constants as C
from racing.env.race_env import OBS_DIM, RaceEnv


@pytest.fixture(scope="module")
def env():
    return RaceEnv()


def test_check_env(env):
    check_env(env, skip_render_check=True)


def test_obs_shape_and_bounds(env):
    obs, _ = env.reset(seed=7)
    assert obs.shape == (OBS_DIM,)
    assert np.all(obs >= -1.0) and np.all(obs <= 1.0)


def test_full_throttle_progresses(env):
    env.reset(seed=3)
    total = 0.0
    for _ in range(60):  # 2 s straight-ish driving
        obs, r, term, trunc, info = env.step(np.array([0.0, 1.0], dtype=np.float32))
        total += r
        if term or trunc:
            break
    # Driving forward must be clearly reward-positive.
    assert total > 5.0


def test_idle_is_negative_and_stuck_terminates(env):
    env.reset(seed=5)
    total = 0.0
    terminated = False
    for i in range(200):
        obs, r, term, trunc, info = env.step(np.array([0.0, 0.0], dtype=np.float32))
        total += r
        if term:
            terminated = True
            break
    assert terminated  # stuck detector fires within ~3 s
    assert total < -20.0  # time penalties + terminal penalty


def test_reverse_terminates(env):
    env.reset(seed=11)
    terminated = False
    for i in range(200):
        obs, r, term, trunc, info = env.step(np.array([0.0, -1.0], dtype=np.float32))
        if term:
            terminated = True
            break
    assert terminated


def test_determinism_same_seed():
    e1, e2 = RaceEnv(), RaceEnv()
    o1, _ = e1.reset(seed=42)
    o2, _ = e2.reset(seed=42)
    assert np.array_equal(o1, o2)
    rng = np.random.default_rng(0)
    for _ in range(50):
        a = rng.uniform(-1, 1, size=2).astype(np.float32)
        r1 = e1.step(a)
        r2 = e2.step(a)
        assert np.array_equal(r1[0], r2[0])
        assert r1[1] == r2[1]
