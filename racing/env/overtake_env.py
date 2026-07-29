"""Multi-car overtaking environment RaceTrackOvertake-v0.

The learner races in traffic: N opponent cars driven by frozen exported
policies (policy.json files), throttled by a per-episode speed scale so the
learner regularly catches and must pass them. LiDAR senses opponents as
their 3-circle collision capsules (same in the browser), so the 28-dim
observation is unchanged and any policy trained here runs in the arena.

Reward is pluggable: pass reward_fn(signals) -> float, where signals is a
RewardSignals with wall AND car contact fields; default_reward adds car
contact penalties on top of the classic single-car shaping.
"""

import math
from dataclasses import dataclass
from pathlib import Path

import gymnasium as gym
import json

import numpy as np

from racing import constants as C
from racing.env.race_env import (
    REVERSE_STEPS,
    STUCK_MIN_PROGRESS,
    STUCK_STEPS,
    RaceEnv,
)
from racing.sim.car import CarState, step_car, wrap_pi
from racing.sim.collision import resolve_car_car

ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_OPPONENT_DIR = ROOT / "shared" / "policies"

# Default penalties for touching another car (per step / first contact).
REWARD_CAR_STEP = -0.5
REWARD_CAR_EVENT = -3.0

# Opponent grid spawn: cumulative gaps ahead of the learner, in metres.
SPAWN_GAP_MIN = 12.0
SPAWN_GAP_MAX = 35.0
SPAWN_LATERAL = 3.0


@dataclass(frozen=True)
class RewardSignals:
    """Per-step facts a reward function may use.

    delta_s:       metres of forward progress along the centerline.
    speed:         car speed in m/s (negative when reversing).
    wall_contact:  scraping a track wall this step.
    new_wall_hit:  first step of a wall contact.
    car_contact:   touching another car this step.
    new_car_hit:   first step of a car-car contact.
    terminated:    episode ends this step (stuck or reversing).
    lateral:       signed distance (m) from the track centerline.
    heading_error: angle (rad) between heading and track direction.
    """

    delta_s: float
    speed: float
    wall_contact: bool
    new_wall_hit: bool
    car_contact: bool
    new_car_hit: bool
    terminated: bool
    lateral: float
    heading_error: float


def default_reward(sig: RewardSignals) -> float:
    """Classic single-car shaping plus car-contact penalties."""
    r = C.REWARD_PROGRESS * sig.delta_s
    r += C.REWARD_SPEED * max(0.0, sig.speed) / C.MAX_SPEED
    r += C.REWARD_TIME
    if sig.wall_contact:
        r += C.REWARD_WALL_STEP
    if sig.new_wall_hit:
        r += C.REWARD_WALL_EVENT
    if sig.car_contact:
        r += REWARD_CAR_STEP
    if sig.new_car_hit:
        r += REWARD_CAR_EVENT
    if sig.terminated:
        r += C.REWARD_TERMINATE
    return r


class JsonPolicy:
    """NumPy runner for an exported policy.json (same math as the browser)."""

    def __init__(self, path):
        with open(path) as f:
            data = json.load(f)
        self.name = data.get("name", Path(path).stem)
        self.layers = [
            (
                np.asarray(layer["W"], dtype=np.float64),
                np.asarray(layer["b"], dtype=np.float64),
                layer["activation"],
            )
            for layer in data["layers"]
        ]
        self.speed_scale = float(data.get("speed_scale", 1.0))

    def act(self, obs):
        h = np.asarray(obs, dtype=np.float64)
        for w, b, activation in self.layers:
            h = w @ h + b
            if activation == "tanh":
                h = np.tanh(h)
        a = np.clip(h, -1.0, 1.0)
        steer = float(a[0])
        throttle = float(a[1])
        if throttle > 0.0:
            throttle *= self.speed_scale
        return steer, throttle


class Opponent:
    __slots__ = ("policy", "speed_scale", "state", "hint", "steer", "throttle")

    def __init__(self, policy: JsonPolicy, speed_scale: float, state: CarState):
        self.policy = policy
        self.speed_scale = speed_scale
        self.state = state
        self.hint = None
        self.steer = 0.0
        self.throttle = 0.0


def default_opponent_pool():
    files = sorted(
        p for p in DEFAULT_OPPONENT_DIR.glob("*.json") if p.name != "index.json"
    )
    if not files:
        raise FileNotFoundError(
            f"no opponent policies found in {DEFAULT_OPPONENT_DIR}"
        )
    return files


