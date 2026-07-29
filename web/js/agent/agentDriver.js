// Agent driver: builds the observation vector in the EXACT order used by
// racing/env/race_env.py and runs the exported policy every FRAME_SKIP ticks.

import { Mlp } from "./mlp.js";

export class AgentDriver {
  constructor(policyJson, lidar, progress, C) {
    this.mlp = new Mlp(policyJson);
    this.lidar = lidar;
    this.progress = progress;
    this.C = C;
    this.speedScale = policyJson.speed_scale ?? 1.0;
    this.hint = null;
    this.tick = 0;
    this.steer = 0.0;
    this.throttle = 0.0;
  }

  reset() {
    this.hint = null;
    this.tick = 0;
    this.steer = 0.0;
    this.throttle = 0.0;
  }

  // Called every physics tick; recomputes the action every FRAME_SKIP ticks
  // (30 Hz control), mirroring the training-time action repeat.
  // others: optional array of other cars' states ({x, z, heading}) sensed
  // by the LiDAR as collision capsules, matching OvertakeEnv training.
  drive(state, others = null) {
    const { C } = this;
    if (this.tick % C.FRAME_SKIP === 0) {
      const loc = this.progress.locate(state.x, state.z, this.hint);
      this.hint = loc.index;
      const scan = this.lidar.scan(state.x, state.z, state.heading, others);
      const n = C.LIDAR_NUM_RAYS;
      const obs = new Float64Array(n + 4);
      for (let i = 0; i < n; i++) {
        obs[i] = scan[i];
      }
      let herr = state.heading - loc.tangentAngle;
      herr = herr - 2 * Math.PI * Math.floor((herr + Math.PI) / (2 * Math.PI));
      obs[n] = state.speed / C.MAX_SPEED;
      obs[n + 1] = Math.sin(herr);
      obs[n + 2] = Math.cos(herr);
      obs[n + 3] = Math.min(
        1.0,
        Math.max(-1.0, loc.lateral / C.TRACK_HALF_WIDTH)
      );
      const action = this.mlp.forward(obs);
      this.steer = action[0];
      this.throttle = action[1] > 0 ? action[1] * this.speedScale : action[1];
    }
    this.tick += 1;
    return { steer: this.steer, throttle: this.throttle };
  }
}
