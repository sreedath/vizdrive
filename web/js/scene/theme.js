// Day / night visual themes. Purely cosmetic: mutates colors and light
// intensities in place (no geometry, no physics, no training impact).

export const THEMES = {
  day: {
    background: 0x87a7c7,
    fog: 0x87a7c7,
    hemiSky: 0xcfe4ff,
    hemiGround: 0x3a4a3a,
    hemiIntensity: 0.85,
    sunColor: 0xfff2d9,
    sunIntensity: 1.6,
    ground: 0x4a5d45,
    windowGlow: 0.0,
  },
  night: {
    background: 0x070c18,
    fog: 0x0a1122,
    hemiSky: 0x27395c,
    hemiGround: 0x0a0e16,
    hemiIntensity: 0.55,
    sunColor: 0xa8bcff, // moonlight
    sunIntensity: 0.4,
    ground: 0x232e22,
    windowGlow: 0.85,
  },
};

// env: { scene, fog, sun, hemi, ground }; groups: objects to traverse for
// themed materials (building window facades tagged with userData.window).
export function applyTheme(env, groups, name) {
  const t = THEMES[name] ?? THEMES.day;
  env.scene.background.set(t.background);
  env.fog.color.set(t.fog);
  env.hemi.color.set(t.hemiSky);
  env.hemi.groundColor.set(t.hemiGround);
  env.hemi.intensity = t.hemiIntensity;
  env.sun.color.set(t.sunColor);
  env.sun.intensity = t.sunIntensity;
  env.ground.material.color.set(t.ground);
  for (const group of groups) {
    group.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m.userData.window) {
          m.emissive.set(t.windowGlow > 0 ? 0xffffff : 0x000000);
          m.emissiveIntensity = t.windowGlow;
        }
      }
    });
  }
}
