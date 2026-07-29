// LiDAR: N rays over a forward FOV arc against wall segments, accelerated by
// a uniform spatial grid + DDA walk. MUST match racing/sim/lidar.py.

const EPS = 1e-12;

// Ray (ox,oz,dx,dz) vs segment (ax,az)-(bx,bz). Returns t along ray or -1.
export function raySegment(ox, oz, dx, dz, ax, az, bx, bz) {
  const ex = bx - ax;
  const ez = bz - az;
  const denom = dx * ez - dz * ex;
  if (denom > -EPS && denom < EPS) {
    return -1.0;
  }
  const wx = ax - ox;
  const wz = az - oz;
  const t = (wx * ez - wz * ex) / denom;
  const u = (wx * dz - wz * dx) / denom;
  if (t >= 0.0 && u >= 0.0 && u <= 1.0) {
    return t;
  }
  return -1.0;
}

export class Lidar {
  constructor(track, C) {
    this.C = C;
    this.cell = C.LIDAR_GRID_CELL;
    // Segment soup from both walls (closed loops).
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
    // Grid: map "ix,iz" -> array of segment indices (bbox rasterization).
    this.grid = new Map();
    for (let i = 0; i < this.numSegs; i++) {
      const o = i * 4;
      const x0 = Math.min(this.segs[o], this.segs[o + 2]);
      const x1 = Math.max(this.segs[o], this.segs[o + 2]);
      const z0 = Math.min(this.segs[o + 1], this.segs[o + 3]);
      const z1 = Math.max(this.segs[o + 1], this.segs[o + 3]);
      const ix0 = Math.floor(x0 / this.cell);
      const ix1 = Math.floor(x1 / this.cell);
      const iz0 = Math.floor(z0 / this.cell);
      const iz1 = Math.floor(z1 / this.cell);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = `${ix},${iz}`;
          let list = this.grid.get(key);
          if (!list) {
            list = [];
            this.grid.set(key, list);
          }
          list.push(i);
        }
      }
    }
    this.stamp = new Int32Array(this.numSegs).fill(-1);
    this.rayId = 0;
  }

  // Single ray distance, capped at LIDAR_MAX_RANGE. DDA over grid cells with
  // early exit once the best hit is closer than the next cell boundary.
  castRay(ox, oz, dx, dz) {
    const { cell, grid, segs, stamp, C } = this;
    const maxR = C.LIDAR_MAX_RANGE;
    const id = this.rayId++;
    let bestT = maxR;

    let ix = Math.floor(ox / cell);
    let iz = Math.floor(oz / cell);
    const stepX = dx > 0.0 ? 1 : -1;
    const stepZ = dz > 0.0 ? 1 : -1;
    const tDeltaX = dx !== 0.0 ? Math.abs(cell / dx) : Infinity;
    const tDeltaZ = dz !== 0.0 ? Math.abs(cell / dz) : Infinity;
    let tMaxX =
      dx !== 0.0
        ? ((dx > 0.0 ? (ix + 1) * cell - ox : ox - ix * cell) / Math.abs(dx))
        : Infinity;
    let tMaxZ =
      dz !== 0.0
        ? ((dz > 0.0 ? (iz + 1) * cell - oz : oz - iz * cell) / Math.abs(dz))
        : Infinity;

    let tEntry = 0.0;
    for (let guard = 0; guard < 64; guard++) {
      if (tEntry > bestT) {
        break;
      }
      const list = grid.get(`${ix},${iz}`);
      if (list) {
        for (let k = 0; k < list.length; k++) {
          const si = list[k];
          if (stamp[si] === id) {
            continue;
          }
          stamp[si] = id;
          const o = si * 4;
          const t = raySegment(
            ox, oz, dx, dz, segs[o], segs[o + 1], segs[o + 2], segs[o + 3]
          );
          if (t >= 0.0 && t < bestT) {
            bestT = t;
          }
        }
      }
      if (tMaxX < tMaxZ) {
        tEntry = tMaxX;
        tMaxX += tDeltaX;
        ix += stepX;
      } else {
        tEntry = tMaxZ;
        tMaxZ += tDeltaZ;
        iz += stepZ;
      }
      if (tEntry > maxR) {
        break;
      }
    }
    return bestT;
  }

  // Returns Float64Array of LIDAR_NUM_RAYS normalized [0,1] distances.
  // Ray i angle: heading - FOV/2 + FOV * i / (N - 1).
  scan(x, z, heading) {
    const { C } = this;
    const n = C.LIDAR_NUM_RAYS;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ang = heading - C.LIDAR_FOV / 2.0 + (C.LIDAR_FOV * i) / (n - 1);
      const d = this.castRay(x, z, Math.cos(ang), Math.sin(ang));
      out[i] = d / C.LIDAR_MAX_RANGE;
    }
    return out;
  }
}
