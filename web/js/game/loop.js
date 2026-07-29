// Entry point: loads shared JSON, builds the world, runs the fixed-timestep
// loop with render interpolation. Human (blue) vs PPO agent (orange).

import { loadConstants, loadTrack, loadJson } from "../sim/constants.js";
import { stepCar } from "../sim/car.js";
import { WallCollider, resolveCarCar } from "../sim/collision.js";
import { Lidar } from "../sim/lidar.js";
import { ProgressTracker } from "../sim/progress.js";
import { AgentDriver } from "../agent/agentDriver.js";
import { LidarViz } from "../scene/lidarViz.js";
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
const TOPDOWN_CAR_SCALE = 2.0;

function lerpState(prev, cur, alpha) {
  let dh = cur.heading - prev.heading;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return {
    x: prev.x + (cur.x - prev.x) * alpha,
    z: prev.z + (cur.z - prev.z) * alpha,
    heading: prev.heading + dh * alpha,
  };
}

async function main() {
  const [C, track] = await Promise.all([loadConstants(), loadTrack()]);
  let policy = null;
  try {
    policy = await loadJson("../shared/policy.json");
  } catch {
    console.warn("no policy.json yet: running single-player");
  }
  document.getElementById("loading").classList.add("hidden");

  const canvas = document.getElementById("game-canvas");
  const renderer = createRenderer(canvas);
  const { scene } = createScene();
  const sceneFog = scene.fog;
  scene.add(buildTrackMeshes(track));
  scene.add(buildCity(track));

  const collider = new WallCollider(track, C);
  const lidar = new Lidar(track, C);
  const progress = new ProgressTracker(track);
  const lidarViz = new LidarViz(scene, C);
  const input = new Input();
  const hud = new Hud(NUM_LAPS);
  const race = new RaceManager(track, NUM_LAPS);

  const humanMesh = buildCarMesh(0x2b6fdd);
  scene.add(humanMesh);
  let agentMesh = null;
  let agentDriver = null;

  function applyPolicy(policyJson, label) {
    // Throws (and changes nothing) if the policy fails its self-test.
    const driver = new AgentDriver(policyJson, lidar, progress, C);
    agentDriver = driver;
    if (!agentMesh) {
      agentMesh = buildCarMesh(0xe8720c);
      scene.add(agentMesh);
    }
    document.getElementById("agent-status").textContent = label;
    resetRace();
  }

  const aspect = () => window.innerWidth / window.innerHeight;
  const chaseCam = new ChaseCamera(aspect());
  const topCam = new TopDownCamera(track, aspect());
  let activeCam = chaseCam;

  let human;
  let humanPrev;
  let agent;
  let agentPrev;
  let bannerShown = false;

  function resetRace() {
    const s0 = track.grid[0];
    human = { x: s0.x, z: s0.z, heading: s0.heading, speed: 0.0 };
    humanPrev = { ...human };
    race.reset();
    race.addCar("human");
    if (agentDriver) {
      const s1 = track.grid[1];
      agent = { x: s1.x, z: s1.z, heading: s1.heading, speed: 0.0 };
      agentPrev = { ...agent };
      agentDriver.reset();
      race.addCar("agent");
    }
    hud.hideBanner();
    bannerShown = false;
    chaseCam.initialized = false;
  }
  resetRace();
  if (policy) {
    try {
      applyPolicy(policy, "trained (default)");
    } catch (err) {
      console.error("default policy failed self-test:", err);
    }
  }

  // Upload any exported policy.json to race against that agent.
  document.getElementById("policy-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        applyPolicy(JSON.parse(reader.result), file.name);
      } catch (err) {
        document.getElementById("agent-status").textContent = "invalid file";
        console.error("policy load failed:", err);
      }
    };
    reader.readAsText(file);
  });

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    chaseCam.resize(aspect());
    topCam.resize(aspect());
  });

  function physicsTick() {
    const controls = input.sample(C.DT);
    race.tick(C.DT);
    const driving = race.phase !== "countdown";

    humanPrev = human;
    human = stepCar(
      human, controls.steer, driving ? controls.throttle : 0.0, C
    );
    if (agentDriver) {
      agentPrev = agent;
      const a = agentDriver.drive(agent);
      agent = stepCar(agent, a.steer, driving ? a.throttle : 0.0, C);
      const cc = resolveCarCar(human, agent, C);
      human = cc.a;
      agent = cc.b;
      agent = collider.resolve(agent).state;
    }
    human = collider.resolve(human).state;

    race.update("human", humanPrev.x, humanPrev.z, human.x, human.z);
    if (agentDriver) {
      race.update("agent", agentPrev.x, agentPrev.z, agent.x, agent.z);
    }
    race.maybeFinish();
    if (race.phase === "finished" && !bannerShown) {
      bannerShown = true;
      const h = race.carState("human");
      const columns = [
        { name: "you", lapTimes: h.lapTimes, total: h.finishTime },
      ];
      let title = "FINISHED";
      if (agentDriver) {
        const a = race.carState("agent");
        columns.push({
          name: "agent", lapTimes: a.lapTimes, total: a.finishTime,
        });
        title = h.finishTime <= a.finishTime ? "YOU WIN" : "YOU LOSE";
      }
      hud.showBanner(title, columns);
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
      // Fog only makes sense from the chase camera; in the map view the cars
      // are scaled up so they stay visible at track scale.
      const isChase = activeCam === chaseCam;
      scene.fog = isChase ? sceneFog : null;
      const scale = isChase ? 1.0 : TOPDOWN_CAR_SCALE;
      humanMesh.scale.setScalar(scale);
      if (agentMesh) agentMesh.scale.setScalar(scale);
    }
    if (input.consumeLidarToggle()) {
      lidarViz.toggle();
    }

    acc += dt;
    let steps = 0;
    while (acc >= C.DT && steps < MAX_SUBSTEPS) {
      physicsTick();
      acc -= C.DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) acc = 0.0;

    const alpha = acc / C.DT;
    const hi = lerpState(humanPrev, human, alpha);
    placeCarMesh(humanMesh, hi.x, hi.z, hi.heading);
    if (agentMesh) {
      const ai = lerpState(agentPrev, agent, alpha);
      placeCarMesh(agentMesh, ai.x, ai.z, ai.heading);
    }

    if (lidarViz.lines.visible) {
      lidarViz.update(hi.x, hi.z, hi.heading, lidar.scan(hi.x, hi.z, hi.heading));
    }

    chaseCam.update(hi.x, hi.z, hi.heading, human.speed, dt);
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
