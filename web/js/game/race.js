// Race logic: countdown, ordered checkpoint gates, lap counting, finish.

function segIntersect(p1x, p1z, p2x, p2z, p3x, p3z, p4x, p4z) {
  const d1x = p2x - p1x;
  const d1z = p2z - p1z;
  const d2x = p4x - p3x;
  const d2z = p4z - p3z;
  const denom = d1x * d2z - d1z * d2x;
  if (Math.abs(denom) < 1e-12) return false;
  const wx = p3x - p1x;
  const wz = p3z - p1z;
  const t = (wx * d2z - wz * d2x) / denom;
  const u = (wx * d1z - wz * d1x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export const COUNTDOWN_SECONDS = 3.0;

export class RaceManager {
  constructor(track, numLaps = 3) {
    this.gates = track.checkpoints.map((cp) => ({
      lx: cp.left[0],
      lz: cp.left[1],
      rx: cp.right[0],
      rz: cp.right[1],
    }));
    this.numLaps = numLaps;
    this.reset();
  }

  reset() {
    this.phase = "countdown"; // countdown | racing | finished
    this.time = -COUNTDOWN_SECONDS;
    this.cars = new Map();
  }

  addCar(id) {
    this.cars.set(id, {
      nextGate: 0,
      gatesPassed: 0,
      lapsCompleted: 0,
      lapStart: 0.0,
      lapTimes: [],
      finished: false,
      finishTime: null,
    });
  }

  // Advance race clock by dt. Returns true on transition to racing (GO).
  tick(dt) {
    const wasCountdown = this.phase === "countdown";
    this.time += dt;
    if (wasCountdown && this.time >= 0) {
      this.phase = "racing";
      for (const car of this.cars.values()) {
        car.lapStart = 0.0;
      }
      return true;
    }
    return false;
  }

  get countdownValue() {
    // 3, 2, 1 then null once racing.
    if (this.phase !== "countdown") return null;
    return Math.min(3, Math.ceil(-this.time));
  }

  // Check gate crossings for a car moving prev -> cur this tick.
  update(id, prevX, prevZ, curX, curZ) {
    if (this.phase !== "racing") return;
    const car = this.cars.get(id);
    if (car.finished) return;
    const g = this.gates[car.nextGate];
    if (
      !segIntersect(prevX, prevZ, curX, curZ, g.lx, g.lz, g.rx, g.rz)
    ) {
      return;
    }
    if (car.nextGate === 0 && car.gatesPassed > 0) {
      // Completed a full ordered cycle: lap done.
      car.lapTimes.push(this.time - car.lapStart);
      car.lapStart = this.time;
      car.lapsCompleted += 1;
      if (car.lapsCompleted >= this.numLaps) {
        car.finished = true;
        car.finishTime = this.time;
      }
    }
    car.gatesPassed += 1;
    car.nextGate = (car.nextGate + 1) % this.gates.length;
  }

  everyoneFinished() {
    for (const car of this.cars.values()) {
      if (!car.finished) return false;
    }
    return true;
  }

  maybeFinish() {
    if (this.phase === "racing" && this.everyoneFinished()) {
      this.phase = "finished";
    }
  }

  carState(id) {
    return this.cars.get(id);
  }
}

export function formatTime(t) {
  if (t === null || t === undefined || !isFinite(t)) return "--:--.---";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}
