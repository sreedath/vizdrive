// Chase camera (smoothed, look-ahead) + orthographic top-down of the track.

import * as THREE from "three";

export class ChaseCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.5, 1200);
    this.pos = new THREE.Vector3(0, 40, 0);
    this.look = new THREE.Vector3();
    this.initialized = false;
  }

  update(x, z, heading, speed, dt) {
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    const dist = 9.0 + 0.06 * Math.abs(speed);
    const height = 3.8 + 0.02 * Math.abs(speed);
    const target = new THREE.Vector3(x - fx * dist, height, z - fz * dist);
    const lookTarget = new THREE.Vector3(x + fx * 7.0, 1.0, z + fz * 7.0);
    if (!this.initialized) {
      this.pos.copy(target);
      this.look.copy(lookTarget);
      this.initialized = true;
    } else {
      const k = 1.0 - Math.exp(-6.0 * dt);
      this.pos.lerp(target, k);
      this.look.lerp(lookTarget, 1.0 - Math.exp(-10.0 * dt));
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

export class TopDownCamera {
  constructor(track, aspect) {
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
    const pad = 30;
    this.cx = (minX + maxX) / 2;
    this.cz = (minZ + maxZ) / 2;
    this.halfW = (maxX - minX) / 2 + pad;
    this.halfH = (maxZ - minZ) / 2 + pad;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 800);
    this.resize(aspect);
    this.camera.position.set(this.cx, 400, this.cz);
    this.camera.up.set(0, 0, -1); // +z track axis points down-screen
    this.camera.lookAt(this.cx, 0, this.cz);
  }

  update() {}

  resize(aspect) {
    // Fit the whole track whatever the window shape.
    let w = this.halfW;
    let h = this.halfH;
    if (w / h > aspect) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
    this.camera.left = -w;
    this.camera.right = w;
    this.camera.top = h;
    this.camera.bottom = -h;
    this.camera.updateProjectionMatrix();
  }
}
