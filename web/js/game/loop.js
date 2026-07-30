// Entry point: loads shared JSON, builds the world, runs the fixed-timestep
// loop with render interpolation. Supports a roster of up to MAX_AGENTS PPO
// agents on an F1-style grid, with optional human driver or spectator mode.

import * as THREE from "three";
import { loadConstants, loadTrack, loadJson } from "../sim/constants.js";
import { stepCar } from "../sim/car.js";
import { WallCollider, resolveCarCar } from "../sim/collision.js";
import { Lidar } from "../sim/lidar.js";
import { ProgressTracker } from "../sim/progress.js";
import { AgentDriver } from "../agent/agentDriver.js";
import { LidarViz } from "../scene/lidarViz.js";
import { buildTrackMeshes } from "../scene/trackMesh.js";
import { buildCity } from "../scene/city.js";
import {
  buildCarMesh,
  placeCarMesh,
  setCarBrake,
  setCarNight,
} from "../scene/carMesh.js";
import {
  buildNameLabel,
  disposeNameLabel,
  scaleNameLabel,
} from "../scene/nameLabel.js";
import { createRenderer, createScene } from "../scene/sceneSetup.js";
import { ThemeMixer } from "../scene/theme.js";
import { ChaseCamera, TopDownCamera } from "../scene/cameras.js";
import { makeGrid } from "./grid.js";
import { Input } from "./input.js";
import { Music } from "./music.js";
import { Hud } from "./hud.js";
import { RaceManager } from "./race.js";

const DEFAULT_LAPS = 2;
const MIN_LAPS = 1;
const MAX_LAPS = 10;
const MAX_SUBSTEPS = 5;
const TOPDOWN_CAR_SCALE = 2.0;
const MAX_AGENTS = 20;
const HUMAN_COLOR = 0x2b6fdd;
const LEADERBOARD_PERIOD = 0.25; // seconds between leaderboard refreshes

