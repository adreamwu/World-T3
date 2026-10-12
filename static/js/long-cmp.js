// Longer generation (29 s): the same 3 x 3 layout as the revisit section, kept simple.
// Every clip plays in lock-step with a live top-view camera path and the key HUD; the controls are
// play / pause, seek and speed. The camera sweeps the same ground several times, so the path shows
// the whole route faintly and only the last few seconds as a trail behind the camera.
// As in the revisit section, the camera path recovered from each model's video can be pinned (chips
// under the map) or previewed by hovering its clip.
(function () {
  "use strict";

  const SCENES = ["s01", "s02", "s03", "s04", "s05", "s06"];
  const DIR = "static/videos/long_cmp";
  const DT = 0.25, TRAIL = 12;   // trail length in latents (3 s)
  const CELLS = [
    { k: "path" },
    { k: "gt", name: "Real video", note: "reference" },
    { k: "ours", name: "Ours", ours: true, color: "#e03131" },
    { k: "mg3", name: "Matrix-Game 3.0", color: "#f59f00" }, { k: "hyw", name: "HY-World 1.5", color: "#9c36b5" },
    { k: "sana", name: "SANA-WM", color: "#0ca678" }, { k: "lingbot", name: "LingBot-Fast", color: "#8b5a2b" },
    { k: "dreamx", name: "DreamX-AR", color: "#74b816" },
  ];
  const METHODS = CELLS.filter((c) => c.color);
  const asset = (p) => (window.RVC_ASSET ? window.RVC_ASSET(p) : p);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // a model's camera at time t: its re-estimated heading, drawn with the same schematic view cone as the commanded one
  const lerpYaw = (a, i, j, f) => a[i] + (((a[j] - a[i] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * f;
  function camCone(g, x, y, yaw, fovDeg, L, color, alpha) {
    // same look as the commanded camera: soft cone that fades out, a halo, and a dot with a white rim
    const half = (fovDeg / 2) * Math.PI / 180;
    const rgb = [1, 3, 5].map((j) => parseInt(color.slice(j, j + 2), 16)).join(",");
    g.save(); g.globalAlpha = alpha; g.setLineDash([]);
    const grad = g.createRadialGradient(x, y, 0, x, y, L);
    grad.addColorStop(0, `rgba(${rgb},0.34)`); grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad; g.beginPath(); g.moveTo(x, y);
    g.arc(x, y, L, yaw - half - Math.PI / 2, yaw + half - Math.PI / 2); g.closePath(); g.fill();
    g.fillStyle = `rgba(${rgb},0.18)`; g.beginPath(); g.arc(x, y, 10, 0, 2 * Math.PI); g.fill();
    g.fillStyle = color; g.strokeStyle = "#fff"; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 5, 0, 2 * Math.PI); g.fill(); g.stroke();
    g.restore();
  }
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  // key HUD, as in the other sections: WASD = move, I / J / K / L = look up / turn left / look down / turn right
  const KEYS = [["W", 1, 2], ["A", 2, 1], ["S", 2, 2], ["D", 2, 3]];
  const TURNS = [["u", 1, 2, "I"], ["l", 2, 1, "J"], ["d", 2, 2, "K"], ["r", 2, 3, "L"]];
  function keyOverlay() {
    const o = el("div", "rvc-keys");
    o.setAttribute("aria-hidden", "true");
    [KEYS, TURNS].forEach((set) => {
      const g = el("div", "cluster");
      set.forEach(([k, row, col, label]) => { const e = el("span", "k", label || k); e.dataset.k = k; e.style.gridArea = `${row} / ${col}`; g.appendChild(e); });
      o.appendChild(g);
    });
    return o;
  }

  function drawPath(cv, tr, t, show, hover, bottomPad) {
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h || !tr) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const root = getComputedStyle(document.documentElement);
    const ACC = root.getPropertyValue("--accent").trim() || "#0a4fb3", INK = root.getPropertyValue("--text").trim() || "#1c2b33";
    const dark = INK.toLowerCase() !== "#1c2b33";
    g.fillStyle = dark ? "#0f1a20" : "#f7f9fb"; g.fillRect(0, 0, w, h);
    if (!tr._sx) {
      const sm = (a) => a.map((_, i) => { let s = 0, c = 0; for (let j = -1; j <= 1; j++) { const v = a[i + j]; if (v !== undefined) { s += v; c++; } } return s / c; });
      tr._sx = sm(tr.x); tr._sz = sm(tr.z);
    }
    const xs = tr._sx, zs = tr._sz, n = xs.length;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const top = 44, side = 34, bottom = bottomPad || 30, aw = w - 2 * side, ah = h - top - bottom;
    const span = Math.max(x1 - x0, z1 - z0, 1e-3);
    const s = Math.min(aw / Math.max(x1 - x0, span * 0.45), ah / Math.max(z1 - z0, span * 0.45));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ox = side + aw / 2, oy = top + ah / 2;
    const Pxz = (x, z) => [ox + (x - cx) * s, oy - (z - cz) * s];
    const P = (i) => Pxz(xs[i], zs[i]);

    // grid at a round step, anchored to the start
    const raw = 34 / s, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) * s;
    const [gx, gy] = P(0);
    g.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(28,43,51,0.07)"; g.lineWidth = 1; g.beginPath();
    for (let x = ((gx % step) + step) % step; x < w; x += step) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h); }
    for (let y = ((gy % step) + step) % step; y < h; y += step) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); }
    g.stroke();
    g.lineJoin = g.lineCap = "round";

    const k = clamp(t / tr.dt, 0, n - 1), ki = Math.floor(k), f = k - ki, k2 = Math.min(n - 1, ki + 1);
    const [ax, ay] = P(ki), [bx, by] = P(k2), px = ax + (bx - ax) * f, py = ay + (by - ay) * f;

    // where each pinned / hovered model's camera actually went (dashed, its colour), and where it is now
    for (const m of show || []) {
      const r = tr.rec && tr.rec[m.k];
      if (!r) continue;
      const hot = hover === m.k;
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = m.color; g.lineWidth = hot ? 2.6 : 1.8; g.globalAlpha = hot || !hover ? 0.95 : 0.35;
      g.beginPath();
      for (let i = 0; i < r.x.length; i++) { const [qx, qy] = Pxz(r.x[i], r.z[i]); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
      g.stroke(); g.setLineDash([]);
      const kk = clamp(t / tr.dt, 0, r.x.length - 1), j0 = Math.floor(kk), j1 = Math.min(r.x.length - 1, j0 + 1), ff = kk - j0;
      const [ax2, ay2] = Pxz(r.x[j0], r.z[j0]), [bx2, by2] = Pxz(r.x[j1], r.z[j1]);
      const mx = ax2 + (bx2 - ax2) * ff, my = ay2 + (by2 - ay2) * ff;
      camCone(g, mx, my, r.yaw ? lerpYaw(r.yaw, j0, j1, ff) : 0, tr.hfov, Math.min(w, h) * 0.2, m.color, hot || !hover ? 1 : 0.4);
      g.restore();
    }

    // the whole route, faint
    g.beginPath(); g.strokeStyle = dark ? "rgba(255,255,255,0.22)" : "#cdd5de"; g.lineWidth = 3;
    for (let i = 0; i < n; i++) { const [qx, qy] = P(i); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
    g.stroke();
    // the last few seconds as a trail that fades out behind the camera
    const i0 = Math.max(0, ki - TRAIL);
    g.beginPath(); g.lineWidth = 7; g.strokeStyle = dark ? "rgba(15,26,32,0.9)" : "rgba(255,255,255,0.95)";
    for (let i = i0; i <= ki; i++) { const [qx, qy] = P(i); i === i0 ? g.moveTo(qx, qy) : g.lineTo(qx, qy); }
    g.lineTo(px, py); g.stroke();
    const hex = (c) => [1, 3, 5].map((j) => parseInt(c.slice(j, j + 2), 16));
    const c1 = /^#[0-9a-f]{6}$/i.test(ACC) ? hex(ACC) : [10, 79, 179], c0 = c1.map((v) => Math.round(v + (255 - v) * 0.75));
    g.lineWidth = 3.5;
    for (let i = i0; i <= ki; i++) {
      const [qx, qy] = P(i), [rx, ry] = i < ki ? P(i + 1) : [px, py];
      const u = clamp(1 - (k - (i + 1)) / TRAIL, 0, 1);
      g.strokeStyle = `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * u)).join(",")})`;
      g.beginPath(); g.moveTo(qx, qy); g.lineTo(rx, ry); g.stroke();
    }

    // start
    const [sx, sy] = P(0);
    g.fillStyle = dark ? "#0f1a20" : "#fff"; g.strokeStyle = INK; g.lineWidth = 2;
    g.beginPath(); g.arc(sx, sy, 5, 0, 2 * Math.PI); g.fill(); g.stroke();
    g.font = "600 11px Inter, system-ui, sans-serif"; g.textBaseline = "middle";
    const tw = g.measureText("start").width + 12, lx = sx + 9 + tw < w ? sx + 9 : sx - 9 - tw;
    g.fillStyle = dark ? "rgba(22,35,44,0.94)" : "rgba(255,255,255,0.94)";
    g.beginPath(); g.roundRect ? g.roundRect(lx, sy - 9, tw, 18, 9) : g.rect(lx, sy - 9, tw, 18); g.fill();
    g.fillStyle = INK; g.fillText("start", lx + 6, sy + 0.5);

    // camera: view cone + haloed dot
    const yaw = tr.yaw[ki] + (((tr.yaw[k2] - tr.yaw[ki] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * f;
    const half = (tr.hfov / 2) * Math.PI / 180, L = Math.min(w, h) * 0.2;
    const cone = g.createRadialGradient(px, py, 0, px, py, L);
    cone.addColorStop(0, "rgba(10,79,179,0.34)"); cone.addColorStop(1, "rgba(10,79,179,0)");
    g.fillStyle = cone; g.beginPath(); g.moveTo(px, py);
    g.arc(px, py, L, yaw - half - Math.PI / 2, yaw + half - Math.PI / 2); g.closePath(); g.fill();
    g.fillStyle = "rgba(10,79,179,0.18)"; g.beginPath(); g.arc(px, py, 12, 0, 2 * Math.PI); g.fill();
    g.fillStyle = ACC; g.strokeStyle = "#fff"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(px, py, 6.5, 0, 2 * Math.PI); g.fill(); g.stroke();

    // elapsed time, top-right
    g.fillStyle = dark ? "rgba(255,255,255,0.6)" : "rgba(28,43,51,0.55)"; g.font = "500 11px Inter, system-ui, sans-serif";
    g.textAlign = "right"; g.fillText(`${t.toFixed(1)} s`, w - 12, 20); g.textAlign = "left";
  }

  function init() {
    const root = document.getElementById("lc");
    if (!root) return;
    const grid = root.querySelector(".rvc-grid");
    const bar = document.getElementById("lc-controls");
    const btn = bar.querySelector('[data-action="toggle"]'), scrub = bar.querySelector(".scrubber");
    const timeEl = bar.querySelector(".time"), speedEl = bar.querySelector(".speed");

    const vids = [], tiles = {};
    let canvas, chipsEl;
    for (const c of CELLS) {
      const cell = el("div", "rvc-cell");
      cell.dataset.k = c.k;
      if (c.k === "path") {
        cell.classList.add("path");
        canvas = el("canvas");
        cell.append(canvas, el("div", "rvc-tag plain", "Camera path · seen from above"));
        chipsEl = el("div", "rvc-chips");
        chipsEl.appendChild(el("div", "rvc-chips-lab", "Where each model&rsquo;s camera actually went"));
        const row = el("div", "rvc-chip-row");
        for (const m of METHODS) {
          const chip = el("button", "rvc-chip" + (m.ours ? " ours" : ""), `<i></i>${m.name}<b></b>`);
          chip.type = "button"; chip.dataset.k = m.k; chip.style.setProperty("--c", m.color); chip.setAttribute("aria-pressed", "false");
          row.appendChild(chip);
        }
        chipsEl.appendChild(row);
        cell.appendChild(chipsEl);
      } else {
        const v = el("video");
        v.muted = true; v.playsInline = true; v.preload = "auto"; v.dataset.k = c.k;
        cell.append(v, el("div", "rvc-tag" + (c.ours ? " ours" : "") + (c.k === "gt" ? " gt" : ""), (c.color ? `<i style="background:${c.color}"></i>` : "") + c.name + (c.note ? ` <span>${c.note}</span>` : "")), keyOverlay());
        if (c.ours) cell.classList.add("ours");
        if (c.color) {
          cell.style.setProperty("--c", c.color);
          cell.addEventListener("mouseenter", () => { S.hover = c.k; syncChips(); });
          cell.addEventListener("mouseleave", () => { if (S.hover === c.k) S.hover = null; syncChips(); });
        }
        tiles[c.k] = cell;
        vids.push(v);
      }
      grid.appendChild(cell);
    }
    const master = vids.find((v) => v.dataset.k === "ours");
    const S = { cur: null, tr: null, userPaused: false, inView: false, scrubbing: false, keysAt: -1, pinned: new Set(), hover: null };
    function syncChips() {
      chipsEl.querySelectorAll(".rvc-chip").forEach((c) => {
        const on = S.pinned.has(c.dataset.k);
        c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on)); c.classList.toggle("hot", S.hover === c.dataset.k);
      });
      for (const k in tiles) tiles[k].classList.toggle("hot", S.hover === k || S.pinned.has(k));
    }
    chipsEl.addEventListener("click", (e) => {
      const c = e.target.closest(".rvc-chip"); if (!c) return;
      S.pinned.has(c.dataset.k) ? S.pinned.delete(c.dataset.k) : S.pinned.add(c.dataset.k); syncChips();
    });
    chipsEl.addEventListener("mouseover", (e) => { const c = e.target.closest(".rvc-chip"); S.hover = c ? c.dataset.k : null; syncChips(); });
    chipsEl.addEventListener("mouseleave", () => { S.hover = null; syncChips(); });

    const playing = () => !master.paused && !master.ended;
    const playAll = () => vids.forEach((v) => { const p = v.play(); if (p) p.catch(() => {}); });
    const pauseAll = () => vids.forEach((v) => v.pause());
    const seekAll = (t) => vids.forEach((v) => { v.currentTime = t; });
    const setPlaying = (on) => { S.userPaused = !on; on ? playAll() : pauseAll(); };

    btn.addEventListener("click", () => setPlaying(!playing()));
    vids.forEach((v) => v.addEventListener("click", () => setPlaying(!playing())));
    speedEl.addEventListener("change", () => vids.forEach((v) => { v.playbackRate = Number(speedEl.value); }));
    scrub.addEventListener("pointerdown", () => { S.scrubbing = true; });
    window.addEventListener("pointerup", () => { S.scrubbing = false; });
    scrub.addEventListener("input", () => seekAll((scrub.value / 1000) * (master.duration || 29)));
    master.addEventListener("ended", () => { if (!S.userPaused) { seekAll(0); playAll(); } });

    function load(id) {
      S.cur = id; S.tr = null; S.keysAt = -1;
      const d = `${DIR}/${id}`;
      vids.forEach((v) => { v.pause(); v.poster = asset(`${d}/${v.dataset.k}.jpg`); v.src = asset(`${d}/${v.dataset.k}.mp4`); v.playbackRate = Number(speedEl.value); });
      fetch(asset(`${d}/traj.json`)).then((r) => r.json()).then((j) => {
        if (S.cur !== id) return;
        S.tr = j;
        chipsEl.querySelectorAll(".rvc-chip").forEach((c) => {
          // chip shows the mean rotation error (the paper's camera metric); the tooltip adds position drift
          const m = METHODS.find((x) => x.k === c.dataset.k), r = j.rot && j.rot[m.k], a = j.ate && j.ate[m.k];
          c.querySelector("b").textContent = r == null ? "" : `${r.toFixed(1)}°`;
          c.title = r == null ? "" : `${m.name}, camera re-estimated from its own video: mean rotation error ${r.toFixed(1)}° from the requested path` +
            (a == null ? "" : `, position drift ${(100 * a).toFixed(1)}% of the path's size`);
        });
      });
      if (S.inView && !S.userPaused) playAll();
    }
    const tabs = document.querySelector('[data-tabs="long-cmp"]');
    tabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab || tab.classList.contains("active")) return;
      tabs.querySelectorAll(".tab").forEach((t) => { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", t === tab); });
      load(SCENES[Number(tab.dataset.index)]);
    });
    new IntersectionObserver(([en]) => {
      S.inView = en.isIntersecting;
      if (!S.inView) pauseAll(); else if (!S.userPaused) playAll();
    }, { threshold: 0.25 }).observe(grid);
    load(SCENES[0]);
    root._lc = { state: S };   // read-only handle for automated checks

    (function loop() {
      requestAnimationFrame(loop);
      const t = master.currentTime || 0, d = master.duration || 29;
      if (playing()) for (const v of vids) if (v !== master && Math.abs(v.currentTime - t) > 0.12) v.currentTime = t;
      if (!S.scrubbing) scrub.value = Math.round((t / d) * 1000);
      const lab = `${fmt(t)} / ${fmt(d)}`;
      if (timeEl.textContent !== lab) timeEl.textContent = lab;
      btn.classList.toggle("playing", playing());
      if (!S.tr) return;
      drawPath(canvas, S.tr, t, METHODS.filter((m) => S.pinned.has(m.k) || S.hover === m.k), S.hover, chipsEl.offsetHeight + 22);
      const i = clamp(Math.floor(t / DT), 0, S.tr.keys.length - 1);
      if (i !== S.keysAt) {
        S.keysAt = i;
        const on = S.tr.keys[i];
        root.querySelectorAll(".rvc-keys .k").forEach((e) => e.classList.toggle("on", on.includes(e.dataset.k)));
      }
    })();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
