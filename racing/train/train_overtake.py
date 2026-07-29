"""PPO training in traffic (RaceTrackOvertake-v0).

The learner races among slowed-down frozen policies and is penalized for
touching them (see racing/env/overtake_env.py). Warm-starting from a strong
single-car model is recommended: it already laps fast and only has to learn
clean passing.

Usage:
  python3 -m racing.train.train_overtake --init-from runs/ppo_race \
      --steps 400000 --out runs/ppo_overtake
"""

import argparse
from functools import partial
from pathlib import Path

import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.vec_env import SubprocVecEnv, VecMonitor

from racing import constants as C
from racing.env.overtake_env import OvertakeEnv

ROOT = Path(__file__).resolve().parent.parent.parent
RUNS = ROOT / "runs"
NUM_ENVS = 16


def shaped_reward(sig, car_step: float, car_event: float) -> float:
    """default_reward with configurable car-contact penalties."""
    r = C.REWARD_PROGRESS * sig.delta_s
    r += C.REWARD_SPEED * max(0.0, sig.speed) / C.MAX_SPEED
    r += C.REWARD_TIME
    if sig.wall_contact:
        r += C.REWARD_WALL_STEP
    if sig.new_wall_hit:
        r += C.REWARD_WALL_EVENT
    if sig.car_contact:
        r += car_step
    if sig.new_car_hit:
        r += car_event
    if sig.terminated:
        r += C.REWARD_TERMINATE
    return r


def make_env(rank: int, n_opponents: int, car_step: float, car_event: float):
    def _init():
        env = OvertakeEnv(
            n_opponents=n_opponents,
            reward_fn=partial(
                shaped_reward, car_step=car_step, car_event=car_event
            ),
        )
        env.reset(seed=2000 + rank)
        return env

    return _init


def linear_schedule(initial: float):
    def fn(progress_remaining: float) -> float:
        return initial * progress_remaining

    return fn


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=400_000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=str, default=str(RUNS / "ppo_overtake"))
    parser.add_argument("--init-from", type=str, default=None)
    parser.add_argument("--n-opponents", type=int, default=3)
    parser.add_argument("--save-freq", type=int, default=100_000)
    parser.add_argument("--prefix", type=str, default="ppo_overtake")
    parser.add_argument("--car-step", type=float, default=-0.5)
    parser.add_argument("--car-event", type=float, default=-3.0)
    args = parser.parse_args()

    torch.set_num_threads(4)
    RUNS.mkdir(exist_ok=True)

    vec = VecMonitor(
        SubprocVecEnv(
            [
                make_env(i, args.n_opponents, args.car_step, args.car_event)
                for i in range(NUM_ENVS)
            ]
        )
    )
    if args.init_from:
        model = PPO.load(
            args.init_from,
            env=vec,
            device="cpu",
            custom_objects={"learning_rate": linear_schedule(1.5e-4)},
        )
        model.set_random_seed(args.seed)
    else:
        model = PPO(
            "MlpPolicy",
            vec,
            policy_kwargs=dict(
                net_arch=dict(pi=[128, 128], vf=[128, 128]),
                activation_fn=torch.nn.Tanh,
            ),
            n_steps=1024,
            batch_size=2048,
            n_epochs=10,
            learning_rate=linear_schedule(3e-4),
            gamma=0.995,
            gae_lambda=0.95,
            clip_range=0.2,
            ent_coef=0.003,
            seed=args.seed,
            device="cpu",
            verbose=1,
        )
    checkpoint = CheckpointCallback(
        save_freq=max(args.save_freq // NUM_ENVS, 1),
        save_path=str(RUNS / "checkpoints"),
        name_prefix=args.prefix,
    )
    model.learn(total_timesteps=args.steps, callback=checkpoint)
    model.save(args.out)
    print(f"saved model to {args.out}.zip")


if __name__ == "__main__":
    main()
