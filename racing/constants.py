"""Single source of truth for all physics / lidar / track constants.

`write_constants_json()` dumps them to shared/physics_constants.json so the
JavaScript side reads the exact same values. Keep every value a plain float or
int (JSON-representable, no NumPy types).
"""

import json
import math
from pathlib import Path

# --- Timing ---
DT = 1.0 / 60.0                 # physics timestep (s)
FRAME_SKIP = 2                  # agent acts every FRAME_SKIP physics ticks (30 Hz)

# --- Car geometry / limits ---
WHEELBASE = 2.5                 # m
MAX_STEER = 0.55                # rad
MAX_SPEED = 30.0                # m/s forward
MAX_REVERSE_SPEED = 6.0         # m/s reverse
ACCEL = 12.0                    # m/s^2 full throttle
BRAKE_DECEL = 25.0              # m/s^2 full brake
DRAG = 0.35                     # 1/s linear drag coefficient (v * DRAG)
ROLL_DECEL = 1.5                # m/s^2 rolling friction
STEER_SPEED_FACTOR = 0.35       # steering attenuation with speed
CAR_RADIUS = 1.1                # m collision circle

# --- Collision ---
WALL_SPEED_KEEP = 0.85          # speed multiplier on wall contact (slide)

# --- Track ---
TRACK_HALF_WIDTH = 7.0          # m
CENTERLINE_SPACING = 2.0        # m resample spacing
NUM_CHECKPOINTS = 20

# --- LiDAR ---
LIDAR_NUM_RAYS = 24
LIDAR_FOV = 240.0 * math.pi / 180.0   # rad
LIDAR_MAX_RANGE = 50.0                # m
LIDAR_GRID_CELL = 16.0                # m spatial-grid cell size

# --- Env / reward ---
EPISODE_MAX_STEPS = 2700        # 90 s at 30 Hz control
PROGRESS_CLAMP = 5.0            # max |delta_s| per control step
REWARD_PROGRESS = 1.0
REWARD_WALL_STEP = -0.5
REWARD_WALL_EVENT = -3.0
REWARD_TIME = -0.02
REWARD_SPEED = 0.1
REWARD_TERMINATE = -30.0
STUCK_SECONDS = 3.0
REVERSE_SECONDS = 3.0

SHARED_DIR = Path(__file__).resolve().parent.parent / "shared"


def constants_dict() -> dict:
    return {
        "DT": DT,
        "FRAME_SKIP": FRAME_SKIP,
        "WHEELBASE": WHEELBASE,
        "MAX_STEER": MAX_STEER,
        "MAX_SPEED": MAX_SPEED,
        "MAX_REVERSE_SPEED": MAX_REVERSE_SPEED,
        "ACCEL": ACCEL,
        "BRAKE_DECEL": BRAKE_DECEL,
        "DRAG": DRAG,
        "ROLL_DECEL": ROLL_DECEL,
        "STEER_SPEED_FACTOR": STEER_SPEED_FACTOR,
        "CAR_RADIUS": CAR_RADIUS,
        "WALL_SPEED_KEEP": WALL_SPEED_KEEP,
        "TRACK_HALF_WIDTH": TRACK_HALF_WIDTH,
        "LIDAR_NUM_RAYS": LIDAR_NUM_RAYS,
        "LIDAR_FOV": LIDAR_FOV,
        "LIDAR_MAX_RANGE": LIDAR_MAX_RANGE,
        "LIDAR_GRID_CELL": LIDAR_GRID_CELL,
    }


def write_constants_json() -> Path:
    SHARED_DIR.mkdir(parents=True, exist_ok=True)
    out = SHARED_DIR / "physics_constants.json"
    with open(out, "w") as f:
        json.dump(constants_dict(), f, indent=2)
        f.write("\n")
    return out


if __name__ == "__main__":
    path = write_constants_json()
    print(f"wrote {path}")
