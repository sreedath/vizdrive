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

// Browser-only car-vs-car collision.
//
// A single center circle is a bad fit for the 4.2 x 2.0 body: nose-to-tail
// the meshes overlap ~2 m before the centers get close. Instead each car is
// a capsule approximated by a row of circles along its heading (tail/center/nose),
// sized to hug the body box. Deepest-pair resolution, half the overlap each.
export const CAR_CIRCLE_OFFSETS = [-1.1, -0.55, 0.0, 0.55, 1.1];
export const CAR_CIRCLE_RADIUS = 1.0;
const CAR_CAR_ITERATIONS = 6;

function carCircles(s) {
  const fx = Math.cos(s.heading);
  const fz = Math.sin(s.heading);
  return CAR_CIRCLE_OFFSETS.map((o) => ({ x: s.x + fx * o, z: s.z + fz * o }));
}

// Returns new states; never mutates the inputs.
export function resolveCarCar(a, b) {
  let ax = a.x;
  let az = a.z;
  let bx = b.x;
  let bz = b.z;
  let contact = false;
  const minDist = 2.0 * CAR_CIRCLE_RADIUS;

  for (let iter = 0; iter < CAR_CAR_ITERATIONS; iter++) {
    const ca = carCircles({ x: ax, z: az, heading: a.heading });
    const cb = carCircles({ x: bx, z: bz, heading: b.heading });
    // Find the deepest-penetrating circle pair this iteration.
    let worst = 0.0;
    let nx = 0.0;
    let nz = 0.0;
    for (const pa of ca) {
      for (const pb of cb) {
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const dist = Math.hypot(dx, dz);
        const pen = minDist - dist;
        if (pen <= worst) continue;
        worst = pen;
        if (dist > 1e-9) {
          nx = dx / dist;
          nz = dz / dist;
        } else {
          // Coincident circles: push sideways relative to a's heading.
          nx = -Math.sin(a.heading);
          nz = Math.cos(a.heading);
        }
      }
    }
    if (worst <= 0.0) break;
    contact = true;
    const push = worst * 0.5;
    ax -= nx * push;
    az -= nz * push;
    bx += nx * push;
    bz += nz * push;
  }

  if (!contact) {
    return { a, b, contact: false };
  }
  return {
    a: { ...a, x: ax, z: az },
    b: { ...b, x: bx, z: bz },
    contact: true,
  };
}
