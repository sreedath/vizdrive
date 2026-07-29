"""PPO training for RaceTrack-v0 (SB3, CPU, SubprocVecEnv x16).

Usage:
  python3 -m racing.train.train_ppo                  # full 2M-step run
  python3 -m racing.train.train_ppo --steps 50000    # smoke run
"""

import argparse
from pathlib import Path

import torch
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import CheckpointCallback
from stable_baselines3.common.vec_env import SubprocVecEnv, VecMonitor

from racing.env.race_env import RaceEnv

ROOT = Path(__file__).resolve().parent.parent.parent
RUNS = ROOT / "runs"
NUM_ENVS = 16


def make_env(rank: int):
    def _init():
        env = RaceEnv()
        env.reset(seed=1000 + rank)
        return env

    return _init


def linear_schedule(initial: float):
    def fn(progress_remaining: float) -> float:
        return initial * progress_remaining

    return fn


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=2_000_000)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=str, default=str(RUNS / "ppo_race"))
    parser.add_argument("--save-freq", type=int, default=250_000)
    parser.add_argument("--prefix", type=str, default="ppo_race")
    parser.add_argument("--tensorboard", action="store_true")
    args = parser.parse_args()

    torch.set_num_threads(4)
    RUNS.mkdir(exist_ok=True)

    vec = VecMonitor(SubprocVecEnv([make_env(i) for i in range(NUM_ENVS)]))
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
        tensorboard_log=str(RUNS / "tb") if args.tensorboard else None,
    )
    checkpoint = CheckpointCallback(
        save_freq=max(args.save_freq // NUM_ENVS, 1),
        save_path=str(RUNS / "checkpoints"),
        name_prefix=args.prefix,
    )
    model.learn(total_timesteps=args.steps, callback=checkpoint, progress_bar=False)
    model.save(args.out)
    print(f"saved model to {args.out}.zip")


if __name__ == "__main__":
    main()
