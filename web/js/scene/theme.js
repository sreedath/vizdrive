// Day / night visual themes with a smooth crossfade. Purely cosmetic:
// mutates colors and light intensities in place (no geometry, no physics,
// no training impact).

import * as THREE from "three";

const DAY = {
  background: new THREE.Color(0x87a7c7),
  fog: new THREE.Color(0x87a7c7),
  hemiSky: new THREE.Color(0xcfe4ff),
  hemiGround: new THREE.Color(0x3a4a3a),
  hemiIntensity: 0.85,
  sunColor: new THREE.Color(0xfff2d9),
  sunIntensity: 1.6,
  ground: new THREE.Color(0x4a5d45),
  windowGlow: 0.0,
};

const NIGHT = {
  background: new THREE.Color(0x070c18),
  fog: new THREE.Color(0x0a1122),
  hemiSky: new THREE.Color(0x27395c),
  hemiGround: new THREE.Color(0x0a0e16),
  hemiIntensity: 0.55,
  sunColor: new THREE.Color(0xa8bcff), // moonlight
  sunIntensity: 0.4,
  ground: new THREE.Color(0x232e22),
  windowGlow: 0.85,
};

const TRANSITION_SECONDS = 1.6;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// env: { scene, fog, sun, hemi, ground }. mix: 0 = day, 1 = night.
export class ThemeMixer {
  constructor(env) {
    this.env = env;
    this.mix = 0.0;
    this.target = 0.0;
    this.windowMats = [];
  }

  // Collect themed materials (building window facades) from scene groups;
  // call again whenever those groups are rebuilt.
  setGroups(groups) {
    this.windowMats = [];
    for (const group of groups) {
      group.traverse((obj) => {
        if (!obj.material) return;
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const m of mats) {
          if (m.userData.window && !this.windowMats.includes(m)) {
            m.emissive.set(0xffffff); // intensity carries the animation
            this.windowMats.push(m);
          }
        }
      });
    }
    this.applyNow();
  }

  setTarget(name) {
    this.target = name === "night" ? 1.0 : 0.0;
  }

  snap(name) {
    this.setTarget(name);
    this.mix = this.target;
    this.applyNow();
  }

  applyNow() {
    const { env, mix } = this;
    env.scene.background.lerpColors(DAY.background, NIGHT.background, mix);
    env.fog.color.lerpColors(DAY.fog, NIGHT.fog, mix);
    env.hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, mix);
    env.hemi.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, mix);
    env.hemi.intensity = lerp(DAY.hemiIntensity, NIGHT.hemiIntensity, mix);
    env.sun.color.lerpColors(DAY.sunColor, NIGHT.sunColor, mix);
    env.sun.intensity = lerp(DAY.sunIntensity, NIGHT.sunIntensity, mix);
    env.ground.material.color.lerpColors(DAY.ground, NIGHT.ground, mix);
    const glow = lerp(DAY.windowGlow, NIGHT.windowGlow, mix);
    for (const m of this.windowMats) m.emissiveIntensity = glow;
  }

  // Advance the crossfade; returns true while still animating.
  update(dt) {
    if (this.mix === this.target) return false;
    const step = dt / TRANSITION_SECONDS;
    this.mix =
      this.mix < this.target
        ? Math.min(this.target, this.mix + step)
        : Math.max(this.target, this.mix - step);
    this.applyNow();
    return true;
  }
}
