// DOM HUD: speed, lap counter, timers, countdown, finish banner.

import { formatTime } from "./race.js";

export class Hud {
  constructor(numLaps) {
    this.numLaps = numLaps;
    this.speedEl = document.getElementById("hud-speed");
    this.lapEl = document.getElementById("hud-lap");
    this.timeEl = document.getElementById("hud-time");
    this.bestEl = document.getElementById("hud-best");
    this.centerEl = document.getElementById("center-msg");
    this.bannerEl = document.getElementById("banner");
    this.bannerTitle = document.getElementById("banner-title");
    this.bannerTable = document.getElementById("banner-table");
    this.lastCountdown = null;
  }

  updateDriving(speedMs, race, carId) {
    this.speedEl.textContent = Math.round(Math.abs(speedMs) * 3.6);
    const car = race.carState(carId);
    const lapNum = Math.min(car.lapsCompleted + 1, this.numLaps);
    this.lapEl.textContent = `LAP ${lapNum}/${this.numLaps}`;
    if (race.phase === "racing" && !car.finished) {
      this.timeEl.textContent = formatTime(race.time - car.lapStart);
    }
    const best = car.lapTimes.length ? Math.min(...car.lapTimes) : null;
    this.bestEl.textContent = `BEST ${formatTime(best)}`;
  }

  updateCountdown(race) {
    if (race.phase === "countdown") {
      const v = race.countdownValue;
      this.centerEl.textContent = String(v);
      this.centerEl.style.color = ["", "#ff5252", "#ffb142", "#ffe95e"][v] || "";
      this.lastCountdown = v;
    } else if (this.lastCountdown !== null) {
      // Show GO! briefly after the countdown ends.
      if (race.time < 1.0) {
        this.centerEl.textContent = "GO!";
        this.centerEl.style.color = "#6dff6d";
      } else {
        this.centerEl.textContent = "";
        this.lastCountdown = null;
      }
    }
  }

  showBanner(title, columns) {
    // columns: [{ name, lapTimes, total }]
    this.bannerTitle.textContent = title;
    let html = "<tr><th></th>";
    for (const c of columns) html += `<th>${c.name}</th>`;
    html += "</tr>";
    const maxLaps = Math.max(...columns.map((c) => c.lapTimes.length));
    for (let i = 0; i < maxLaps; i++) {
      html += `<tr><td>lap ${i + 1}</td>`;
      for (const c of columns) {
        html += `<td>${formatTime(c.lapTimes[i])}</td>`;
      }
      html += "</tr>";
    }
    html += "<tr><td><b>total</b></td>";
    for (const c of columns) {
      html += `<td><b>${formatTime(c.total)}</b></td>`;
    }
    html += "</tr>";
    this.bannerTable.innerHTML = html;
    this.bannerEl.classList.remove("hidden");
  }

  hideBanner() {
    this.bannerEl.classList.add("hidden");
  }
}