// Curated palette for agent cars: distinct hues, readable against the city.
// The human always keeps HUMAN_COLOR blue.
const AGENT_PALETTE = [
  0xe0332e, // red
  0xff8c1a, // orange
  0xffd93d, // yellow
  0x35d461, // green
  0x2ad4c3, // teal
  0x9d4edd, // purple
  0xff5db1, // pink
  0xb8e02a, // lime
  0xf2f2f2, // white
  0x8d9db6, // silver
  0x7a5cff, // violet
  0xff6a3d, // coral
  0x8f5a2f, // brown
  0xd4a017, // gold
  0x7d1f3c, // maroon
  0x274690, // navy
  0x6b8f23, // olive
  0x9be7ff, // ice blue
  0x5b2a86, // dark violet
  0x1f6f43, // forest
];

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

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cssColor(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

function disposeCarMesh(group) {
  group.traverse((obj) => {
    if (obj.isSprite) {
      disposeNameLabel(obj);
    } else if (obj.isMesh) {
      obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
  });
}

async function main() {
  // Menu theme starts with the loading screen (or on the first
  // click/keypress where the browser requires a gesture).
  const music = new Music();
  music.start();
  window.vizMusic = music; // console/debug handle
  const musicBtn = document.getElementById("music-btn");
  musicBtn.classList.toggle("off", !music.enabled);
  musicBtn.addEventListener("click", () => {
    music.setEnabled(!music.enabled);
    musicBtn.classList.toggle("off", !music.enabled);
  });

  const [C, initialTrack] = await Promise.all([loadConstants(), loadTrack()]);
  let manifest = { agents: [] };
  try {
    manifest = await loadJson("../shared/policies/index.json");
  } catch {
    console.warn("no policies/index.json: only custom upload available");
  }
  let tracksManifest = { default: null, tracks: [] };
  try {
    tracksManifest = await loadJson("../shared/tracks/index.json");
  } catch {
    console.warn("no tracks/index.json: single-track mode");
  }
  document.getElementById("loading").classList.add("hidden");

  const canvas = document.getElementById("game-canvas");
  const renderer = createRenderer(canvas);
  const { scene, sun, hemi, ground } = createScene();
  const sceneFog = scene.fog;

  // Track-dependent state; rebuilt by applyTrack() when a different
  // circuit is chosen in the lobby.
  let track = initialTrack;
  let trackGroup = buildTrackMeshes(track);
  let cityGroup = buildCity(track);
  scene.add(trackGroup, cityGroup);
  let collider = new WallCollider(track, C);
  let lidar = new Lidar(track, C);
  let progress = new ProgressTracker(track);
  // Race length is lobby-configurable (persisted); 2 laps by default.
  let numLaps =
    parseInt(localStorage.getItem("vizdrive-laps") ?? "", 10) || DEFAULT_LAPS;
  numLaps = Math.max(MIN_LAPS, Math.min(MAX_LAPS, numLaps));
  let race = new RaceManager(track, numLaps);

  const lidarViz = new LidarViz(scene, C, MAX_AGENTS + 1);
  const input = new Input();
  const hud = new Hud(numLaps);

  const aspect = () => window.innerWidth / window.innerHeight;
  const chaseCam = new ChaseCamera(aspect());
  let topCam = new TopDownCamera(track, aspect());
  let activeCam = chaseCam;
  let carScale = 1.0;

  // Cinematic backdrop while the lobby is open: a slow orbit of the
  // circuit instead of whatever pose the race camera was left in.
  const showcaseCam = new THREE.PerspectiveCamera(55, aspect(), 0.5, 1500);

  function updateShowcase(nowMs) {
    const t = nowMs * 0.00006;
    const r = Math.max(topCam.halfW, topCam.halfH) * 1.25;
    showcaseCam.position.set(
      topCam.cx + Math.cos(t) * r,
      130,
      topCam.cz + Math.sin(t) * r
    );
    showcaseCam.lookAt(topCam.cx, 0, topCam.cz);
  }

  function disposeGroup(group) {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  function applyTrack(json) {
    track = json;
    disposeGroup(trackGroup);
    disposeGroup(cityGroup);
    trackGroup = buildTrackMeshes(track);
    cityGroup = buildCity(track);
    scene.add(trackGroup, cityGroup);
    collider = new WallCollider(track, C);
    lidar = new Lidar(track, C);
    progress = new ProgressTracker(track);
    race = new RaceManager(track, numLaps);
    const wasTop = activeCam === topCam;
    topCam = new TopDownCamera(track, aspect());
    if (wasTop) activeCam = topCam;
    chaseCam.initialized = false;
    applyCurrentTheme(); // new city buildings need the theme re-applied
  }

  // ---- Day / night theme (visual only; training is unaffected) ----
  const themeMixer = new ThemeMixer({ scene, fog: sceneFog, sun, hemi, ground });
  const themeBtn = document.getElementById("theme-btn");
  let themeName = localStorage.getItem("vizdrive-theme") ?? "day";

  function applyCurrentTheme() {
    themeMixer.setGroups([cityGroup]);
    themeMixer.setTarget(themeName);
    // Button shows the mode you would switch TO.
    themeBtn.textContent = themeName === "day" ? "\u263E" : "\u2600";
  }

  function toggleTheme() {
    themeName = themeName === "day" ? "night" : "day";
    localStorage.setItem("vizdrive-theme", themeName);
    themeMixer.setTarget(themeName);
    themeBtn.textContent = themeName === "day" ? "\u263E" : "\u2600";
  }
  themeBtn.addEventListener("click", toggleTheme);

  // Cars in the current race:
  // { id, name, color, isHuman, state, prev, driver, mesh, lbHint, s }
  let cars = [];
  let humanCar = null;
  let bannerShown = false;
  let leaderId = null;
  let focusOverride = null; // chase-cam target chosen with C, null = auto
  applyCurrentTheme();
  themeMixer.snap(themeName); // no crossfade on first load

  function clearCars() {
    for (const car of cars) {
      scene.remove(car.mesh);
      disposeCarMesh(car.mesh);
    }
    cars = [];
    humanCar = null;
    leaderId = null;
    focusOverride = null;
  }

  // entries: [{ name, policyJson | null (human) }]. Classification is pure
  // positional (F1), so the grid order is shuffled every race: rerunning
  // heats rotates who starts up front.
  function buildField(rawEntries) {
    clearCars();
    const entries = shuffled(rawEntries);
    const slots = makeGrid(track, entries.length);
    const colors = shuffled(AGENT_PALETTE);
    race.reset();
    entries.forEach((entry, i) => {
      const isHuman = entry.policyJson === null;
      const color = isHuman ? HUMAN_COLOR : colors[i % colors.length];
      const slot = slots[i];
      const state = { x: slot.x, z: slot.z, heading: slot.heading, speed: 0.0 };
      const mesh = buildCarMesh(color);
      const label = buildNameLabel(entry.name, cssColor(color));
      mesh.add(label);
      mesh.scale.setScalar(carScale);
      scene.add(mesh);
      const driver = isHuman
        ? null
        : new AgentDriver(entry.policyJson, lidar, progress, C);
      const car = {
        id: `car${i}`,
        name: entry.name,
        color,
        isHuman,
        state,
        prev: { ...state },
        driver,
        mesh,
        label,
        lbHint: null,
        s: 0.0,
      };
      cars.push(car);
      race.addCar(car.id);
      if (isHuman) humanCar = car;
    });
    leaderId = cars.length ? cars[0].id : null;
    for (const car of cars) setCarNight(car.mesh, themeMixer.mix);
    hud.hideBanner();
    bannerShown = false;
    chaseCam.initialized = false;
  }

  // ---- Lobby: build a roster of agents, then press START. ----
  let inLobby = true;
  const lobbyEl = document.getElementById("lobby");
  const agentTableEl = document.getElementById("agent-table");
  const rosterEl = document.getElementById("roster");
  const humanCheck = document.getElementById("human-checkbox");
  const statusEl = document.getElementById("lobby-status");
  const startBtn = document.getElementById("start-btn");
  const fileInput = document.getElementById("policy-file");
  const policyCache = new Map(); // file -> parsed policy json

  // roster: [{ name, kind: "builtin"|"custom", file?, json? }]
  const roster = [];

  // Built-in agents: a table of rows; click to add, click again to remove.
  const agentRows = new Map(); // file -> row element
  for (const agent of manifest.agents) {
    const row = document.createElement("div");
    row.className = "agent-row";
    const check = document.createElement("span");
    check.className = "agent-check";
    check.textContent = "\u2713";
    const name = document.createElement("span");
    name.className = "agent-label";
    name.textContent = agent.label;
    row.append(check, name);
    row.addEventListener("click", () => toggleBuiltin(agent, row));
    agentTableEl.appendChild(row);
    agentRows.set(agent.file, row);
  }

  function syncAgentTable() {
    for (const [file, row] of agentRows) {
      row.classList.toggle(
        "selected",
        roster.some((e) => e.kind === "builtin" && e.file === file)
      );
    }
  }

  async function toggleBuiltin(agent, row) {
    const idx = roster.findIndex(
      (e) => e.kind === "builtin" && e.file === agent.file
    );
    if (idx >= 0) {
      roster.splice(idx, 1);
      renderRoster();
      statusEl.textContent = "";
      return;
    }
    if (rosterFull()) return;
    row.style.pointerEvents = "none";
    try {
      if (!policyCache.has(agent.file)) {
        policyCache.set(
          agent.file,
          await loadJson(`../shared/policies/${agent.file}`)
        );
      }
      const json = policyCache.get(agent.file);
      // Validate through the driver self-test before accepting.
      new AgentDriver(json, lidar, progress, C);
      roster.push({
        name: json.name ?? agent.label,
        kind: "builtin",
        file: agent.file,
        json,
      });
      renderRoster();
      statusEl.textContent = "";
    } catch (err) {
      statusEl.textContent = `failed to add agent: ${err.message}`;
      console.error("builtin agent load failed:", err);
    } finally {
      row.style.pointerEvents = "";
    }
  }

  document
    .getElementById("add-all-btn")
    .addEventListener("click", async () => {
      for (const agent of manifest.agents) {
        if (roster.length >= MAX_AGENTS) break;
        const already = roster.some(
          (e) => e.kind === "builtin" && e.file === agent.file
        );
        if (already) continue;
        await toggleBuiltin(agent, agentRows.get(agent.file));
      }
    });

  document.getElementById("clear-all-btn").addEventListener("click", () => {
    roster.length = 0;
    renderRoster();
    statusEl.textContent = "";
  });

  // Track picker: clickable shape thumbnails drawn from the manifest's
  // downsampled centerline preview.
  const trackCardsEl = document.getElementById("track-cards");
  const trackCache = new Map(); // key -> track json
  let currentTrackKey = tracksManifest.default;
  let selectedTrackKey = tracksManifest.default;

  function drawTrackThumb(canvas, preview) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of preview) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const pad = 8;
    const s = Math.min(
      (w - 2 * pad) / (maxX - minX),
      (h - 2 * pad) / (maxZ - minZ)
    );
    const ox = (w - s * (maxX - minX)) / 2;
    const oz = (h - s * (maxZ - minZ)) / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    for (let i = 0; i < preview.length; i++) {
      const px = ox + (preview[i][0] - minX) * s;
      const pz = oz + (preview[i][1] - minZ) * s;
      if (i === 0) ctx.moveTo(px, pz);
      else ctx.lineTo(px, pz);
    }
    ctx.closePath();
    ctx.strokeStyle = "#9fd0ff";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  if (tracksManifest.tracks.length) {
    for (const t of tracksManifest.tracks) {
      const card = document.createElement("div");
      card.className = "track-card";
      card.dataset.key = t.key;
      const canvas = document.createElement("canvas");
      canvas.width = 110;
      canvas.height = 74;
      if (t.preview) drawTrackThumb(canvas, t.preview);
      const label = document.createElement("div");
      label.className = "track-card-label";
      label.textContent = t.label;
      const len = document.createElement("div");
      len.className = "track-card-len";
      len.textContent = `${(t.lap_length / 1000).toFixed(2)} km`;
      card.append(canvas, label, len);
      card.addEventListener("click", () => {
        selectedTrackKey = t.key;
        for (const el of trackCardsEl.children) {
          el.classList.toggle("selected", el.dataset.key === t.key);
        }
      });
      if (t.key === selectedTrackKey) card.classList.add("selected");
      trackCardsEl.appendChild(card);
    }
  } else {
    document.getElementById("track-row").classList.add("hidden");
  }

  async function ensureSelectedTrack() {
    if (!tracksManifest.tracks.length) return;
    const key = selectedTrackKey;
    if (key === currentTrackKey) return;
    const info = tracksManifest.tracks.find((t) => t.key === key);
    if (!info) return;
    if (!trackCache.has(key)) {
      trackCache.set(key, await loadJson(`../shared/tracks/${info.file}`));
    }
    applyTrack(trackCache.get(key));
    currentTrackKey = key;
  }

  function renderRoster() {
    rosterEl.textContent = "";
    roster.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "roster-entry";
      const name = document.createElement("span");
      name.className = "roster-name";
      name.textContent = entry.name;
      const remove = document.createElement("button");
      remove.className = "roster-remove";
      remove.type = "button";
      remove.textContent = "\u00d7";
      remove.title = "remove";
      remove.addEventListener("click", () => {
        roster.splice(i, 1);
        renderRoster();
        statusEl.textContent = "";
      });
      row.append(name, remove);
      rosterEl.appendChild(row);
    });
    syncAgentTable();
  }

  function rosterFull() {
    if (roster.length >= MAX_AGENTS) {
      statusEl.textContent = `roster is full (max ${MAX_AGENTS} agents)`;
      return true;
    }
    return false;
  }

  function addCustomFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          // Validate now so a bad file is rejected at upload time.
          new AgentDriver(json, lidar, progress, C);
          const stem = file.name.replace(/\.json$/i, "");
          roster.push({ name: json.name ?? stem, kind: "custom", json });
          resolve(null);
        } catch (err) {
          console.error("policy load failed:", err);
          resolve(file.name);
        }
      };
      reader.onerror = () => resolve(file.name);
      reader.readAsText(file);
    });
  }

  fileInput.addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    const rejected = [];
    for (const file of files) {
      if (rosterFull()) break;
      const bad = await addCustomFile(file);
      if (bad) rejected.push(bad);
    }
    renderRoster();
    if (rejected.length) {
      statusEl.textContent = `invalid policy file: ${rejected.join(", ")}`;
    }
  });

  function showLobby() {
    inLobby = true;
    liveStandings = false;
    standingsBtn.classList.add("hidden");
    endRaceBtn.classList.add("hidden");
    hud.hideBanner();
    hud.hideLeaderboard();
    lidarViz.lines.visible = false;
    statusEl.textContent = "";
    lobbyEl.classList.remove("hidden");
    music.start();
  }

  async function startRace() {
    const humanIn = humanCheck.checked;
    if (roster.length === 0 && !humanIn) {
      statusEl.textContent = "add at least one agent, or race yourself";
      return;
    }
    try {
      await ensureSelectedTrack();
      // Pick up the lobby's lap setting for this race.
      race = new RaceManager(track, numLaps);
      hud.numLaps = numLaps;
      const entries = [];
      if (humanIn) entries.push({ name: "YOU", policyJson: null });
      for (const item of roster) {
        entries.push({ name: item.name, policyJson: item.json });
      }
      buildField(entries);
      lobbyEl.classList.add("hidden");
      inLobby = false;
      standingsBtn.classList.remove("hidden");
      endRaceBtn.classList.remove("hidden");
      music.fadeOut(1.2);
    } catch (err) {
      statusEl.textContent = `failed to start: ${err.message}`;
      console.error("race start failed:", err);
    }
  }
  // ---- Lap count stepper (lobby) ----
  const lapsValueEl = document.getElementById("laps-value");

  function setLaps(n) {
    numLaps = Math.max(MIN_LAPS, Math.min(MAX_LAPS, n));
    lapsValueEl.textContent = numLaps === 1 ? "1 lap" : `${numLaps} laps`;
    localStorage.setItem("vizdrive-laps", String(numLaps));
  }
  document.getElementById("laps-minus").addEventListener("click", () => {
    setLaps(numLaps - 1);
  });
  document.getElementById("laps-plus").addEventListener("click", () => {
    setLaps(numLaps + 1);
  });
  setLaps(numLaps); // sync the label with the persisted value

  // ---- Live standings table (button-toggled, realtime) ----
  // The finish banner used to be the only place lap times appeared, which
  // meant waiting for every car to finish (or DNF out). The standings
  // button opens the same table mid-race, refreshed live; the X closes it.
  const standingsBtn = document.getElementById("standings-btn");
  const endRaceBtn = document.getElementById("endrace-btn");
  const bannerClose = document.getElementById("banner-close");
  let liveStandings = false;

  // End the race on demand: current order becomes final, cars coast to a
  // stop (throttle is cut once the phase is "finished").
  endRaceBtn.addEventListener("click", () => {
    if (inLobby || race.phase === "finished") return;
    race.forceFinish();
    bannerShown = true;
    liveStandings = false;
    endRaceBtn.classList.add("hidden");
    showFinishBanner("RACE STOPPED");
  });

  function renderLiveStandings() {
    const order = currentStandings();
    const rows = order.map((id) => {
      const car = carById(id);
      const st = race.carState(id);
      return {
        name: car.name,
        colorCss: cssColor(car.color),
        isHuman: car.isHuman,
        lapTimes: st.lapTimes,
        total: st.finished ? st.finishTime : null,
        dnf: st.dnf,
        lapsCompleted: st.lapsCompleted,
        status: st.finished
          ? null
          : `on lap ${Math.min(st.lapsCompleted + 1, numLaps)}`,
      };
    });
    hud.showBanner("LIVE STANDINGS", rows, "updating in real time");
  }

  standingsBtn.addEventListener("click", () => {
    if (inLobby || !cars.length) return;
    if (race.phase === "finished") {
      showFinishBanner();
    } else {
      liveStandings = true;
      renderLiveStandings();
    }
  });

  bannerClose.addEventListener("click", () => {
    liveStandings = false;
    hud.hideBanner();
  });

  startBtn.addEventListener("click", startRace);
  showLobby();

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    chaseCam.resize(aspect());
    topCam.resize(aspect());
    showcaseCam.aspect = aspect();
    showcaseCam.updateProjectionMatrix();
  });

  function currentStandings() {
    const sById = {};
    for (const car of cars) {
      const loc = progress.locate(car.state.x, car.state.z, car.lbHint);
      car.lbHint = loc.index;
      car.s = loc.s;
      sById[car.id] = loc.s;
    }
    return race.standings(sById);
  }

  function carById(id) {
    return cars.find((c) => c.id === id) ?? null;
  }

  function focusCar() {
    if (focusOverride && cars.includes(focusOverride)) return focusOverride;
    return humanCar ?? carById(leaderId) ?? cars[0] ?? null;
  }

  // ---- Name labels ----
  // Chase view: distance-scaled sprites; the human's own label is hidden
  // (the camera sits right behind it and "YOU" is just noise), but a
  // spectated agent keeps its label so you can tell who is being followed.
  // Map view: labels get a constant on-screen pixel size and overlapping
  // labels are stacked upward via sprite.center (a screen-space anchor
  // offset), so close battles stay readable without giant fonts.
  const LABEL_CHASE_SCALE = 0.00055;
  const LABEL_TOP_SCREEN = 0.34; // screen px per label-canvas px in map view
  const LABEL_LIFT = 30; // screen px between the car and its label
  const _labelProj = new THREE.Vector3();

  // Leader lines connecting each map-view label to its car, so the label
  // can float clear of the car and its lidar rays.
  const linkPositions = new Float32Array((MAX_AGENTS + 1) * 2 * 3);
  const linkLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(linkPositions, 3)
    ),
    new THREE.LineBasicMaterial({
      color: 0xbfc8d8,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
    })
  );
  linkLines.visible = false;
  linkLines.frustumCulled = false;
  linkLines.renderOrder = 9;
  scene.add(linkLines);

  function screenToGround(sx, sy, cam, W, H) {
    _labelProj.set((2 * sx) / W - 1, 1 - (2 * sy) / H, 0.5).unproject(cam);
    return { x: _labelProj.x, z: _labelProj.z };
  }

  function updateLabels(focus, inChase) {
    if (inChase) {
      linkLines.visible = false;
      for (const car of cars) {
        car.label.visible = !(car === focus && car.isHuman);
        if (!car.label.visible) continue;
        car.label.center.set(0.5, 0.5);
        const d = chaseCam.camera.position.distanceTo(car.mesh.position);
        scaleNameLabel(
          car.label,
          Math.min(Math.max(d, 6), 70) * LABEL_CHASE_SCALE
        );
      }
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cam = topCam.camera;
    // Parent mesh is already scaled by TOPDOWN_CAR_SCALE, so divide it out.
    const worldPerCanvasPx =
      (LABEL_TOP_SCREEN * (cam.top - cam.bottom)) / H / TOPDOWN_CAR_SCALE;
    const anchors = cars.map((car) => {
      car.label.visible = true;
      scaleNameLabel(car.label, worldPerCanvasPx);
      _labelProj.copy(car.mesh.position).project(cam);
      return {
        car,
        sx: (_labelProj.x * 0.5 + 0.5) * W,
        sy: (0.5 - _labelProj.y * 0.5) * H,
      };
    });
    // Place topmost cars first so stacks grow upward deterministically.
    anchors.sort((a, b) => a.sy - b.sy);
    const placed = [];
    let li = 0;
    for (const { car, sx, sy } of anchors) {
      const w = car.label.userData.pxW * LABEL_TOP_SCREEN;
      const h = car.label.userData.pxH * LABEL_TOP_SCREEN;
      const step = 1.12 * h; // one label height plus a small gap
      // Candidate slots: lifted clear of the car, stacked upward; downward
      // slots as fallback (e.g. cars near the top screen edge).
      const slots = [];
      for (let k = 0; k <= cars.length; k++) {
        const up = sy - h - LABEL_LIFT - k * step;
        if (up >= 0) slots.push(up);
        slots.push(sy + LABEL_LIFT + k * step);
      }
      const isClear = (t) =>
        placed.every(
          (r) =>
            sx - w / 2 >= r.right ||
            sx + w / 2 <= r.left ||
            t >= r.bottom ||
            t + h <= r.top
        );
      const top = slots.find(isClear) ?? slots[0];
      placed.push({ left: sx - w / 2, right: sx + w / 2, top, bottom: top + h });
      // sprite.center is the anchor point in sprite-height units measured
      // from the bottom; lowering it raises the sprite on screen.
      car.label.center.set(0.5, (top + h - sy) / h);
      // Leader line: car -> nearest edge of its label.
      const edgeY = top + h < sy ? top + h : top;
      const end = screenToGround(sx, edgeY, cam, W, H);
      linkPositions[li++] = car.mesh.position.x;
      linkPositions[li++] = 5.0;
      linkPositions[li++] = car.mesh.position.z;
      linkPositions[li++] = end.x;
      linkPositions[li++] = 5.0;
      linkPositions[li++] = end.z;
    }
    linkLines.visible = true;
    linkLines.geometry.setDrawRange(0, anchors.length * 2);
    linkLines.geometry.attributes.position.needsUpdate = true;
  }

  function showFinishBanner(titleOverride = null) {
    const order = currentStandings();
    const columns = order.map((id) => {
      const car = carById(id);
      const st = race.carState(id);
      return {
        name: car.name,
        colorCss: cssColor(car.color),
        isHuman: car.isHuman,
        lapTimes: st.lapTimes,
        total: st.finishTime,
        dnf: st.dnf,
        lapsCompleted: st.lapsCompleted,
      };
    });
    const winner = carById(order[0]);
    const title =
      titleOverride ??
      (winner.isHuman ? "YOU WIN" : `${winner.name.toUpperCase()} WINS`);
    hud.showBanner(title, columns);
  }

  function physicsTick() {
    const controls = input.sample(C.DT);
    race.tick(C.DT);

    for (const car of cars) {
      car.prev = car.state;
      const a = car.isHuman
        ? controls
        : car.driver.drive(
            car.state,
            cars.filter((c) => c !== car).map((c) => c.state)
          );
      // Throttle only while the race is on: cars hold still during the
      // countdown and coast to a stop once the race is over.
      const throttle = race.phase === "racing" ? a.throttle : 0.0;
      car.state = stepCar(car.state, a.steer, throttle, C);
    }
    // Pairwise car-car separation (max 21 cars = 210 pairs), then walls.
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const cc = resolveCarCar(cars[i].state, cars[j].state);
        cars[i].state = cc.a;
        cars[j].state = cc.b;
      }
    }
    for (const car of cars) {
      car.state = collider.resolve(car.state).state;
      race.update(car.id, car.prev.x, car.prev.z, car.state.x, car.state.z);
    }
    race.maybeFinish();
    if (race.phase === "finished" && !bannerShown) {
      bannerShown = true;
      liveStandings = false; // final results replace the live table
      endRaceBtn.classList.add("hidden");
      showFinishBanner();
    }
  }

  let last = performance.now();
  let acc = 0.0;
  let lbTimer = LEADERBOARD_PERIOD; // refresh immediately after start

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    if (input.consumeRestart() && !inLobby) {
      showLobby();
    }
    if (input.consumeCameraToggle()) {
      activeCam = activeCam === chaseCam ? topCam : chaseCam;
      // Fog only makes sense from the chase camera; in the map view the cars
      // are scaled up so they stay visible at track scale.
      const isChase = activeCam === chaseCam;
      scene.fog = isChase ? sceneFog : null;
      carScale = isChase ? 1.0 : TOPDOWN_CAR_SCALE;
      for (const car of cars) car.mesh.scale.setScalar(carScale);
    }
    if (input.consumeLidarToggle()) {
      lidarViz.toggle();
    }
    if (input.consumeThemeToggle()) {
      toggleTheme();
    }
    if (themeMixer.update(dt)) {
      for (const car of cars) setCarNight(car.mesh, themeMixer.mix);
    }
    if (input.consumeFocusNext() && !inLobby && cars.length) {
      const idx = cars.indexOf(focusCar());
      focusOverride = cars[(idx + 1) % cars.length];
    }

    acc += dt;
    let steps = 0;
    while (acc >= C.DT && steps < MAX_SUBSTEPS) {
      if (!inLobby) physicsTick();
      acc -= C.DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) acc = 0.0;

    const alpha = acc / C.DT;
    let focusPose = null;
    const focus = focusCar();
    const inChase = activeCam === chaseCam;
    const poses = [];
    for (const car of cars) {
      const s = lerpState(car.prev, car.state, alpha);
      poses.push(s);
      placeCarMesh(car.mesh, s.x, s.z, s.heading);
      setCarBrake(car.mesh, car.state.speed < car.prev.speed - 1e-4);
      if (car === focus) focusPose = s;
    }
    if (inLobby) {
      // Showcase orbit backdrop: hide race chrome over leftover cars.
      for (const car of cars) car.label.visible = false;
      linkLines.visible = false;
    } else {
      updateLabels(focus, inChase);
    }

    // LiDAR debug rays for EVERY car (L to toggle).
    if (lidarViz.lines.visible && cars.length && !inLobby) {
      lidarViz.update(
        cars.map((car, i) => ({
          x: poses[i].x,
          z: poses[i].z,
          heading: poses[i].heading,
          scan: lidar.scan(
            poses[i].x,
            poses[i].z,
            poses[i].heading,
            cars.filter((c) => c !== car).map((c) => c.state)
          ),
        }))
      );
    }

    if (!inLobby && cars.length) {
      lbTimer += dt;
      if (lbTimer >= LEADERBOARD_PERIOD) {
        lbTimer = 0.0;
        const order = currentStandings();
        leaderId = order[0];
        hud.updateLeaderboard(
          order.map((id) => {
            const car = carById(id);
            const st = race.carState(id);
            return {
              name: car.name,
              colorCss: cssColor(car.color),
              isHuman: car.isHuman,
              finished: st.finished,
              dnf: st.dnf,
            };
          })
        );
        if (liveStandings && race.phase !== "finished") {
          renderLiveStandings();
        }
      }
    }

    if (focus && focusPose) {
      chaseCam.update(
        focusPose.x, focusPose.z, focusPose.heading, focus.state.speed, dt
      );
      hud.updateDriving(focus.state.speed, race, focus.id);
    }
    if (!inLobby) hud.updateCountdown(race);

    if (inLobby) {
      updateShowcase(now);
      renderer.render(scene, showcaseCam);
    } else {
      renderer.render(scene, activeCam.camera);
    }
  }
  requestAnimationFrame(frame);
}

main().catch((err) => {
  const msg = document.getElementById("loading-msg");
  const target = msg ?? document.getElementById("loading");
  target.textContent = `error: ${err.message}`;
  document.getElementById("loading").classList.remove("hidden");
  console.error(err);
});
