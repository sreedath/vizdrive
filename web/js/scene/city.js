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

// Cheap window grid painted once onto a small canvas per palette color.
function windowTexture(baseColor, rand) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const c = new THREE.Color(baseColor);
  ctx.fillStyle = `rgb(${c.r * 255}, ${c.g * 255}, ${c.b * 255})`;
  ctx.fillRect(0, 0, 64, 128);
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 5; col++) {
      const lit = rand() < 0.25;
      ctx.fillStyle = lit
        ? "rgba(255, 236, 160, 0.9)"
        : "rgba(28, 36, 52, 0.75)";
      ctx.fillRect(6 + col * 11, 8 + row * 9.5, 7, 5.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildingMaterials(rand) {
  // Per palette color: window-textured sides + plain roof.
  return PALETTE.map((color) => {
    const sideMat = new THREE.MeshLambertMaterial({
      map: windowTexture(color, rand),
    });
    const roofMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color).multiplyScalar(0.55),
    });
    // Box material order: +x, -x, +y, -y, +z, -z.
    return [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
  });
}

function buildTree(rand) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4a2e })
  );
  trunk.position.y = 0.8;
  group.add(trunk);
  const size = 2.2 + rand() * 2.2;
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.55, size * 1.5, 7),
    new THREE.MeshLambertMaterial({
      color: rand() < 0.5 ? 0x3f7a3a : 0x4f8a44,
    })
  );
  crown.position.y = 1.4 + size * 0.75;
  crown.castShadow = true;
  group.add(crown);
  return group;
}

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
  const materials = buildingMaterials(rand);

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

  // Trees: sprinkle between the road and the buildings (tighter margin).
  let trees = 0;
  for (let i = 0; i < 700 && trees < 130; i++) {
    const x = minX + rand() * (maxX - minX);
    const z = minZ + rand() * (maxZ - minZ);
    let minWall2 = Infinity;
    for (const [wx, wz] of walls) {
      const dx = x - wx;
      const dz = z - wz;
      const d2 = dx * dx + dz * dz;
      if (d2 < minWall2) minWall2 = d2;
    }
    // Never on the road: stay clear of the centerline by half-width + margin.
    let minCenter2 = Infinity;
    for (const [cx, cz] of track.centerline) {
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < minCenter2) minCenter2 = d2;
    }
    const roadClear = track.half_width + 3.0;
    if (minCenter2 < roadClear * roadClear) continue;
    // Keep trees in a band near the track.
    if (minWall2 < 3.0 * 3.0 || minWall2 > 45 * 45) continue;
    let ok = true;
    for (const b of placedBoxes) {
      if (Math.abs(x - b.x) < b.w * 0.6 + 2 && Math.abs(z - b.z) < b.d * 0.6 + 2) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const tree = buildTree(rand);
    tree.position.set(x, 0, z);
    group.add(tree);
    trees++;
  }
  return group;
}