class OvertakeEnv(RaceEnv):
    def __init__(
        self,
        opponents=None,
        n_opponents: int = 3,
        opponent_speed_scale=(0.5, 0.85),
        reward_fn=None,
        track: dict | None = None,
    ):
        super().__init__(track)
        paths = list(opponents) if opponents else default_opponent_pool()
        self.pool = [JsonPolicy(p) for p in paths]
        self.n_opponents = n_opponents
        self.opponent_speed_scale = opponent_speed_scale
        self.reward_fn = reward_fn if reward_fn is not None else default_reward
        self.opponents: list[Opponent] = []
        self.prev_car_contact = False

    # RaceEnv.reset/_observe call this; opponents are sensed as capsules.
    def _observe(self, loc):
        scan = self.lidar.scan(
            self.state.x,
            self.state.z,
            self.state.heading,
            [o.state for o in self.opponents],
        )
        return self._pack_obs(self.state, loc, scan)

    def _pack_obs(self, state, loc, scan):
        herr = self.prog.heading_error(state.heading, loc.tangent_angle)
        obs = np.empty(C.LIDAR_NUM_RAYS + 4, dtype=np.float32)
        obs[: C.LIDAR_NUM_RAYS] = scan
        obs[C.LIDAR_NUM_RAYS] = state.speed / C.MAX_SPEED
        obs[C.LIDAR_NUM_RAYS + 1] = math.sin(herr)
        obs[C.LIDAR_NUM_RAYS + 2] = math.cos(herr)
        obs[C.LIDAR_NUM_RAYS + 3] = np.clip(
            loc.lateral / C.TRACK_HALF_WIDTH, -1.0, 1.0
        )
        return obs

    def reset(self, *, seed=None, options=None):
        self.opponents = []
        obs, info = super().reset(seed=seed, options=options)
        rng = self.np_random
        lap = self.track["lap_length"]

        s_cursor = self.prev_s
        for _ in range(self.n_opponents):
            s_cursor += float(rng.uniform(SPAWN_GAP_MIN, SPAWN_GAP_MAX))
            lateral = float(rng.uniform(-SPAWN_LATERAL, SPAWN_LATERAL))
            x, z, heading = self._pose_at_s(s_cursor % lap, lateral)
            policy = self.pool[int(rng.integers(len(self.pool)))]
            lo, hi = self.opponent_speed_scale
            scale = float(rng.uniform(lo, hi))
            opp = Opponent(policy, scale, CarState(x, z, wrap_pi(heading), 0.0))
            opp.hint = self.prog.locate(x, z, None).index
            self.opponents.append(opp)

        self.prev_car_contact = False
        # Re-observe now that traffic exists.
        loc = self.prog.locate(self.state.x, self.state.z, self.hint)
        self.hint = loc.index
        return self._observe(loc), info

    def step(self, action):
        steer = float(action[0])
        throttle = float(action[1])

        # Opponents pick actions at the same 30 Hz control rate.
        for opp in self.opponents:
            oloc = self.prog.locate(opp.state.x, opp.state.z, opp.hint)
            opp.hint = oloc.index
            others = [self.state] + [
                o.state for o in self.opponents if o is not opp
            ]
            scan = self.lidar.scan(
                opp.state.x, opp.state.z, opp.state.heading, others
            )
            oobs = self._pack_obs(opp.state, oloc, scan)
            osteer, othrottle = opp.policy.act(oobs)
            opp.steer = osteer
            opp.throttle = (
                othrottle * opp.speed_scale if othrottle > 0.0 else othrottle
            )

        contact = False
        car_contact = False
        for _ in range(C.FRAME_SKIP):
            self.state = step_car(self.state, steer, throttle)
            for opp in self.opponents:
                opp.state = step_car(opp.state, opp.steer, opp.throttle)
            # Pairwise push-apart: learner vs each opponent, then traffic.
            for opp in self.opponents:
                self.state, opp.state, cc = resolve_car_car(
                    self.state, opp.state
                )
                if cc:
                    car_contact = True
            for i in range(len(self.opponents)):
                for j in range(i + 1, len(self.opponents)):
                    a = self.opponents[i]
                    b = self.opponents[j]
                    a.state, b.state, _ = resolve_car_car(a.state, b.state)
            self.state, hit = self.collider.resolve(self.state)
            if hit:
                contact = True
            for opp in self.opponents:
                opp.state, _ = self.collider.resolve(opp.state)

        loc = self.prog.locate(self.state.x, self.state.z, self.hint)
        self.hint = loc.index
        delta_s = self.prog.delta_s(self.prev_s, loc.s)
        delta_s = max(-C.PROGRESS_CLAMP, min(C.PROGRESS_CLAMP, delta_s))
        self.prev_s = loc.s
        self.laps += delta_s / self.track["lap_length"]

        # Stuck detection: negligible progress over a sliding window.
        self.recent_progress.append(delta_s)
        if len(self.recent_progress) > STUCK_STEPS:
            self.recent_progress.pop(0)
        stuck = (
            len(self.recent_progress) == STUCK_STEPS
            and abs(sum(self.recent_progress)) < STUCK_MIN_PROGRESS
        )
        if self.state.speed < -0.5 or delta_s < -0.01:
            self.reverse_count += 1
        else:
            self.reverse_count = 0
        reversing = self.reverse_count >= REVERSE_STEPS
        terminated = stuck or reversing

        signals = RewardSignals(
            delta_s=delta_s,
            speed=self.state.speed,
            wall_contact=contact,
            new_wall_hit=contact and not self.prev_contact,
            car_contact=car_contact,
            new_car_hit=car_contact and not self.prev_car_contact,
            terminated=terminated,
            lateral=loc.lateral,
            heading_error=self.prog.heading_error(
                self.state.heading, loc.tangent_angle
            ),
        )
        reward = float(self.reward_fn(signals))
        self.prev_contact = contact
        self.prev_car_contact = car_contact

        self.steps += 1
        truncated = self.steps >= C.EPISODE_MAX_STEPS

        info = {"laps": self.laps, "contact": contact, "car_contact": car_contact}
        return self._observe(loc), reward, terminated, truncated, info


gym.register(
    id="RaceTrackOvertake-v0",
    entry_point="racing.env.overtake_env:OvertakeEnv",
)
