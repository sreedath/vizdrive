// Car-vs-wall collision (slide, no bounce) and car-vs-car push-apart.
// Wall part MUST match racing/sim/collision.py line by line.

// Distance^2 from point (px,pz) to segment (ax,az)-(bx,bz); also returns
// closest point. Pure scalar math for parity.
export function closestOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = 0.0;
  if (len2 > 1e-12) {
    t = ((px - ax) * dx + (pz - az) * dz) / len2;
    if (t < 0.0) t = 0.0;
    else if (t > 1.0) t = 1.0;
  }
  const cx = ax + dx * t;
  const cz = az + dz * t;
  const ddx = px - cx;
  const ddz = pz - cz;
  return { dist2: ddx * ddx + ddz * ddz, cx, cz };
}

export class WallCollider {
  constructor(track, C) {
    this.C = C;
    // Flatten both walls into one closed-loop segment soup.
    const segs = [];
    for (const wall of [track.left_wall, track.right_wall]) {
      const n = wall.length;
      for (let i = 0; i < n; i++) {
        const a = wall[i];
        const b = wall[(i + 1) % n];
        segs.push(a[0], a[1], b[0], b[1]);
      }
    }
    this.segs = new Float64Array(segs);
    this.numSegs = segs.length / 4;
  }

  // Returns { state, contact }. New state object, input untouched.
  resolve(state) {
    const { segs, numSegs, C } = this;
    let best = Infinity;
    let bx = 0.0;
    let bz = 0.0;
    for (let i = 0; i < numSegs; i++) {
      const o = i * 4;
      const r = closestOnSegment(
        state.x, state.z, segs[o], segs[o + 1], segs[o + 2], segs[o + 3]
      );
      if (r.dist2 < best) {
        best = r.dist2;
        bx = r.cx;
        bz = r.cz;
      }
    }
    const dist = Math.sqrt(best);
    if (dist >= C.CAR_RADIUS) {
      return { state, contact: false };
    }
    let nx;
    let nz;
    if (dist > 1e-9) {
      nx = (state.x - bx) / dist;
      nz = (state.z - bz) / dist;
    } else {
      // Degenerate: push back along heading.
      nx = -Math.cos(state.heading);
      nz = -Math.sin(state.heading);
    }
    return {
      state: {
        x: bx + nx * C.CAR_RADIUS,
        z: bz + nz * C.CAR_RADIUS,
        heading: state.heading,
        speed: state.speed * C.WALL_SPEED_KEEP,
      },
      contact: true,
    };
  }
}

// Browser-only: circle push-apart, half the overlap each. Returns new states.
export function resolveCarCar(a, b, C) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = 2.0 * C.CAR_RADIUS;
  if (dist >= minDist || dist < 1e-9) {
    return { a, b, contact: false };
  }
  const push = (minDist - dist) * 0.5;
  const nx = dx / dist;
  const nz = dz / dist;
  return {
    a: { ...a, x: a.x - nx * push, z: a.z - nz * push },
    b: { ...b, x: b.x + nx * push, z: b.z + nz * push },
    contact: true,
  };
}
