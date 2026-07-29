// Node-side half of the Python/JS parity test. Runs seeded random-action
// rollouts through the JS sim and prints a JSON trajectory dump to stdout.
//
// Usage: node web/js/sim/parity_dump_node.js <seed> <steps>
// Action sequence protocol (must match racing/tests/test_parity.py):
//   rng = mulberry32(seed)
//   every control step (FRAME_SKIP physics ticks):
//     steer = rng()*2 - 1 ; throttle = rng()*1.7 - 0.7

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { stepCar } from "./car.js";
import { WallCollider } from "./collision.js";
import { Lidar } from "./lidar.js";
import { ProgressTracker } from "./progress.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const seed = parseInt(process.argv[2] ?? "1", 10);
const steps = parseInt(process.argv[3] ?? "500", 10);

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const C = JSON.parse(
  readFileSync(join(root, "shared", "physics_constants.json"), "utf8")
);
const track = JSON.parse(
  readFileSync(join(root, "shared", "track.json"), "utf8")
);

const collider = new WallCollider(track, C);
const lidar = new Lidar(track, C);
const prog = new ProgressTracker(track);
const rng = mulberry32(seed);

let state = {
  x: track.grid[0].x,
  z: track.grid[0].z,
  heading: track.grid[0].heading,
  speed: 0.0,
};
let hint = null;

const out = [];
for (let step = 0; step < steps; step++) {
  const steer = rng() * 2.0 - 1.0;
  const throttle = rng() * 1.7 - 0.7;
  let contact = false;
  for (let k = 0; k < C.FRAME_SKIP; k++) {
    state = stepCar(state, steer, throttle, C);
    const res = collider.resolve(state);
    state = res.state;
    if (res.contact) contact = true;
  }
  const loc = prog.locate(state.x, state.z, hint);
  hint = loc.index;
  const scan = lidar.scan(state.x, state.z, state.heading);
  out.push({
    x: state.x,
    z: state.z,
    heading: state.heading,
    speed: state.speed,
    contact: contact ? 1 : 0,
    s: loc.s,
    lateral: loc.lateral,
    tangent: loc.tangentAngle,
    scan: Array.from(scan),
  });
}
process.stdout.write(JSON.stringify(out));
