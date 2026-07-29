// Tiny MLP forward pass for the exported PPO policy. Plain nested loops,
// no dependencies. Verifies embedded test vectors at load time.

export class Mlp {
  constructor(policyJson) {
    this.layers = policyJson.layers;
    this.obsDim = policyJson.obs_dim;
    this.actDim = policyJson.act_dim;
    this.selfTest(policyJson.test_vectors);
  }

  // Deterministic action = clip(mean, -1, 1); no tanh on the output.
  forward(obs) {
    let h = obs;
    for (const layer of this.layers) {
      const { W, b, activation } = layer;
      const out = new Float64Array(b.length);
      for (let i = 0; i < W.length; i++) {
        const row = W[i];
        let sum = b[i];
        for (let j = 0; j < row.length; j++) {
          sum += row[j] * h[j];
        }
        out[i] = activation === "tanh" ? Math.tanh(sum) : sum;
      }
      h = out;
    }
    const action = new Float64Array(h.length);
    for (let i = 0; i < h.length; i++) {
      action[i] = Math.min(1.0, Math.max(-1.0, h[i]));
    }
    return action;
  }

  selfTest(testVectors) {
    for (const tv of testVectors) {
      const got = this.forward(tv.obs);
      for (let i = 0; i < tv.action.length; i++) {
        if (Math.abs(got[i] - tv.action[i]) > 1e-6) {
          throw new Error(
            `policy self-test failed: action[${i}] ${got[i]} != ${tv.action[i]}`
          );
        }
      }
    }
  }
}
