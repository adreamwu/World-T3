// Out-and-back revisits: an explorable 3 x 3 comparison with a live top-view camera path.
//
// The viewer drives everything; nothing is scripted. They can
//   * drag the camera along its path (or click the path) to move every clip to that moment,
//   * hover the path to see that each spot is passed twice (going out and coming back),
//   * switch on "compare with the same spot": each clip shows, beside the current frame, what it
//     generated the other time the camera stood exactly here -- the test of memory,
//   * pin the camera path recovered from any model's video to see where its camera actually went.
// Path rendering and the key HUD follow the Memorizon page (tingtingliao.github.io/memorizon).
(function () {
  "use strict";

  const CASES = ["case1", "case2", "case3", "case4"];
  const DIR = "static/videos/revisit_cmp";
  const DUR = 10, FPS = 16, DT = 0.25, NLAT = 41;
  // grid order, row-major; the path panel spans two rows of the first column
  const CELLS = [
    { k: "path" },
    { k: "gt", name: "Real video", note: "reference" },
    { k: "ours", name: "Ours", ours: true, rec: "ours_s8000", color: "#0a4fb3" },
    { k: "mg3", name: "Matrix-Game 3.0", rec: "mg3", color: "#e8590c" },
    { k: "hyw", name: "HY-World 1.5", rec: "hyw", color: "#9c36b5" },
    { k: "sana", name: "SANA-WM", rec: "sana", color: "#0ca678" },
    { k: "lingbot", name: "LingBot-Fast", rec: "lingbot", color: "#d6336c" },
    { k: "dreamx", name: "DreamX-AR", rec: "dreamx", color: "#b08900" },
  ];
  const METHODS = CELLS.filter((c) => c.rec);
  const CHAPTERS = [
    { t: 0, label: "Start", title: "Back to the first frame and play" },
    { t: 5, label: "Turn back · 5 s", title: "The camera reverses here" },
    { t: 7.5, label: "Revisit · 7.5 s", title: "Same camera pose as at 2.5 s: compare what each model shows now with what it showed then", compare: true },
    { t: 9.94, label: "Back at start · 10 s", title: "Same camera pose as the first frame", compare: true },
  ];

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // the single-file build supplies media from embedded data; the site uses plain paths
  const asset = (p) => (window.RVC_ASSET ? window.RVC_ASSET(p) : p);
  const fmtS = (t) => `${t.toFixed(1)} s`;
  // compare labels: exact to a frame pair, so "now" and "the other visit" always add up to 10 s
  const fmtQ = (t) => `${(Math.round(t * 20) / 20).toFixed(2).replace(/0$/, "")} s`;

  // ---- keys HUD (Memorizon): WASD = translation, arrows = rotation ----
  const KEYS = [["W", 1, 2], ["A", 2, 1], ["S", 2, 2], ["D", 2, 3]];
  // turning keys shown as I / J / K / L (look up / turn left / look down / turn right); data keys stay u / l / d / r
  const TURNS = [["u", 1, 2, "I"], ["l", 2, 1, "J"], ["d", 2, 2, "K"], ["r", 2, 3, "L"]];
  function keyOverlay() {
    const o = document.createElement("div");
    o.className = "rvc-keys";
    o.setAttribute("aria-hidden", "true");
    [KEYS, TURNS].forEach((set) => {
      const g = document.createElement("div");
      g.className = "cluster";
      set.forEach(([k, row, col, label]) => {
        const e = document.createElement("span");
        e.className = "k";
        e.dataset.k = k;
        e.textContent = label || k;
        e.style.gridArea = `${row} / ${col}`;
        g.appendChild(e);
      });
      o.appendChild(g);
    });
    return o;
  }

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---- top-view map: projection + hit testing -----------------------------------------
  class PathMap {
    constructor(canvas) { this.cv = canvas; this.tr = null; }
    set(tr) {
      this.tr = tr;
      const sm = (a) => a.map((_, i) => { let s = 0, c = 0; for (let j = -1; j <= 1; j++) { const v = a[i + j]; if (v !== undefined) { s += v; c++; } } return s / c; });
      tr._sx = sm(tr.x); tr._sz = sm(tr.z);
    }
    layout() {
      const cv = this.cv, w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const tr = this.tr, xs = tr._sx, zs = tr._sz;
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      // room at the top for the title and at the bottom for the method chips
      const top = 44, bottom = this.bottomPad || 70, side = 34;
      const aw = w - 2 * side, ah = h - top - bottom;
      const span = Math.max(x1 - x0, z1 - z0, 1e-3);
      const s = Math.min(aw / Math.max(x1 - x0, span * 0.45), ah / Math.max(z1 - z0, span * 0.45));
      this.g = { w, h, dpr, s, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, ox: side + aw / 2, oy: top + ah / 2 };
    }
    P(x, z) { const g = this.g; return [g.ox + (x - g.cx) * g.s, g.oy - (z - g.cz) * g.s]; }
    Pi(i) { return this.P(this.tr._sx[i], this.tr._sz[i]); }
    at(t) {   // screen position of the commanded camera at time t
      const k = clamp(t / DT, 0, NLAT - 1), i = Math.floor(k), f = k - i, j = Math.min(NLAT - 1, i + 1);
      const [ax, ay] = this.Pi(i), [bx, by] = this.Pi(j);
      return [ax + (bx - ax) * f, ay + (by - ay) * f, i, j, f];
    }
    // nearest point on the path; out and back cover the same ground, so prefer the leg of `pref`
    nearest(mx, my, pref) {
      let best = null;
      for (let i = 0; i < NLAT - 1; i++) {
        const [ax, ay] = this.Pi(i), [bx, by] = this.Pi(i + 1);
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const u = L2 > 1e-9 ? clamp(((mx - ax) * dx + (my - ay) * dy) / L2, 0, 1) : 0;
        const px = ax + u * dx, py = ay + u * dy, d = Math.hypot(mx - px, my - py);
        const t = (i + u) * DT;
        const legMiss = pref == null ? 0 : ((t <= DUR / 2) !== (pref <= DUR / 2) ? 10 : 0);
        const score = d + legMiss;
        if (!best || score < best.score) best = { t, d, score, px, py };
      }
      return best;
    }
  }

  function drawMap(map, t, opts) {
    const tr = map.tr, cv = map.cv;
    map.layout();
    const { w, h, dpr } = map.g, g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const root = getComputedStyle(document.documentElement);
    const ACC = root.getPropertyValue("--accent").trim() || "#0a4fb3";
    const INK = root.getPropertyValue("--text").trim() || "#1c2b33";
    const dark = INK.toLowerCase() !== "#1c2b33";
    g.fillStyle = dark ? "#0f1a20" : "#f7f9fb"; g.fillRect(0, 0, w, h);

    // grid at a round step, anchored to the start
    const s = map.g.s, raw = 34 / s, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) * s;
    const [ox, oy] = map.Pi(0);
    g.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(28,43,51,0.07)"; g.lineWidth = 1;
    g.beginPath();
    for (let x = ((ox % step) + step) % step; x < w; x += step) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h); }
    for (let y = ((oy % step) + step) % step; y < h; y += step) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); }
    g.stroke();
    g.lineJoin = g.lineCap = "round";

    const [px, py, ki, k2, f] = map.at(t);

    // recovered paths: where each model's camera actually went (pinned, plus the hovered one)
    for (const m of opts.show) {
      const r = tr.rec && tr.rec[m.rec];
      if (!r) continue;
      const hot = opts.hover === m.k;
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = m.color; g.lineWidth = hot ? 2.6 : 1.8; g.globalAlpha = hot || !opts.hover ? 0.95 : 0.35;
      g.beginPath();
      for (let i = 0; i < r.x.length; i++) { const [qx, qy] = map.P(r.x[i], r.z[i]); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
      g.stroke(); g.setLineDash([]);
      // its camera now
      const kk = clamp(t / DT, 0, r.x.length - 1), i0 = Math.floor(kk), i1 = Math.min(r.x.length - 1, i0 + 1), ff = kk - i0;
      const [ax, ay] = map.P(r.x[i0], r.z[i0]), [bx, by] = map.P(r.x[i1], r.z[i1]);
      g.fillStyle = dark ? "#0f1a20" : "#fff"; g.lineWidth = 2.2;
      g.beginPath(); g.arc(ax + (bx - ax) * ff, ay + (by - ay) * ff, 4.5, 0, 2 * Math.PI); g.fill(); g.stroke();
      g.restore();
    }

    // commanded path: whole path faint, travelled part from pale to deep so "coming back" reads as newer
    g.beginPath(); g.strokeStyle = dark ? "rgba(255,255,255,0.22)" : "#cdd5de"; g.lineWidth = 3;
    for (let i = 0; i < NLAT; i++) { const [qx, qy] = map.Pi(i); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
    g.stroke();
    const kf = ki + f;
    if (kf > 0) {
      g.beginPath(); g.lineWidth = 7; g.strokeStyle = dark ? "rgba(15,26,32,0.9)" : "rgba(255,255,255,0.95)";
      for (let i = 0; i <= ki; i++) { const [qx, qy] = map.Pi(i); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
      g.lineTo(px, py); g.stroke();
      const hex = (c) => [1, 3, 5].map((j) => parseInt(c.slice(j, j + 2), 16));
      const c1 = /^#[0-9a-f]{6}$/i.test(ACC) ? hex(ACC) : [10, 79, 179], c0 = c1.map((v) => Math.round(v + (255 - v) * 0.7));
      const lerp = (u) => `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * u)).join(",")})`;
      g.lineWidth = 3.5;
      for (let i = 0; i <= ki; i++) {
        const [qx, qy] = map.Pi(i), [rx, ry] = i < ki ? map.Pi(i + 1) : [px, py];
        g.strokeStyle = lerp(Math.min(1, (i + 1) / Math.max(kf, 1)));
        g.beginPath(); g.moveTo(qx, qy); g.lineTo(rx, ry); g.stroke();
      }
    }

    // pills
    const placed = [];
    const pill = (text, x, y, col, bold, bg) => {
      g.font = `${bold ? 700 : 600} 11px Inter, system-ui, sans-serif`; g.textBaseline = "middle";
      const tw = g.measureText(text).width + 12, th = 18;
      const raw = [[x + 9, y - th / 2], [x + 9, y - th - 6], [x + 9, y + 6], [x - tw - 9, y - th / 2], [x - tw - 9, y - th - 6], [x - tw - 9, y + 6]];
      const fits = ([a, b]) => a >= 2 && a <= w - tw - 2 && b >= 2 && b <= h - th - 2;
      const cands = [...raw.filter(fits), ...raw.filter((c) => !fits(c))].map(([a, b]) => [clamp(a, 2, w - tw - 2), clamp(b, 2, h - th - 2)]);
      const hit = ([a, b]) => placed.some((r) => a < r[0] + r[2] + 3 && r[0] < a + tw + 3 && b < r[1] + r[3] + 2 && r[1] < b + th + 2);
      const [lx, ly] = cands.find((c) => !hit(c)) || cands[0];
      placed.push([lx, ly, tw, th]);
      g.fillStyle = bg || (dark ? "rgba(22,35,44,0.94)" : "rgba(255,255,255,0.94)"); g.beginPath();
      g.roundRect ? g.roundRect(lx, ly, tw, th, 9) : g.rect(lx, ly, tw, th); g.fill();
      g.fillStyle = col; g.fillText(text, lx + 6, ly + th / 2 + 0.5);
    };

    // start / turn-around
    const [sx, sy] = map.Pi(0);
    g.fillStyle = dark ? "#0f1a20" : "#fff"; g.strokeStyle = INK; g.lineWidth = 2;
    g.beginPath(); g.arc(sx, sy, 5, 0, 2 * Math.PI); g.fill(); g.stroke();
    pill("start", sx, sy, INK);
    const [tx, ty] = map.Pi((NLAT - 1) / 2);
    g.fillStyle = INK; g.beginPath(); g.moveTo(tx, ty - 5); g.lineTo(tx + 5, ty); g.lineTo(tx, ty + 5); g.lineTo(tx - 5, ty); g.closePath(); g.fill();
    pill("turns back · 5 s", tx, ty, INK);

    // hover ghost: every spot is passed twice
    if (opts.ghost) {
      const gt = opts.ghost.t, other = DUR - gt;
      g.fillStyle = "rgba(194,65,12,0.18)"; g.beginPath(); g.arc(opts.ghost.px, opts.ghost.py, 11, 0, 2 * Math.PI); g.fill();
      g.fillStyle = "#c2410c"; g.beginPath(); g.arc(opts.ghost.px, opts.ghost.py, 4.5, 0, 2 * Math.PI); g.fill();
      const a = Math.min(gt, other), b = Math.max(gt, other);
      pill(Math.abs(a - b) < 0.3 ? `turn-around · ${fmtS(a)}` : `here at ${fmtS(a)} and again at ${fmtS(b)}`, opts.ghost.px, opts.ghost.py, "#c2410c", true);
    }

    // current camera: view cone + haloed dot (bigger while dragged so it reads as a handle)
    const yaw = tr.yaw[ki] + (((tr.yaw[k2] - tr.yaw[ki] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * f;
    const half = (tr.hfov / 2) * Math.PI / 180, L = Math.min(w, h) * 0.2;
    const cone = g.createRadialGradient(px, py, 0, px, py, L);
    cone.addColorStop(0, "rgba(10,79,179,0.34)"); cone.addColorStop(1, "rgba(10,79,179,0)");
    g.fillStyle = cone; g.beginPath(); g.moveTo(px, py);
    g.arc(px, py, L, yaw - half - Math.PI / 2, yaw + half - Math.PI / 2); g.closePath(); g.fill();
    const R = opts.handleHot ? 8 : 6.5;
    g.fillStyle = "rgba(10,79,179,0.18)"; g.beginPath(); g.arc(px, py, R + 6 + (opts.dragging ? 3 : 0), 0, 2 * Math.PI); g.fill();
    g.fillStyle = ACC; g.strokeStyle = "#fff"; g.lineWidth = 2.5;
    g.beginPath(); g.arc(px, py, R, 0, 2 * Math.PI); g.fill(); g.stroke();
    if (opts.dragging) pill(`${fmtS(t)} · ${t <= DUR / 2 ? "going out" : "coming back"}`, px, py, ACC, true);
  }

  // ---- section ---------------------------------------------------------------------------
  function init() {
    const root = document.getElementById("rvc");
    if (!root) return;
    const grid = root.querySelector(".rvc-grid");
    const bar = document.getElementById("rvc-controls");
    const btn = bar.querySelector('[data-action="toggle"]');
    const cmpBtn = bar.querySelector('[data-action="compare"]');
    const scrub = bar.querySelector(".scrubber"), timeEl = bar.querySelector(".time"), speedEl = bar.querySelector(".speed");
    const chaptersEl = document.getElementById("rvc-chapters");
    const promptEl = document.getElementById("rvc-prompt");

    const vids = [], tiles = {};
    let map, canvas, chipsEl, coach;
    for (const c of CELLS) {
      const cell = el("div", "rvc-cell");
      cell.dataset.k = c.k;
      if (c.k === "path") {
        cell.classList.add("path");
        canvas = el("canvas");
        canvas.setAttribute("role", "slider");
        canvas.setAttribute("aria-label", "Camera position along the path; drag to move every clip to that moment");
        canvas.tabIndex = 0;
        cell.append(canvas, el("div", "rvc-tag plain", "Camera path · seen from above"));
        coach = el("div", "rvc-coach", `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.9-2.6L4 15.5a1.5 1.5 0 0 1 2.4-1.8L9 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>Drag the camera along its path`);
        cell.appendChild(coach);
        chipsEl = el("div", "rvc-chips");
        chipsEl.appendChild(el("div", "rvc-chips-lab", "Where each model&rsquo;s camera actually went"));
        const row = el("div", "rvc-chip-row");
        for (const m of METHODS) {
          const chip = el("button", "rvc-chip" + (m.ours ? " ours" : ""));
          chip.type = "button";
          chip.dataset.k = m.k;
          chip.style.setProperty("--c", m.color);
          chip.innerHTML = `<i></i>${m.name}<b></b>`;
          chip.setAttribute("aria-pressed", "false");
          row.appendChild(chip);
        }
        chipsEl.appendChild(row);
        cell.appendChild(chipsEl);
        map = new PathMap(canvas);
      } else {
        const v = el("video");
        v.muted = true; v.playsInline = true; v.preload = "auto"; v.dataset.k = c.k;
        const tag = el("div", "rvc-tag" + (c.ours ? " ours" : "") + (c.k === "gt" ? " gt" : ""),
          (c.color ? `<i style="background:${c.color}"></i>` : "") + c.name + (c.note ? ` <span>${c.note}</span>` : ""));
        const ghost = el("div", "rvc-ghost");
        ghost.innerHTML = '<div class="img"></div><i class="line"></i><b class="l"></b><b class="r"></b><span class="grip" aria-hidden="true">‹ ›</span>';
        cell.append(v, ghost, tag, keyOverlay());
        if (c.ours) cell.classList.add("ours");
        if (c.color) cell.style.setProperty("--c", c.color);
        vids.push(v);
        tiles[c.k] = { cell, v, ghost, img: ghost.querySelector(".img"), l: ghost.querySelector(".l"), r: ghost.querySelector(".r") };
      }
      grid.appendChild(cell);
    }
    const master = tiles.ours.v;

    const S = { cur: null, tr: null, compare: false, split: 0.5, pinned: new Set(), hover: null, ghost: null,
                dragging: false, handleHot: false, userPaused: false, inView: false, coached: false, lastSprite: -1 };

    // ---- transport ----
    const playing = () => !master.paused && !master.ended;
    const playAll = () => vids.forEach((v) => { const p = v.play(); if (p) p.catch(() => {}); });
    const pauseAll = () => vids.forEach((v) => v.pause());
    const seekAll = (t) => { t = clamp(t, 0, DUR - 0.02); vids.forEach((v) => { if (Math.abs(v.currentTime - t) > 0.004) v.currentTime = t; }); };
    const now = () => master.currentTime || 0;
    function setPlaying(on) { S.userPaused = !on; on ? playAll() : pauseAll(); }

    btn.addEventListener("click", () => setPlaying(!playing()));
    vids.forEach((v) => v.addEventListener("click", () => setPlaying(!playing())));
    speedEl.addEventListener("change", () => vids.forEach((v) => { v.playbackRate = Number(speedEl.value); }));
    let scrubWasPlaying = false;
    scrub.addEventListener("pointerdown", () => { scrubWasPlaying = playing(); pauseAll(); });
    scrub.addEventListener("input", () => { if (playing()) pauseAll(); seekAll((scrub.value / 1000) * DUR); });
    scrub.addEventListener("change", () => { if (scrubWasPlaying && !S.userPaused) playAll(); scrubWasPlaying = false; });
    master.addEventListener("ended", () => { if (!S.userPaused) { seekAll(0); playAll(); } });

    // ---- compare with the same spot ----
    function setCompare(on) {
      S.compare = on;
      root.classList.toggle("comparing", on);
      cmpBtn.setAttribute("aria-pressed", String(on));
      S.lastSprite = -1;
      dismissCoach();
    }
    cmpBtn.addEventListener("click", () => setCompare(!S.compare));
    // one divider for every clip; drag on any of them
    for (const k in tiles) {
      const T = tiles[k];
      T.ghost.addEventListener("pointerdown", (e) => {
        const go = (ev) => { const b = T.ghost.getBoundingClientRect(); S.split = clamp((ev.clientX - b.left) / b.width, 0.04, 0.96); root.style.setProperty("--split", `${S.split * 100}%`); };
        go(e); T.ghost.setPointerCapture(e.pointerId);
        T.ghost.onpointermove = go; T.ghost.onpointerup = () => { T.ghost.onpointermove = null; };
        e.stopPropagation(); e.preventDefault();
      });
      // hover a clip: preview where its camera went, and highlight its chip
      T.cell.addEventListener("mouseenter", () => { S.hover = k; syncChips(); });
      T.cell.addEventListener("mouseleave", () => { if (S.hover === k) S.hover = null; syncChips(); });
    }
    function updateGhosts(t) {
      if (!S.compare) return;
      const other = DUR - t, idx = clamp(Math.round(other / DT), 0, NLAT - 1);
      const back = t > DUR / 2;
      for (const k in tiles) {
        const T = tiles[k];
        if (idx !== S.lastSprite) T.img.style.backgroundPosition = `${(idx % 7) / 6 * 100}% ${Math.floor(idx / 7) / 5 * 100}%`;
        T.l.textContent = Math.abs(other - t) < 0.2 ? `turn-around · ${fmtQ(idx * DT)}` : `${back ? "first time here" : "when it comes back"} · ${fmtQ(idx * DT)}`;
        T.r.textContent = `now · ${fmtQ(DUR - idx * DT)}`;
      }
      S.lastSprite = idx;
    }

    // ---- method chips: pin a recovered path ----
    function syncChips() {
      chipsEl.querySelectorAll(".rvc-chip").forEach((c) => {
        const on = S.pinned.has(c.dataset.k);
        c.classList.toggle("on", on); c.setAttribute("aria-pressed", String(on));
        c.classList.toggle("hot", S.hover === c.dataset.k);
      });
      for (const k in tiles) tiles[k].cell.classList.toggle("hot", S.hover === k || S.pinned.has(k));
    }
    chipsEl.addEventListener("click", (e) => {
      const c = e.target.closest(".rvc-chip"); if (!c) return;
      const k = c.dataset.k; S.pinned.has(k) ? S.pinned.delete(k) : S.pinned.add(k); syncChips();
    });
    chipsEl.addEventListener("mouseover", (e) => { const c = e.target.closest(".rvc-chip"); S.hover = c ? c.dataset.k : null; syncChips(); });
    chipsEl.addEventListener("mouseleave", () => { S.hover = null; syncChips(); });

    // ---- drag the camera along its path ----
    let dragWasPlaying = false;
    const local = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    canvas.addEventListener("pointerdown", (e) => {
      if (!S.tr) return;
      const [mx, my] = local(e);
      const [cx, cy] = map.at(now());
      const near = map.nearest(mx, my, now());
      if (Math.hypot(mx - cx, my - cy) > 22 && (!near || near.d > 26)) return;
      S.dragging = true; dragWasPlaying = playing(); pauseAll();
      canvas.setPointerCapture(e.pointerId);
      if (Math.hypot(mx - cx, my - cy) > 22) seekAll(near.t);   // a click on the path jumps there
      dismissCoach();
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!S.tr) return;
      const [mx, my] = local(e);
      if (S.dragging) { const n = map.nearest(mx, my, now()); if (n) seekAll(n.t); S.ghost = null; return; }
      const [cx, cy] = map.at(now());
      S.handleHot = Math.hypot(mx - cx, my - cy) < 22;
      const n = map.nearest(mx, my, null);
      S.ghost = !S.handleHot && n && n.d < 16 ? n : null;
      canvas.style.cursor = S.handleHot ? "grab" : S.ghost ? "pointer" : "default";
    });
    const endDrag = () => { if (!S.dragging) return; S.dragging = false; if (dragWasPlaying && !S.userPaused) playAll(); };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", () => { if (!S.dragging) { S.ghost = null; S.handleHot = false; } });
    canvas.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); pauseAll(); S.userPaused = true; seekAll(now() + (e.key === "ArrowRight" ? DT : -DT)); }
    });
    function dismissCoach() { if (!S.coached) { S.coached = true; coach.classList.add("gone"); } }

    // ---- chapters ----
    CHAPTERS.forEach((c) => {
      const b = el("button", "rvc-chapter", c.label);
      b.type = "button"; b.title = c.title;
      b.addEventListener("click", () => {
        if (c.t === 0) { seekAll(0); setPlaying(true); return; }
        setPlaying(false); seekAll(c.t);
        if (c.compare && !S.compare) setCompare(true);
      });
      chaptersEl.appendChild(b);
    });

    // ---- keyboard: only while the section is on screen ----
    document.addEventListener("keydown", (e) => {
      if (!S.inView || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (/INPUT|SELECT|TEXTAREA/.test(tag) && document.activeElement !== scrub) return;
      if (e.key === " " || e.code === "Space") { if (tag === "BUTTON") return; e.preventDefault(); setPlaying(!playing()); }
      else if (e.key === "c" || e.key === "C") { setCompare(!S.compare); }
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && document.activeElement !== scrub && document.activeElement !== canvas) {
        e.preventDefault(); setPlaying(false); seekAll(now() + (e.key === "ArrowRight" ? 1 : -1) / FPS * (e.shiftKey ? 4 : 1));
      }
    });

    // ---- scenes ----
    function load(id) {
      S.cur = id; S.tr = null; S.lastSprite = -1;
      const d = `${DIR}/${id}`;
      vids.forEach((v) => { v.pause(); v.poster = asset(`${d}/${v.dataset.k}.jpg`); v.src = asset(`${d}/${v.dataset.k}.mp4`); v.playbackRate = Number(speedEl.value); });
      for (const k in tiles) tiles[k].img.style.backgroundImage = `url("${asset(`${d}/sprites/${k}.jpg`)}")`;
      fetch(asset(`${d}/traj.json`)).then((r) => r.json()).then((j) => {
        if (S.cur !== id) return;
        S.tr = j; map.set(j);
        chipsEl.querySelectorAll(".rvc-chip").forEach((c) => {
          const m = METHODS.find((x) => x.k === c.dataset.k), a = j.ate && j.ate[m.rec];
          c.querySelector("b").textContent = a == null ? "" : `${(100 * a).toFixed(a < 0.1 ? 1 : 0)}%`;
          c.title = a == null ? "" : `${m.name}: its camera drifted ${(100 * a).toFixed(1)}% of the path's size from the requested one (re-estimated from its video)`;
        });
        if (promptEl) promptEl.textContent = j.caption || "";
      });
      if (S.inView && !S.userPaused) playAll();
    }
    const tabs = document.querySelector('[data-tabs="revisit-cmp"]');
    tabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab || tab.classList.contains("active")) return;
      tabs.querySelectorAll(".tab").forEach((t) => { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", t === tab); });
      load(CASES[Number(tab.dataset.index)]);
    });

    new IntersectionObserver(([en]) => {
      S.inView = en.isIntersecting;
      if (!S.inView) pauseAll(); else if (!S.userPaused && !S.dragging) playAll();
    }, { threshold: 0.25 }).observe(grid);

    load(CASES[0]);
    root._rvc = { map, state: S, now };   // read-only handle for automated checks

    // ---- frame loop ----
    (function loop() {
      requestAnimationFrame(loop);
      const t = now();
      if (playing()) for (const v of vids) if (v !== master && Math.abs(v.currentTime - t) > 0.1) v.currentTime = t;
      if (document.activeElement !== scrub || !scrubWasPlaying) scrub.value = Math.round((t / DUR) * 1000);
      scrub.style.setProperty("--p", `${(t / DUR) * 100}%`);
      const lab = `${t.toFixed(1)} s · ${t <= DUR / 2 ? "going out" : "coming back"}`;
      if (timeEl.textContent !== lab) timeEl.textContent = lab;
      btn.classList.toggle("playing", playing());
      updateGhosts(t);
      if (!S.tr) return;
      const show = METHODS.filter((m) => S.pinned.has(m.k) || S.hover === m.k);
      map.bottomPad = chipsEl.offsetHeight + 22;
      drawMap(map, t, { show, hover: S.hover, ghost: S.ghost, dragging: S.dragging, handleHot: S.handleHot || S.dragging });
      const i = clamp(Math.floor(t / DT), 0, S.tr.keys.length - 1);
      if (i !== root._keysAt) {
        root._keysAt = i;
        const on = S.tr.keys[i];
        root.querySelectorAll(".rvc-keys .k").forEach((e) => e.classList.toggle("on", on.includes(e.dataset.k)));
      }
    })();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
