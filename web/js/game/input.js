// Keyboard input: arrows + WASD, with steering slew-rate smoothing for the
// human driver. Camera toggle and restart are exposed as one-shot flags.

const STEER_SLEW = 3.5; // steer units per second toward full lock
const STEER_RETURN_SLEW = 6.0; // faster return to center

export class Input {
  constructor() {
    this.keys = new Set();
    this.steer = 0.0;
    this.cameraToggled = false;
    this.restartPressed = false;

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === "KeyC" || e.code === "KeyV") {
        this.cameraToggled = true;
      }
      if (e.code === "KeyR") {
        this.restartPressed = true;
      }
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code
        )
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  // Advance steering smoothing by dt; returns { steer, throttle }.
  // steer > 0 turns right (heading toward +z seen from above).
  sample(dt) {
    const left =
      this.keys.has("ArrowLeft") || this.keys.has("KeyA") ? 1 : 0;
    const right =
      this.keys.has("ArrowRight") || this.keys.has("KeyD") ? 1 : 0;
    const up = this.keys.has("ArrowUp") || this.keys.has("KeyW") ? 1 : 0;
    const down =
      this.keys.has("ArrowDown") || this.keys.has("KeyS") ? 1 : 0;

    const target = right - left;
    // Returning toward center is quicker than winding toward full lock.
    const returning =
      target === 0 || (this.steer !== 0 && Math.sign(target) !== Math.sign(this.steer));
    const maxStep = (returning ? STEER_RETURN_SLEW : STEER_SLEW) * dt;
    const diff = target - this.steer;
    if (Math.abs(diff) <= maxStep) {
      this.steer = target;
    } else {
      this.steer += Math.sign(diff) * maxStep;
    }
    return { steer: this.steer, throttle: up - down };
  }

  consumeCameraToggle() {
    const v = this.cameraToggled;
    this.cameraToggled = false;
    return v;
  }

  consumeRestart() {
    const v = this.restartPressed;
    this.restartPressed = false;
    return v;
  }
}
