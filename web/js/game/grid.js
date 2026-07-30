// F1-style staggered start grid, computed in JS from the track geometry.
// Slots follow the CENTERLINE backward from the start line (not a straight
// -tangent ray), so long grids (up to 21 cars = ~70 m) stay on the tarmac
// even when a corner sits right behind the line. Lateral offsets use the
// local left normal, matching the sign convention in progress.js.
// shared/track.json is untouched, so Python parity is unaffected.

export const GRID_BACK_BASE = 4.0; // metres behind the line for row 0
export const GRID_ROW_SPACING = 6.0; // metres between rows
export const GRID_LATERAL = 2.2; // lateral offset of each column
export const GRID_STAGGER = 2.5; // extra setback for the right column

// Pose on the centerline `back` metres behind the start line, walking
// backward through the closed polyline. Returns position + forward unit
// tangent of the segment the point lands on.
function backPose(track, back) {
  const pts = track.centerline;
  const N = pts.length;
  let i = 0; // start-line index
  let dist = 0.0;
  for (let step = 0; step < N; step++) {
    const j = (i - 1 + N) % N;
    const dx = pts[i][0] - pts[j][0];
    const dz = pts[i][1] - pts[j][1];
    const seg = Math.hypot(dx, dz);
    if (dist + seg >= back && seg > 1e-9) {
      const t = (back - dist) / seg; // fraction from pts[i] back toward pts[j]
      return {
        x: pts[i][0] - dx * t,
        z: pts[i][1] - dz * t,
        tx: dx / seg,
        tz: dz / seg,
      };
    }
    dist += seg;
    i = j;
  }
  // back exceeds a full lap (cannot happen with sane grids); use start pose.
  const [tx, tz] = track.tangents[0];
  const len = Math.hypot(tx, tz);
  return { x: pts[0][0], z: pts[0][1], tx: tx / len, tz: tz / len };
}

// Returns n poses [{ x, z, heading }], slot 0 = pole position.
export function makeGrid(track, n) {
  const slots = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2; // 0 = left column (pole side), 1 = right column
    const back = GRID_BACK_BASE + row * GRID_ROW_SPACING + side * GRID_STAGGER;
    const lat = side === 0 ? GRID_LATERAL : -GRID_LATERAL;
    const p = backPose(track, back);
    // Left normal of the local tangent.
    slots.push({
      x: p.x + -p.tz * lat,
      z: p.z + p.tx * lat,
      heading: Math.atan2(p.tz, p.tx),
    });
  }
  return slots;
}
