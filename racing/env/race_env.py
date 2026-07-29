"""Gymnasium environment RaceTrack-v0.

Observation (28,): 24 lidar in [0,1], speed/MAX_SPEED, sin/cos(heading error
to track tangent), lateral_offset/half_width. This exact order is mirrored by
web/js/agent/agentDriver.js.

Action (2,): steer, throttle in [-1, 1]. Each env step runs FRAME_SKIP
physics ticks (control 30 Hz, physics 60 Hz).
"""

import math
from bisect import bisect_right

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from racing import constants as C
from racing.sim.car import CarState, step_car, wrap_pi
from racing.sim.collision import WallCollider
from racing.sim.lidar import Lidar
from racing.sim.progress import ProgressTracker
from racing.track.load import load_track

OBS_DIM = C.LIDAR_NUM_RAYS + 4
STUCK_STEPS = int(C.STUCK_SECONDS * 60 / C.FRAME_SKIP)
REVERSE_STEPS = int(C.REVERSE_SECONDS * 60 / C.FRAME_SKIP)
STUCK_MIN_PROGRESS = 0.5  # m over the stuck window


class RaceEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, track: dict | None = None):
        super().__init__()
        self.track = track if track is not None else load_track()
        self.collider = WallCollider(self.track)
        self.lidar = Lidar(self.track)
        self.prog = ProgressTracker(self.track)
        self.action_space = spaces.Box(-1.0, 1.0, shape=(2,), dtype=np.float32)
        self.observation_space = spaces.Box(
            -1.0, 1.0, shape=(OBS_DIM,), dtype=np.float32
        )
        self.state = CarState(0.0, 0.0, 0.0, 0.0)
        self.hint = None
        self.prev_s = 0.0
        self.prev_contact = False
        self.steps = 0
        self.reverse_count = 0
        self.recent_progress: list[float] = []
        self.laps = 0.0

    # --- helpers ---

    def _pose_at_s(self, s: float, lateral: float):
        """Centerline pose at arc length s, offset laterally."""
        s_table = self.track["s_table"]
        center = self.track["centerline"]
        tangents = self.track["tangents"]
        n = len(center)
        i = bisect_right(s_table, s) - 1
        i = max(0, min(i, n - 1))
        j = (i + 1) % n
        seg = (
            self.track["lap_length"] - s_table[i]
            if j == 0
            else s_table[j] - s_table[i]
        )
        t = (s - s_table[i]) / seg if seg > 1e-9 else 0.0
        x = center[i][0] + (center[j][0] - center[i][0]) * t
        z = center[i][1] + (center[j][1] - center[i][1]) * t
        tx, tz = tangents[i]
        heading = math.atan2(tz, tx)
        # Left normal.
        x += -tz * lateral
        z += tx * lateral
        return x, z, heading

    def _observe(self, loc):
        scan = self.lidar.scan(self.state.x, self.state.z, self.state.heading)
        herr = self.prog.heading_error(self.state.heading, loc.tangent_angle)
        obs = np.empty(OBS_DIM, dtype=np.float32)
        obs[: C.LIDAR_NUM_RAYS] = scan
        obs[C.LIDAR_NUM_RAYS] = self.state.speed / C.MAX_SPEED
        obs[C.LIDAR_NUM_RAYS + 1] = math.sin(herr)
        obs[C.LIDAR_NUM_RAYS + 2] = math.cos(herr)
        obs[C.LIDAR_NUM_RAYS + 3] = np.clip(
            loc.lateral / C.TRACK_HALF_WIDTH, -1.0, 1.0
        )
        return obs

    # --- gym API ---

    def reset(self, *, seed=None, options=None):
        super().reset(seed=seed)
        rng = self.np_random
        s0 = float(rng.uniform(0.0, self.track["lap_length"]))
        lateral = float(rng.uniform(-3.0, 3.0))
        x, z, heading = self._pose_at_s(s0, lateral)
        heading = wrap_pi(heading + float(rng.uniform(-0.15, 0.15)))
        self.state = CarState(x, z, heading, 0.0)
        self.hint = None
        loc = self.prog.locate(x, z, None)
        self.hint = loc.index
        self.prev_s = loc.s
        self.prev_contact = False
        self.steps = 0
        self.reverse_count = 0
        self.recent_progress = []
        self.laps = 0.0
        return self._observe(loc), {}

    def step(self, action):
        steer = float(action[0])
        throttle = float(action[1])
        contact = False
        for _ in range(C.FRAME_SKIP):
            self.state = step_car(self.state, steer, throttle)
            self.state, hit = self.collider.resolve(self.state)
            if hit:
                contact = True

        loc = self.prog.locate(self.state.x, self.state.z, self.hint)
        self.hint = loc.index
        delta_s = self.prog.delta_s(self.prev_s, loc.s)
        delta_s = max(-C.PROGRESS_CLAMP, min(C.PROGRESS_CLAMP, delta_s))
        self.prev_s = loc.s
        self.laps += delta_s / self.track["lap_length"]

        reward = C.REWARD_PROGRESS * delta_s
        reward += C.REWARD_SPEED * max(0.0, self.state.speed) / C.MAX_SPEED
        reward += C.REWARD_TIME
        if contact:
            reward += C.REWARD_WALL_STEP
            if not self.prev_contact:
                reward += C.REWARD_WALL_EVENT
        self.prev_contact = contact

        # Stuck detection: negligible progress over a sliding window.
        self.recent_progress.append(delta_s)
        if len(self.recent_progress) > STUCK_STEPS:
            self.recent_progress.pop(0)
        stuck = (
            len(self.recent_progress) == STUCK_STEPS
            and abs(sum(self.recent_progress)) < STUCK_MIN_PROGRESS
        )

        # Sustained reverse detection.
        if self.state.speed < -0.5 or delta_s < -0.01:
            self.reverse_count += 1
        else:
            self.reverse_count = 0
        reversing = self.reverse_count >= REVERSE_STEPS

        terminated = stuck or reversing
        if terminated:
            reward += C.REWARD_TERMINATE

        self.steps += 1
        truncated = self.steps >= C.EPISODE_MAX_STEPS

        info = {"laps": self.laps, "contact": contact}
        return self._observe(loc), float(reward), terminated, truncated, info


def make_env():
    return RaceEnv()


gym.register(id="RaceTrack-v0", entry_point="racing.env.race_env:RaceEnv")
