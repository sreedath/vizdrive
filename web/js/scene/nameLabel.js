// Floating name label: a THREE.Sprite with a canvas texture (name on a
// rounded dark pill with a color swatch). Added as a child of the car mesh
// group so it moves and scales with the car (including top-down scaling).

import * as THREE from "three";

const FONT = "700 44px 'Segoe UI', system-ui, sans-serif";
const PILL_HEIGHT = 72;
const PAD_X = 24;
const DOT_R = 14;
// Base world-units-per-canvas-pixel; rescaled per frame with camera
// distance (see scaleNameLabel) so labels keep a readable screen size.
const WORLD_PER_PX = 0.011;

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function buildNameLabel(name, colorCss) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = FONT;
  const textW = Math.ceil(ctx.measureText(name).width);
  const w = textW + PAD_X * 3 + DOT_R * 2;
  const h = PILL_HEIGHT;
  canvas.width = w;
  canvas.height = h;

  // Pill background.
  ctx.fillStyle = "rgba(10, 14, 22, 0.82)";
  roundedRect(ctx, 1, 1, w - 2, h - 2, h / 2 - 1);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 140, 180, 0.55)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Color swatch dot.
  ctx.fillStyle = colorCss;
  ctx.beginPath();
  ctx.arc(PAD_X + DOT_R, h / 2, DOT_R, 0, 2 * Math.PI);
  ctx.fill();

  // Name text.
  ctx.font = FONT;
  ctx.fillStyle = "#e8eaf0";
  ctx.textBaseline = "middle";
  ctx.fillText(name, PAD_X + DOT_R * 2 + PAD_X / 2, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.userData.pxW = w;
  sprite.userData.pxH = h;
  sprite.scale.set(w * WORLD_PER_PX, h * WORLD_PER_PX, 1);
  sprite.position.set(0, 3.4, 0);
  sprite.renderOrder = 10;
  return sprite;
}

// Set the sprite's world size from a world-units-per-pixel factor.
export function scaleNameLabel(sprite, worldPerPx) {
  sprite.scale.set(
    sprite.userData.pxW * worldPerPx,
    sprite.userData.pxH * worldPerPx,
    1
  );
}

export function disposeNameLabel(sprite) {
  sprite.material.map.dispose();
  sprite.material.dispose();
}
