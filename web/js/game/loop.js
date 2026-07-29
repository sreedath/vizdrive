// Entry point: loads shared JSON, builds the world, runs the fixed-timestep
// loop with render interpolation.

import * as THREE from "three";
import { loadConstants, loadTrack } from "../sim/constants.js";
import { stepCar } from "../sim/car.js";
import { WallCollider } from "../sim/collision.js";
import { buildTrackMeshes } from "../scene/trackMesh.js";
import { buildCity } from "../scene/city.js";
import { buildCarMesh, placeCarMesh } from "../scene/carMesh.js";
import { createRenderer, createScene } from "../scene/sceneSetup.js";
import { ChaseCamera, TopDownCamera } from "../scene/cameras.js";
import { Input } from "./input.js";
import { Hud } from "./hud.js";
import { RaceManager } from "./race.js";

const NUM_LAPS = 3;
const MAX_SUBSTEPS = 5;

async function main() {
  const [C, track] = await Promise.all([loadConstants(), loadTrack()]);
  document.getElementById("loading").classList.add("hidden");

  const canvas = document.getElementById("game-canvas");
  const renderer = createRenderer(canvas);
  const { scene } = createScene();
  const sceneFog = scene.fog;
  scene.add(buildTrackMeshes(track));
  scene.add(buildCity(track));

  const humanMesh = buildCarMesh(0x2b6fdd);
  scene.add(humanMesh);

  const collider = new WallCollider(track, C);
  const input = new Input();
  const hud = new Hud(NUM_LAPS);
  const race = new RaceManager(track, NUM_LAPS);

  const aspect = () => window.innerWidth / window.innerHeight;
  const chaseCam = new ChaseCamera(aspect());
  const topCam = new TopDownCamera(track, aspect());
  let activeCam = chaseCam;

  let human;
  let humanPrev;

  function resetRace() {
    const slot = track.grid[0];
    human = { x: slot.x, z: slot.z, heading: slot.heading, speed: 0.0 };
    humanPrev = { ...human };
    race.reset();
    race.addCar("human");
    hud.hideBanner();
    chaseCam.initialized = false;
  }
  resetRace();

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    chaseCam.resize(aspect());
    topCam.resize(aspect());
  });

  function physicsTick() {
    const controls = input.sample(C.DT);
    race.tick(C.DT);
    const driving = race.phase === "racing";

    humanPrev = human;
    const steer = controls.steer;
    const throttle = driving ? controls.throttle : 0.0;
    let next = stepCar(human, steer, throttle, C);
    const res = collider.resolve(next);
    human = res.state;

    race.update("human", humanPrev.x, humanPrev.z, human.x, human.z);
    race.maybeFinish();
    if (race.phase === "finished") {
      const car = race.carState("human");
      hud.showBanner("FINISHED", [
        {
          name: "you",
          lapTimes: car.lapTimes,
          total: car.finishTime,
        },
      ]);
    }
  }

  let last = performance.now();
  let acc = 0.0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    if (input.consumeRestart()) {
      resetRace();
    }
    if (input.consumeCameraToggle()) {
      activeCam = activeCam === chaseCam ? topCam : chaseCam;
      // Fog only makes sense from the chase camera.
      scene.fog = activeCam === chaseCam ? sceneFog : null;
    }

    acc += dt;
    let steps = 0;
    while (acc >= C.DT && steps < MAX_SUBSTEPS) {
      physicsTick();
      acc -= C.DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) acc = 0.0;

    // Render interpolation between the two most recent physics states.
    const alpha = acc / C.DT;
    const ix = humanPrev.x + (human.x - humanPrev.x) * alpha;
    const iz = humanPrev.z + (human.z - humanPrev.z) * alpha;
    let dh = human.heading - humanPrev.heading;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    const ih = humanPrev.heading + dh * alpha;
    placeCarMesh(humanMesh, ix, iz, ih);

    chaseCam.update(ix, iz, ih, human.speed, dt);
    hud.updateDriving(human.speed, race, "human");
    hud.updateCountdown(race);

    renderer.render(scene, activeCam.camera);
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  document.getElementById("loading").textContent = `error: ${err.message}`;
  console.error(err);
});
