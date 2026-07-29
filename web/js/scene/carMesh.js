// Low-poly car: body box + cabin wedge + wheels. Local +x is forward.

import * as THREE from "three";

export function buildCarMesh(bodyColor) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1f });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 2.0), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  // Cabin wedge: extruded triangle profile, sloping toward the nose.
  const shape = new THREE.Shape();
  shape.moveTo(-1.5, 0);
  shape.lineTo(0.9, 0);
  shape.lineTo(-0.2, 0.75);
  shape.lineTo(-1.1, 0.75);
  shape.closePath();
  const cabinGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 1.7,
    bevelEnabled: false,
  });
  cabinGeo.translate(0, 0, -0.85);
  const cabin = new THREE.Mesh(cabinGeo, darkMat);
  cabin.position.y = 0.9;
  cabin.castShadow = true;
  group.add(cabin);

  // Cylinder wheels, axis lateral (+z local), low segment count for the
  // low-poly look.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 14);
  wheelGeo.rotateX(Math.PI / 2);
  for (const [wx, wz] of [
    [1.4, 1.0],
    [1.4, -1.0],
    [-1.4, 1.0],
    [-1.4, -1.0],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }

  // Head/tail lamps: MeshBasicMaterial ignores lighting, so a bright
  // color reads as "lit" at night with zero extra light sources.
  const headMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x1a0a0a });
  const lampGeo = new THREE.BoxGeometry(0.1, 0.22, 0.42);
  for (const z of [0.62, -0.62]) {
    const head = new THREE.Mesh(lampGeo, headMat);
    head.position.set(2.11, 0.6, z);
    group.add(head);
    const tail = new THREE.Mesh(lampGeo, tailMat);
    tail.position.set(-2.11, 0.6, z);
    group.add(tail);
  }

  // Faint headlight cone on the ground, night only.
  const coneShape = new THREE.Shape();
  coneShape.moveTo(0, -1.0);
  coneShape.lineTo(9.0, -3.0);
  coneShape.lineTo(9.0, 3.0);
  coneShape.lineTo(0, 1.0);
  coneShape.closePath();
  const cone = new THREE.Mesh(
    new THREE.ShapeGeometry(coneShape),
    new THREE.MeshBasicMaterial({
      color: 0xffedb0,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  cone.rotation.x = -Math.PI / 2;
  cone.position.set(2.1, 0.06, 0);
  cone.visible = false;
  group.add(cone);

  group.userData.lights = { head: headMat, tail: tailMat, cone };
  return group;
}

const HEAD_DAY = new THREE.Color(0x2a2a2a);
const HEAD_NIGHT = new THREE.Color(0xfff1bc);
const TAIL_DAY = new THREE.Color(0x1a0a0a);
const TAIL_NIGHT = new THREE.Color(0x991f1f);
const TAIL_BRAKE = new THREE.Color(0xff3226);

// Blend the car's lamps for night driving; mix: 0 = day, 1 = night.
export function setCarNight(mesh, mix) {
  const L = mesh.userData.lights;
  if (!L) return;
  L.mix = mix;
  L.head.color.lerpColors(HEAD_DAY, HEAD_NIGHT, mix);
  L.tailIdle = L.tailIdle ?? new THREE.Color();
  L.tailIdle.lerpColors(TAIL_DAY, TAIL_NIGHT, mix);
  L.cone.visible = mix > 0.05;
  L.cone.material.opacity = 0.1 * mix;
  if (!L.braking) L.tail.color.copy(L.tailIdle);
}

// Brake lights flare bright red whenever the car is slowing.
export function setCarBrake(mesh, braking) {
  const L = mesh.userData.lights;
  if (!L) return;
  L.braking = braking;
  if (braking) {
    L.tail.color.copy(TAIL_BRAKE);
  } else {
    L.tail.color.copy(L.tailIdle ?? TAIL_DAY);
  }
}

// Place a car mesh from sim state (heading rad from +x toward +z, y-up world).
export function placeCarMesh(mesh, x, z, heading) {
  mesh.position.set(x, 0, z);
  mesh.rotation.y = -heading;
}
