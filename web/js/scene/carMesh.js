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
  return group;
}

// Place a car mesh from sim state (heading rad from +x toward +z, y-up world).
export function placeCarMesh(mesh, x, z, heading) {
  mesh.position.set(x, 0, z);
  mesh.rotation.y = -heading;
}
