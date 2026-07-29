// Debug visualization of the LiDAR rays: red = wall hit within range (drawn
// to the hit point), grey = full range with no hit. Toggle with L.

import * as THREE from "three";

const RAY_Y = 0.7;
const HIT_COLOR = new THREE.Color(0xff3b30);
const MISS_COLOR = new THREE.Color(0x9aa0a8);

export class LidarViz {
  constructor(scene, C) {
    this.C = C;
    const n = C.LIDAR_NUM_RAYS;
    this.positions = new Float32Array(n * 2 * 3);
    this.colors = new Float32Array(n * 2 * 3);
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

  // scanNorm: normalized [0,1] distances from Lidar.scan for the same pose.
  update(x, z, heading, scanNorm) {
    if (!this.lines.visible) return;
    const { C } = this;
    const n = C.LIDAR_NUM_RAYS;
    for (let i = 0; i < n; i++) {
      const ang = heading - C.LIDAR_FOV / 2 + (C.LIDAR_FOV * i) / (n - 1);
      const d = scanNorm[i] * C.LIDAR_MAX_RANGE;
      const hit = scanNorm[i] < 0.999;
      const o = i * 6;
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
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }
}
