# City Grand Prix: Human vs PPO Agent

A lightweight browser racing game where you race a PPO-trained agent around a
1.2 km loop through a low-poly city. Physics is a kinematic bicycle model on
the ground plane (the 3D is purely visual), the agent senses the world through
24 LiDAR rays only, and the trained policy runs in-browser as a tiny
JSON-weights MLP.

## Architecture

- `racing/`: Python package. Track generation, scalar physics, LiDAR,
  Gymnasium env (`RaceTrack-v0`), PPO training (Stable-Baselines3, CPU),
  policy export.
- `web/`: static site (plain ES modules, vendored three.js, no bundler).
  Contains a line-by-line JS port of the Python physics/LiDAR.
- `shared/`: generated JSON contracts: `physics_constants.json`,
  `track.json`, `policy.json`. Python writes, JS fetches.

Determinism: fixed dt = 1/60, shared constants, and scalar math written
identically in both languages. `test_parity.py` runs the JS sim under Node
and asserts < 1e-9 divergence from Python over seeded rollouts (measured
~3e-15 over 500 steps).

## Run

```bash
# 1. Generate shared artifacts (constants + track)
bash scripts/gen_all.sh

# 2. Tests (includes the JS/Python parity gate; needs node)
python3 -m pytest racing/tests -x

# 3. Train (headless, ~30 min on 16 cores for 2M steps)
python3 -m racing.train.train_ppo                 # full run
python3 -m racing.train.train_ppo --steps 50000   # smoke run

# 4. Evaluate lap times / crashes
python3 -m racing.train.evaluate

# 5. Export policy for the browser (optional difficulty handicap)
python3 -m racing.train.export_policy --speed-scale 1.0

# 6. Serve and play
bash scripts/serve.sh   # then open http://localhost:8000/web/
```

## Controls

- Arrows / WASD: drive
- C or V: toggle chase cam / top-down map
- L: toggle LiDAR ray visualization (red = hit, grey = max range)
- R: restart race

## Agent

- Observation (28): 24 LiDAR distances (normalized, 240 deg forward arc,
  50 m range) + speed + sin/cos heading error to track tangent + lateral
  offset. No camera.
- Policy: MLP 28 -> 128 -> 128 -> 2 (steer, throttle), Tanh activations,
  ~21k params. Deterministic action = clip(mean, -1, 1).
- Control at 30 Hz (action repeat 2 over 60 Hz physics), identical in
  training and in the browser.
- Reward: +1.0/m progress along centerline, +0.1 x speed fraction,
  -0.5/step wall contact, -3.0 per new contact, -0.02/step time,
  -30 terminal for stuck/reverse.

## Difficulty tuning

Re-export with a throttle handicap to make the agent beatable:

```bash
python3 -m racing.train.export_policy --speed-scale 0.9
```
