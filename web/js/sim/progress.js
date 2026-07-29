// Track-relative localization: arc-length s, signed lateral offset, tangent.
// MUST match racing/sim/progress.py.

import { wrapPi } from "./car.js";

const SEARCH_WINDOW = 12; // centerline indices searched around the hint

export class ProgressTracker {
  constructor(track) {
    this.center = track.centerline; // [[x,z], ...]
    this.sTable = track.s_table;
    this.lapLength = track.lap_length;
    this.n = this.center.length;
  }

  // Project (x,z) onto the centerline near hintIndex (null = global search).
  // Returns { s, lateral, tangentAngle, index }.
  locate(x, z, hintIndex = null) {
    const { center, sTable, lapLength, n } = this;
    let i0;
    let i1;
    if (hintIndex === null) {
      i0 = 0;
      i1 = n - 1;
    } else {
      i0 = hintIndex - SEARCH_WINDOW;
      i1 = hintIndex + SEARCH_WINDOW;
    }
    let best = Infinity;
    let bestIdx = 0;
    let bestT = 0.0;
    for (let k = i0; k <= i1; k++) {
      const i = ((k % n) + n) % n;
      const a = center[i];
      const b = center[(i + 1) % n];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len2 = dx * dx + dz * dz;
      let t = 0.0;
      if (len2 > 1e-12) {
        t = ((x - a[0]) * dx + (z - a[1]) * dz) / len2;
        if (t < 0.0) t = 0.0;
        else if (t > 1.0) t = 1.0;
      }
      const cx = a[0] + dx * t;
      const cz = a[1] + dz * t;
      const ddx = x - cx;
      const ddz = z - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < best) {
        best = d2;
        bestIdx = i;
        bestT = t;
      }
    }
    const a = center[bestIdx];
    const b = center[(bestIdx + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const segLen = Math.sqrt(dx * dx + dz * dz);
    const tx = dx / segLen;
    const tz = dz / segLen;
    const cx = a[0] + dx * bestT;
    const cz = a[1] + dz * bestT;
    // Signed lateral: positive on the left of the tangent.
    const lateral = tx * (z - cz) - tz * (x - cx);
    let s = sTable[bestIdx] + segLen * bestT;
    if (s >= lapLength) {
      s -= lapLength;
    }
    return { s, lateral, tangentAngle: Math.atan2(tz, tx), index: bestIdx };
  }

  // Shortest signed arc distance from s0 to s1 around the lap.
  deltaS(s0, s1) {
    let d = s1 - s0;
    if (d > this.lapLength / 2.0) {
      d -= this.lapLength;
    } else if (d < -this.lapLength / 2.0) {
      d += this.lapLength;
    }
    return d;
  }

  headingError(heading, tangentAngle) {
    return wrapPi(heading - tangentAngle);
  }
}
