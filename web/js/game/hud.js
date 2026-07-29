// DOM HUD: speed, lap counter, timers, countdown, live leaderboard,
// finish banner.

import { formatTime } from "./race.js";

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
    this.bannerHint = document.getElementById("banner-hint");
    this.leaderboardEl = document.getElementById("leaderboard");
    this.lastCountdown = null;
  }

  updateDriving(speedMs, race, carId) {
    this.speedEl.textContent = Math.round(Math.abs(speedMs) * 3.6);
    const car = race.carState(carId);
    if (!car) return;
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

  // rows: ranked [{ name, colorCss, isHuman, finished, dnf }].
  updateLeaderboard(rows) {
    let html = "";
    rows.forEach((r, i) => {
      const cls = r.isHuman ? "lb-row lb-human" : "lb-row";
      let tag = "";
      if (r.dnf) tag = '<span class="lb-tag">DNF</span>';
      else if (r.finished) tag = '<span class="lb-tag lb-fin">FIN</span>';
      html +=
        `<div class="${cls}"><span class="lb-pos">${i + 1}</span>` +
        `<span class="lb-dot" style="background:${r.colorCss}"></span>` +
        `<span class="lb-name">${escapeHtml(r.name)}</span>${tag}</div>`;
    });
    this.leaderboardEl.innerHTML = html;
    this.leaderboardEl.classList.toggle("hidden", rows.length === 0);
  }

  hideLeaderboard() {
    this.leaderboardEl.classList.add("hidden");
  }

  // rows: ranked [{ name, colorCss, isHuman, lapTimes, total, dnf,
  // lapsCompleted, status? }]. Rendered as a results leaderboard: one row
  // per driver, one column per lap, plus total. Fastest lap is highlighted.
  // Running cars (total null, no dnf) show their live status text instead
  // of a total, so the same table doubles as the in-race standings view.
  showBanner(title, rows, hint = "press R to return to the lobby") {
    this.bannerTitle.textContent = title;
    this.bannerHint.textContent = hint;
    const numLaps = this.numLaps;
    let bestLap = Infinity;
    for (const r of rows) {
      for (const t of r.lapTimes) bestLap = Math.min(bestLap, t);
    }
    let html = "<tr><th></th><th></th><th class=\"bt-name\">driver</th>";
    for (let i = 0; i < numLaps; i++) html += `<th>lap ${i + 1}</th>`;
    html += "<th>total</th></tr>";
    rows.forEach((r, i) => {
      const cls = r.isHuman ? "bt-row bt-human" : "bt-row";
      html +=
        `<tr class="${cls}"><td class="bt-pos">${i + 1}</td>` +
        `<td><span class="lb-dot" style="background:${r.colorCss}"></span></td>` +
        `<td class="bt-name">${escapeHtml(r.name)}</td>`;
      for (let k = 0; k < numLaps; k++) {
        const t = r.lapTimes[k];
        const best = t !== undefined && t === bestLap;
        html += `<td class="${best ? "bt-best" : ""}">${
          t === undefined ? "\u00b7" : formatTime(t)
        }</td>`;
      }
      const total = r.dnf
        ? `DNF (${r.lapsCompleted} lap${r.lapsCompleted === 1 ? "" : "s"})`
        : r.total === null && r.status
          ? r.status
          : formatTime(r.total);
      html += `<td class="bt-total">${total}</td></tr>`;
    });
    this.bannerTable.innerHTML = html;
    this.bannerEl.classList.remove("hidden");
  }

  hideBanner() {
    this.bannerEl.classList.add("hidden");
  }
}
