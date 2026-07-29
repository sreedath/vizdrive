// Seeded low-poly city: box buildings scattered around the track, rejected
// within a safety margin of the walls so they never block the road.

import * as THREE from "three";

const CITY_SEED = 1337;
const MARGIN = 12.0; // min distance from any wall point
const NUM_ATTEMPTS = 900;
const MAX_BUILDINGS = 220;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = [0x9aa7b5, 0xb5aa9a, 0x8d9aa8, 0xa89d8d, 0x7f8b99, 0xbfb6a6];

export function buildCity(track) {
  const rand = mulberry32(CITY_SEED);
  const group = new THREE.Group();

  // Wall point cloud for rejection tests.
  const walls = track.left_wall.concat(track.right_wall);

  // Track bounding box, expanded.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of track.centerline) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const pad = 90;
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const materials = PALETTE.map(
    (c) => new THREE.MeshLambertMaterial({ color: c })
  );

  let placed = 0;
  const placedBoxes = [];
  for (let i = 0; i < NUM_ATTEMPTS && placed < MAX_BUILDINGS; i++) {
    const x = minX + rand() * (maxX - minX);
    const z = minZ + rand() * (maxZ - minZ);
    const w = 6 + rand() * 14;
    const d = 6 + rand() * 14;
    const half = Math.max(w, d) / 2;

    // Reject near walls.
    let ok = true;
    const rej = MARGIN + half;
    const rej2 = rej * rej;
    for (const [wx, wz] of walls) {
      const dx = x - wx;
      const dz = z - wz;
      if (dx * dx + dz * dz < rej2) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    // Reject heavy overlap with existing buildings.
    for (const b of placedBoxes) {
      if (Math.abs(x - b.x) < (w + b.w) * 0.45 &&
          Math.abs(z - b.z) < (d + b.d) * 0.45) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const h = 8 + rand() * rand() * 34;
    const mesh = new THREE.Mesh(
      boxGeo, materials[Math.floor(rand() * materials.length)]
    );
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    placedBoxes.push({ x, z, w, d });
    placed++;
  }
  return group;
}
