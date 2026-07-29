// F1-style staggered start grid, computed in JS from the track start pose.
// Same frame math as racing/track/build_track.py: slots sit behind the
// start line along -tangent, offset laterally along the left normal.
// shared/track.json is untouched, so Python parity is unaffected.

export const GRID_BACK_BASE = 4.0; // metres behind the line for row 0
export const GRID_ROW_SPACING = 6.0; // metres between rows
export const GRID_LATERAL = 2.2; // lateral offset of each column
export const GRID_STAGGER = 2.5; // extra setback for the right column

// Returns n poses [{ x, z, heading }], slot 0 = pole position.
export function makeGrid(track, n) {
  const [cx, cz] = track.centerline[0];
  let [tx, tz] = track.tangents[0];
  const len = Math.hypot(tx, tz);
  tx /= len;
  tz /= len;
  // Left normal of the tangent (positive-lateral side in progress.js).
  const nx = -tz;
  const nz = tx;
  const heading = Math.atan2(tz, tx);

  const slots = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2; // 0 = left column (pole side), 1 = right column
    const back = GRID_BACK_BASE + row * GRID_ROW_SPACING + side * GRID_STAGGER;
    const lat = side === 0 ? GRID_LATERAL : -GRID_LATERAL;
    slots.push({
      x: cx - tx * back + nx * lat,
      z: cz - tz * back + nz * lat,
      heading,
    });
  }
  return slots;
}
