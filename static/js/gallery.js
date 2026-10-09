// Gallery: 15 more rollouts of ours, after the Memorizon page's teaser grid and lightbox.
// Every tile plays muted while on screen, with the WASD / arrow keys its trajectory implies;
// hovering shows its camera path; a click opens it large with the path, the keys and the prompt,
// and the arrow keys step through the set.
(function () {
  "use strict";

  const DIR = "static/videos/gallery";
  const DT = 0.25;
  const asset = (p) => (window.RVC_ASSET ? window.RVC_ASSET(p) : p);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---- keys HUD (same as the revisit section) ----
  const KEYS = [["W", 1, 2], ["A", 2, 1], ["S", 2, 2], ["D", 2, 3]];
  // turning keys shown as I / J / K / L (look up / turn left / look down / turn right); data keys stay u / l / d / r
  const TURNS = [["u", 1, 2, "I"], ["l", 2, 1, "J"], ["d", 2, 2, "K"], ["r", 2, 3, "L"]];
  function keyOverlay() {
    const o = el("div", "rvc-keys");
    o.setAttribute("aria-hidden", "true");
    [KEYS, TURNS].forEach((set) => {
      const g = el("div", "cluster");
      set.forEach(([k, row, col, label]) => {
        const e = el("span", "k", label || k);
        e.dataset.k = k;
        e.style.gridArea = `${row} / ${col}`;
        g.appendChild(e);
      });
      o.appendChild(g);
    });
    return o;
  }
  function litKeys(hud, tr, t) {
    if (!tr) return;
    const i = clamp(Math.floor(t / DT), 0, tr.keys.length - 1);
    if (hud._at === i) return;
    hud._at = i;
    const on = tr.keys[i];
    hud.querySelectorAll(".k").forEach((e) => e.classList.toggle("on", on.includes(e.dataset.k)));
  }

  // ---- compact top-view path, in the revisit section's palette ----
  function drawPath(cv, tr, t) {
    const w = cv.clientWidth, h = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!w || !h || !tr) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(247,249,251,0.86)";
    g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, h, 7) : g.rect(0, 0, w, h); g.fill();
    if (!tr._sx) {
      const sm = (a) => a.map((_, i) => { let s = 0, c = 0; for (let j = -1; j <= 1; j++) { const v = a[i + j]; if (v !== undefined) { s += v; c++; } } return s / c; });
      tr._sx = sm(tr.x); tr._sz = sm(tr.z);
    }
    const xs = tr._sx, zs = tr._sz, n = xs.length;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const pad = Math.min(w, h) * 0.2, span = Math.max(x1 - x0, z1 - z0, 1e-3);
    const s = Math.min((w - 2 * pad) / Math.max(x1 - x0, span * 0.4), (h - 2 * pad) / Math.max(z1 - z0, span * 0.4));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const P = (i) => [w / 2 + (xs[i] - cx) * s, h / 2 - (zs[i] - cz) * s];
    const k = clamp(t / tr.dt, 0, n - 1), ki = Math.floor(k), f = k - ki, k2 = Math.min(n - 1, ki + 1);
    const [ax, ay] = P(ki), [bx, by] = P(k2), px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
    g.lineJoin = g.lineCap = "round";
    // the whole path faint; the last few seconds in accent, fading out behind the camera
    g.beginPath(); g.strokeStyle = "#cdd5de"; g.lineWidth = 2.2;
    for (let i = 0; i < n; i++) { const [qx, qy] = P(i); i ? g.lineTo(qx, qy) : g.moveTo(qx, qy); }
    g.stroke();
    const tail = Math.min(ki, 16);
    for (let i = ki - tail; i < ki + 1; i++) {
      if (i < 0) continue;
      const [qx, qy] = P(i), [rx, ry] = i < ki ? P(i + 1) : [px, py];
      g.strokeStyle = `rgba(10,79,179,${(0.15 + 0.85 * (1 - (ki - i) / (tail + 1))).toFixed(3)})`; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(qx, qy); g.lineTo(rx, ry); g.stroke();
    }
    const [sx, sy] = P(0);
    g.fillStyle = "#fff"; g.strokeStyle = "#1c2b33"; g.lineWidth = 1.5;
    g.beginPath(); g.arc(sx, sy, 3, 0, 2 * Math.PI); g.fill(); g.stroke();
    const yaw = tr.yaw[ki] + (((tr.yaw[k2] - tr.yaw[ki] + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * f;
    const half = (tr.hfov / 2) * Math.PI / 180, L = Math.min(w, h) * 0.32;
    const cone = g.createRadialGradient(px, py, 0, px, py, L);
    cone.addColorStop(0, "rgba(10,79,179,0.45)"); cone.addColorStop(1, "rgba(10,79,179,0)");
    g.fillStyle = cone; g.beginPath(); g.moveTo(px, py);
    g.arc(px, py, L, yaw - half - Math.PI / 2, yaw + half - Math.PI / 2); g.closePath(); g.fill();
    g.fillStyle = "#0a4fb3"; g.strokeStyle = "#fff"; g.lineWidth = 1.8;
    g.beginPath(); g.arc(px, py, 4, 0, 2 * Math.PI); g.fill(); g.stroke();
  }

  function init() {
    const grid = document.getElementById("gal-grid");
    if (!grid) return;
    fetch(asset(`${DIR}/manifest.json`)).then((r) => r.json()).then((list) => build(grid, list));
  }

  function build(grid, list) {
    const trajs = {};
    const traj = (id) => {
      if (!(id in trajs)) { trajs[id] = null; fetch(asset(`${DIR}/${id}.json`)).then((r) => r.json()).then((j) => { trajs[id] = j; }); }
      return trajs[id];
    };
    const tiles = list.map((x, i) => {
      const t = el("button", "gal-tile");
      t.type = "button";
      t.setAttribute("aria-label", `${x.label}: open full size`);
      const v = el("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "none";
      v.poster = asset(`${DIR}/${x.id}.jpg`);
      const map = el("div", "gal-map"); const cv = el("canvas"); map.appendChild(cv);
      const hud = keyOverlay();
      t.append(v, el("span", "gal-label", x.label), map, hud);
      t.addEventListener("click", () => lb.show(i));
      grid.appendChild(t);
      return { t, v, cv, hud, x };
    });

    // play only what is on screen; off screen a clip neither plays nor downloads
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const o = tiles.find((q) => q.t === e.target);
      if (e.isIntersecting && !lb.open) {
        if (!o.v.getAttribute("src")) o.v.src = asset(`${DIR}/${o.x.id}.mp4`);
        o.v.play().catch(() => {});
        o.visible = true;
      } else {
        o.v.pause(); o.visible = false;
      }
    }), { threshold: 0.25 });
    tiles.forEach((o) => io.observe(o.t));

    // ---- lightbox ----
    const lb = { open: false, i: 0 };
    const arrow = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const box = el("div", "gal-lb");
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = `<button class="gal-lb-close" aria-label="Close">&times;</button>
      <button class="gal-lb-arrow prev" aria-label="Previous clip">${arrow("M15 5l-7 7 7 7")}</button>
      <figure class="gal-lb-stage">
        <div class="gal-lb-media"><video loop muted playsinline></video><div class="gal-map big"><canvas></canvas></div></div>
        <div class="gal-lb-bar">
          <button class="ctrl-btn" type="button" aria-label="Play / pause">
            <svg class="icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>
            <svg class="icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
          </button>
          <input type="range" class="gal-lb-scrub" min="0" max="1000" value="0" step="1" aria-label="Seek">
          <span class="gal-lb-time mono">0.0 s</span>
        </div>
        <figcaption><div class="gal-lb-title"><b></b><span class="dom"></span><span class="count"></span></div><p></p></figcaption>
      </figure>
      <button class="gal-lb-arrow next" aria-label="Next clip">${arrow("M9 5l7 7-7 7")}</button>`;
    document.body.appendChild(box);
    const bv = box.querySelector("video"), bcv = box.querySelector("canvas"), bhud = keyOverlay();
    box.querySelector(".gal-lb-media").appendChild(bhud);
    const bbtn = box.querySelector(".gal-lb-bar .ctrl-btn"), bscrub = box.querySelector(".gal-lb-scrub"), btime = box.querySelector(".gal-lb-time");
    const toggle = () => (bv.paused ? bv.play().catch(() => {}) : bv.pause());
    bbtn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    bv.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    let scrubbing = false;   // only while the pointer is down; focus stays on the slider after a click
    bscrub.addEventListener("pointerdown", () => { scrubbing = true; });
    window.addEventListener("pointerup", () => { scrubbing = false; });
    bscrub.addEventListener("input", () => { bv.currentTime = (bscrub.value / 1000) * (bv.duration || 10); });
    const load = (i) => {
      lb.i = (i + list.length) % list.length;
      const x = list[lb.i];
      bv.poster = asset(`${DIR}/${x.id}.jpg`);
      bv.src = asset(`${DIR}/${x.id}_hd.mp4`);
      bv.play().catch(() => {});
      box.querySelector(".gal-lb-title b").textContent = x.label;
      box.querySelector(".gal-lb-title .dom").textContent = x.domain;
      box.querySelector(".gal-lb-title .count").textContent = `${lb.i + 1} / ${list.length}`;
      box.querySelector("figcaption p").textContent = x.caption;
      bhud._at = -1;
    };
    lb.show = (i) => {
      lb.open = true; box.hidden = false; document.body.classList.add("gal-lock");
      tiles.forEach((o) => o.v.pause());
      requestAnimationFrame(() => box.classList.add("on"));
      load(i);
      box.querySelector(".gal-lb-close").focus({ preventScroll: true });
    };
    const hide = () => {
      lb.open = false; box.classList.remove("on"); document.body.classList.remove("gal-lock");
      bv.pause(); bv.removeAttribute("src"); bv.load();
      tiles.forEach((o) => { if (o.visible) o.v.play().catch(() => {}); });
      setTimeout(() => { if (!lb.open) box.hidden = true; }, 220);
      tiles[lb.i].t.focus({ preventScroll: true });
    };
    box.querySelector(".prev").addEventListener("click", (e) => { e.stopPropagation(); load(lb.i - 1); });
    box.querySelector(".next").addEventListener("click", (e) => { e.stopPropagation(); load(lb.i + 1); });
    box.querySelector(".gal-lb-close").addEventListener("click", hide);
    box.addEventListener("click", (e) => { if (e.target === box) hide(); });
    document.addEventListener("keydown", (e) => {
      if (!lb.open) return;
      if (e.key === "Escape") hide();
      else if (e.key === "ArrowLeft") { e.preventDefault(); load(lb.i - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); load(lb.i + 1); }
      else if (e.key === " ") { e.preventDefault(); toggle(); }
    }, true);

    (function loop() {
      requestAnimationFrame(loop);
      if (lb.open) {
        const tr = traj(list[lb.i].id);
        const t = bv.currentTime || 0, d = bv.duration || 10;
        drawPath(bcv, tr, t);
        litKeys(bhud, tr, t);
        if (!scrubbing) bscrub.value = Math.round((t / d) * 1000);
        bscrub.style.setProperty("--p", `${(t / d) * 100}%`);
        const lab = `${t.toFixed(1)} s / ${d.toFixed(0)} s`;
        if (btime.textContent !== lab) btime.textContent = lab;
        bbtn.classList.toggle("playing", !bv.paused);
        return;
      }
      for (const o of tiles) {
        if (!o.visible) continue;
        const tr = traj(o.x.id);
        litKeys(o.hud, tr, o.v.currentTime || 0);
        if (o.t.matches(":hover, :focus-visible")) drawPath(o.cv, tr, o.v.currentTime || 0);
      }
    })();
    grid._gal = { lb, tiles };   // read-only handle for automated checks
  }

  document.addEventListener("DOMContentLoaded", init);
})();
