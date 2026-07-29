// Debug visualization of the LiDAR rays for every car: red = hit within
// range (drawn to the hit point), grey = full range with no hit.
// Toggle with L.

import * as THREE from "three";

const RAY_Y = 0.7;
const HIT_COLOR = new THREE.Color(0xff3b30);
const MISS_COLOR = new THREE.Color(0x9aa0a8);

export class LidarViz {
  constructor(scene, C, maxCars = 1) {
    this.C = C;
    this.maxCars = maxCars;
    const segs = C.LIDAR_NUM_RAYS * maxCars;
    this.positions = new Float32Array(segs * 2 * 3);
    this.colors = new Float32Array(segs * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position", new THREE.BufferAttribute(this.positions, 3)
    );
    geo.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.lines.visible = false;
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  toggle() {
    this.lines.visible = !this.lines.visible;
    return this.lines.visible;
  }

  // entries: [{x, z, heading, scan}] per car, scan being the normalized
  // [0,1] distances from Lidar.scan for that pose.
  update(entries) {
    if (!this.lines.visible) return;
    const { C } = this;
    const n = C.LIDAR_NUM_RAYS;
    const count = Math.min(entries.length, this.maxCars);
    for (let ci = 0; ci < count; ci++) {
      const { x, z, heading, scan } = entries[ci];
      for (let i = 0; i < n; i++) {
        const ang = heading - C.LIDAR_FOV / 2 + (C.LIDAR_FOV * i) / (n - 1);
        const d = scan[i] * C.LIDAR_MAX_RANGE;
        const hit = scan[i] < 0.999;
        const o = (ci * n + i) * 6;
        this.positions[o] = x;
        this.positions[o + 1] = RAY_Y;
        this.positions[o + 2] = z;
        this.positions[o + 3] = x + Math.cos(ang) * d;
        this.positions[o + 4] = RAY_Y;
        this.positions[o + 5] = z + Math.sin(ang) * d;
        const c = hit ? HIT_COLOR : MISS_COLOR;
        for (const k of [0, 3]) {
          this.colors[o + k] = c.r;
          this.colors[o + k + 1] = c.g;
          this.colors[o + k + 2] = c.b;
        }
      }
    }
    this.lines.geometry.setDrawRange(0, count * n * 2);
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }
}
