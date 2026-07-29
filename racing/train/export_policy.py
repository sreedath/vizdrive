"""Export the trained SB3 PPO policy to shared/policy.json for the browser.

Dumps mlp_extractor.policy_net + action_net as row-major weight matrices.
Deterministic action = clip(mean, -1, 1) (SB3 Box PPO uses the clipped
Gaussian mean; there is NO tanh on the output). Embeds test vectors so the
JS side can self-verify at load.

Usage: python3 -m racing.train.export_policy [--model runs/ppo_race]
       [--speed-scale 1.0]
"""

import argparse
import json
from pathlib import Path

import numpy as np
import torch
from stable_baselines3 import PPO

ROOT = Path(__file__).resolve().parent.parent.parent
SHARED = ROOT / "shared"
NUM_TEST_VECTORS = 5


def extract_layers(model: PPO):
    """Ordered [(W, b, activation), ...] for the deterministic actor path."""
    layers = []
    policy_net = model.policy.mlp_extractor.policy_net
    for module in policy_net:
        if isinstance(module, torch.nn.Linear):
            layers.append(
                {
                    "W": module.weight.detach().numpy(),
                    "b": module.bias.detach().numpy(),
                    "activation": None,
                }
            )
        elif isinstance(module, torch.nn.Tanh):
            layers[-1]["activation"] = "tanh"
        else:
            raise ValueError(f"unsupported module in policy_net: {module}")
    action_net = model.policy.action_net
    layers.append(
        {
            "W": action_net.weight.detach().numpy(),
            "b": action_net.bias.detach().numpy(),
            "activation": None,
        }
    )
    return layers


def forward_reference(layers, obs: np.ndarray) -> np.ndarray:
    """NumPy forward pass; must equal both SB3 predict and the JS mlp."""
    h = obs
    for layer in layers:
        h = layer["W"] @ h + layer["b"]
        if layer["activation"] == "tanh":
            h = np.tanh(h)
    return np.clip(h, -1.0, 1.0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default=str(ROOT / "runs" / "ppo_race"))
    parser.add_argument(
        "--speed-scale",
        type=float,
        default=1.0,
        help="throttle handicap multiplier applied in the browser (difficulty)",
    )
    parser.add_argument(
        "--out",
        type=str,
        default=str(SHARED / "policy.json"),
        help="output path (default shared/policy.json = the arena's agent)",
    )
    args = parser.parse_args()

    model = PPO.load(args.model, device="cpu")
    layers = extract_layers(model)
    obs_dim = layers[0]["W"].shape[1]

    # Cross-check against SB3's own deterministic predict on random obs.
    rng = np.random.default_rng(123)
    test_vectors = []
    for _ in range(NUM_TEST_VECTORS):
        obs = rng.uniform(-1.0, 1.0, size=obs_dim).astype(np.float64)
        ours = forward_reference(layers, obs)
        sb3, _ = model.predict(obs.astype(np.float32), deterministic=True)
        assert np.max(np.abs(ours - sb3)) < 1e-5, "export mismatch vs SB3 predict"
        test_vectors.append({"obs": obs.tolist(), "action": ours.tolist()})

    out = {
        "obs_dim": obs_dim,
        "act_dim": layers[-1]["W"].shape[0],
        "speed_scale": args.speed_scale,
        "layers": [
            {
                "W": layer["W"].astype(np.float64).tolist(),  # row-major [out][in]
                "b": layer["b"].astype(np.float64).tolist(),
                "activation": layer["activation"],
            }
            for layer in layers
        ],
        "test_vectors": test_vectors,
    }
    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(out, f)
        f.write("\n")
    n_params = sum(layer["W"].size + layer["b"].size for layer in layers)
    print(f"wrote {path} ({n_params} params, {path.stat().st_size // 1024} KiB)")


if __name__ == "__main__":
    main()
