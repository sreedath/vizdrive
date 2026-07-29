// Road ribbon, striped walls, start/finish line and gantry, built from
// shared/track.json geometry.

import * as THREE from "three";

function ribbonGeometry(left, right, y = 0) {
  // Triangle strip between two closed polylines of equal length.
  const n = left.length;
  const positions = [];
  const indices = [];
  for (let i = 0; i < n; i++) {
    positions.push(left[i][0], y, left[i][1]);
    positions.push(right[i][0], y, right[i][1]);
  }
  for (let i = 0; i < n; i++) {
    const a = 2 * i;
    const b = 2 * i + 1;
    const c = (2 * i + 2) % (2 * n);
    const d = (2 * i + 3) % (2 * n);
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function wallMesh(wall, height, colorA, colorB, stripeLen) {
  // Vertical ribbon along the polyline with alternating color stripes.
  const n = wall.length;
  const positions = [];
  const colors = [];
  const indices = [];
  const ca = new THREE.Color(colorA);
  const cb = new THREE.Color(colorB);
  for (let i = 0; i < n; i++) {
    const [x, z] = wall[i];
    positions.push(x, 0, z, x, height, z);
    const c = Math.floor(i / stripeLen) % 2 === 0 ? ca : cb;
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < n; i++) {
    const a = 2 * i;
    const b = 2 * i + 1;
    const c = (2 * i + 2) % (2 * n);
    const d = (2 * i + 3) % (2 * n);
    indices.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

function startLine(track) {
  // Checkered strip across the road at s = 0.
  const cp = track.checkpoints[0];
  const l = cp.left;
  const r = cp.right;
  const group = new THREE.Group();
  const cells = 8;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < 2; j++) {
      const u0 = i / cells;
      const u1 = (i + 1) / cells;
      const px0 = l[0] + (r[0] - l[0]) * u0;
      const pz0 = l[1] + (r[1] - l[1]) * u0;
      const px1 = l[0] + (r[0] - l[0]) * u1;
      const pz1 = l[1] + (r[1] - l[1]) * u1;
      const t = track.tangents[0];
      const off = (j - 0.5) * 1.2;
      const geo = new THREE.PlaneGeometry(
        Math.hypot(px1 - px0, pz1 - pz0), 1.2
      );
      const mat = new THREE.MeshBasicMaterial({
        color: (i + j) % 2 === 0 ? 0xffffff : 0x111111,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (px0 + px1) / 2 + t[0] * off,
        0.02,
        (pz0 + pz1) / 2 + t[1] * off
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = -Math.atan2(r[1] - l[1], r[0] - l[0]);
      group.add(mesh);
    }
  }
  return group;
}

function gantry(track) {
  const cp = track.checkpoints[0];
  const group = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.6, 7, 0.6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  for (const p of [cp.left, cp.right]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(p[0], 3.5, p[1]);
    post.castShadow = true;
    group.add(post);
  }
  const span = Math.hypot(cp.right[0] - cp.left[0], cp.right[1] - cp.left[1]);
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(span + 0.6, 1.2, 1.0),
    new THREE.MeshLambertMaterial({ color: 0xc03030 })
  );
  bar.position.set(
    (cp.left[0] + cp.right[0]) / 2,
    7,
    (cp.left[1] + cp.right[1]) / 2
  );
  bar.rotation.y = -Math.atan2(
    cp.right[1] - cp.left[1],
    cp.right[0] - cp.left[0]
  );
  bar.castShadow = true;
  group.add(bar);
  return group;
}

export function buildTrackMeshes(track) {
  const group = new THREE.Group();

  const road = new THREE.Mesh(
    ribbonGeometry(track.left_wall, track.right_wall, 0.0),
    new THREE.MeshLambertMaterial({ color: 0x3c3f46, side: THREE.DoubleSide })
  );
  road.receiveShadow = true;
  group.add(road);

  group.add(wallMesh(track.left_wall, 1.0, 0xd94141, 0xf2f2f2, 4));
  group.add(wallMesh(track.right_wall, 1.0, 0xd94141, 0xf2f2f2, 4));
  group.add(startLine(track));
  group.add(gantry(track));
  return group;
}
