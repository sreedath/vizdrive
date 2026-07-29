"""Deterministic evaluation: lap times, wall contacts, distance covered.

Usage: python3 -m racing.train.evaluate [--model runs/ppo_race] [--episodes 3]
"""

import argparse
from pathlib import Path

import numpy as np
from stable_baselines3 import PPO

from racing import constants as C
from racing.env.race_env import RaceEnv

ROOT = Path(__file__).resolve().parent.parent.parent
CONTROL_DT = C.DT * C.FRAME_SKIP


def run_episode(model, env, seed):
    obs, _ = env.reset(seed=seed)
    # Start from the grid slot (not random) for lap-time comparability:
    # place at s=0 equivalent by resetting to fixed pose.
    done = False
    steps = 0
    contacts = 0
    contact_events = 0
    prev_contact = False
    lap_marks = []
    while not done:
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, term, trunc, info = env.step(action)
        steps += 1
        if info["contact"]:
            contacts += 1
            if not prev_contact:
                contact_events += 1
        prev_contact = info["contact"]
        while info["laps"] >= len(lap_marks) + 1:
            lap_marks.append(steps * CONTROL_DT)
        done = term or trunc
    lap_times = [
        lap_marks[i] - (lap_marks[i - 1] if i > 0 else 0.0)
        for i in range(len(lap_marks))
    ]
    return {
        "laps": info["laps"],
        "lap_times": lap_times,
        "steps": steps,
        "contact_steps": contacts,
        "contact_events": contact_events,
        "terminated": term,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default=str(ROOT / "runs" / "ppo_race"))
    parser.add_argument("--episodes", type=int, default=3)
    args = parser.parse_args()

    model = PPO.load(args.model, device="cpu")
    env = RaceEnv()
    all_laps = []
    for ep in range(args.episodes):
        r = run_episode(model, env, seed=100 + ep)
        all_laps.extend(r["lap_times"])
        lap_str = ", ".join(f"{t:.2f}s" for t in r["lap_times"]) or "none"
        print(
            f"ep{ep}: laps={r['laps']:.2f} lap_times=[{lap_str}] "
            f"contact_steps={r['contact_steps']} events={r['contact_events']} "
            f"crashed={r['terminated']}"
        )
    if all_laps:
        print(
            f"\nmean lap {np.mean(all_laps):.2f}s  best lap {np.min(all_laps):.2f}s"
        )


if __name__ == "__main__":
    main()
