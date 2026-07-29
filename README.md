# City Grand Prix: Multi-Agent RL Racing

A lightweight browser racing game where up to 10 PPO-trained agents (plus
optionally you) race around a 1.2 km loop through a low-poly city on an
F1-style staggered grid. Physics is a kinematic bicycle model on the ground
plane (the 3D is purely visual), agents sense the world through 24 LiDAR rays
only, and trained policies run in-browser as tiny JSON-weights MLPs.

Live arena: https://ppo-racing-arena.vercel.app
Student training lab (Colab): https://github.com/sreedath/race-agent-lab

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
- C: cycle the chase camera through the cars
- T or V: toggle chase cam / top-down map
- L: toggle LiDAR rays for ALL cars (red = hit, grey = max range)
- R: return to the lobby

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
- LiDAR senses other cars as their 3-circle collision capsules (same in
  Python and the browser, parity-tested), so agents can learn to avoid
  and overtake traffic.

## Overtaking in traffic

`RaceTrackOvertake-v0` (racing/env/overtake_env.py) races the learner among
N frozen `policy.json` opponents, throttled per episode so the learner
regularly catches them. The pluggable reward gets `car_contact` /
`new_car_hit` signals on top of the classic shaping. Train (warm start
recommended):

```bash
python3 -m racing.train.train_overtake \
    --init-from runs/checkpoints/ppo_race_500000_steps \
    --steps 400000 --out runs/ppo_overtake
```

## Racing custom agents

The lobby is a roster builder: add built-in agents from the dropdown
(checkpoint ladder 25k to 500k steps, plus 200k-step "personality" agents
trained with different reward functions: Maverick/Steady/Purist/Racer)
and/or upload any number of exported `policy.json` files (cap 10 agents). Untick "I race too" for spectator mode,
where the chase camera follows the live race leader. Classification is pure
positional F1: 3 laps, first across the line wins, grid order is shuffled
every race, and once the winner finishes the rest have 45 s before being
classified DNF.

Export any trained model or checkpoint for the roster:

```bash
python3 -m racing.train.export_policy \
    --model runs/checkpoints/ppo_race_250000_steps \
    --out runs/policy_250k.json --name "My Racer"
```

`--name` is embedded in the JSON and shown on the car's floating label and
the leaderboard; car colors are assigned randomly per race.

## Difficulty tuning

Re-export with a throttle handicap to make the agent beatable:

```bash
python3 -m racing.train.export_policy --speed-scale 0.9
```

## Classroom workflow

1. Students open the [race-agent-lab Colab
   notebook](https://github.com/sreedath/race-agent-lab) (one click, no
   installs). The lab repo contains the same physics but with the reward
   coefficients stripped: each student designs their own reward function
   against the hidden reference, trains PPO (capped at 300k steps), and
   downloads a named `policy.json`.
2. Students send their JSON files to the instructor (or upload them
   directly in the lobby).
3. The instructor opens https://ppo-racing-arena.vercel.app, drags all
   files into the roster, unticks "I race too" (or races along), and hits
   START RACE. Live leaderboard top-left, finish banner with per-lap
   times, DNFs classified 45 s after the winner.
4. Rerun START for more heats: grid order and colors reshuffle each time.

## Deployment

```bash
bash scripts/build_site.sh        # assembles dist/ (web/ + shared/)
cd dist && vercel deploy --prod   # deployed at ppo-racing-arena.vercel.app
```
