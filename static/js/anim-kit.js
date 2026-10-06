// Shared helpers for the Method walkthroughs (Stage 2 and Stage 3): SVG drawing in the paper figure's
// style, and the play / step / restart clock with captions.
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (x) => x * x * (3 - 2 * x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const bump = (p, a, b) => Math.sin(Math.PI * seg(p, a, b)); // 0 -> 1 -> 0 inside [a, b]
  const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, t) => {
    const A = hexRGB(a), B = hexRGB(b);
    return "rgb(" + A.map((v, i) => Math.round(lerp(v, B[i], t))).join(",") + ")";
  };

  // Smooth polyline (Catmull-Rom) with an arc-length lookup: at(u) is the point u of the way along it.
  function route(points) {
    const n = points.length, out = [];
    if (n < 3) out.push(...points);
    else for (let i = 0; i < n - 1; i++) {
      const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
      for (let k = 0; k < 14; k++) {
        const t = k / 14, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    out.push(points[n - 1]);
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    const len = cum[cum.length - 1];
    return {
      at(u) {
        const d = clamp(u) * len; let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const f = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        return [lerp(out[i - 1][0], out[i][0], f), lerp(out[i - 1][1], out[i][1], f)];
      },
    };
  }

  // Drawing helpers bound to one <svg>. `arrows` maps a name to an arrowhead colour; `prefix` keeps marker ids unique.
  function scene(svg, { prefix, arrows, ink }) {
    const defs = document.createElementNS(NS, "defs");
    svg.appendChild(defs);
    const head = {};
    for (const k in arrows) {
      defs.innerHTML += `<marker id="${prefix}-ah-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${arrows[k]}"/></marker>`;
      head[k] = `url(#${prefix}-ah-${k})`;
    }
    const root = document.createElementNS(NS, "g");
    svg.appendChild(root);

    function el(tag, attrs, parent) {
      const e = document.createElementNS(NS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      (parent || root).appendChild(e);
      return e;
    }
    const group = (parent) => el("g", {}, parent);
    const arrow = (parent, d, col, w = 4) => el("path", { d, fill: "none", stroke: arrows[col], "stroke-width": w, "stroke-linecap": "round", "marker-end": head[col] }, parent);
    const box = (parent, x, y, w, h, rx, fill, stroke, sw = 4, dash) => el("rect", { x, y, width: w, height: h, rx, fill, stroke, "stroke-width": sw, ...(dash ? { "stroke-dasharray": dash } : {}) }, parent);
    function label(parent, x, y, str, o = {}) {
      const t = el("text", { x, y, "text-anchor": o.anchor || "middle", fill: o.fill || ink, "font-size": o.size || 31, "font-weight": o.weight || 400, "font-family": FONT, "font-style": o.italic ? "italic" : "normal" }, parent);
      t.textContent = str;
      return t;
    }
    // Inline "math" in the figure's sans style. parts: [text, kind]; kind "" normal, "s" italic subscript,
    // "S" upright subscript, "p" superscript, "i" italic.
    function math(parent, x, y, parts, o = {}) {
      const fs = o.size || 36;
      const t = el("text", { x, y, "text-anchor": o.anchor || "middle", fill: o.fill || ink, "font-size": fs, "font-weight": o.weight || 600, "font-family": FONT }, parent);
      let shift = 0;
      for (const [str, kind = ""] of parts) {
        const ts = document.createElementNS(NS, "tspan");
        const target = kind === "s" || kind === "S" ? 0.26 : kind === "p" ? -0.36 : 0;
        ts.setAttribute("dy", ((target - shift) * fs).toFixed(1));
        shift = target;
        if (kind === "s" || kind === "S" || kind === "p") { ts.setAttribute("font-size", fs * 0.68); ts.setAttribute("font-weight", 500); }
        if (kind === "s" || kind === "i") ts.setAttribute("font-style", "italic");
        ts.textContent = str;
        t.appendChild(ts);
      }
      return t;
    }
    return { root, el, group, arrow, box, label, math };
  }

  // Moving chips along routes. specs: { name: { route, chips: [colour, ...] } } (chip sizes shrink along the list).
  function chips(parent, el, group, specs) {
    const g = group(parent), all = {};
    for (const name in specs) {
      all[name] = { route: specs[name].route, items: specs[name].chips.map((col, i) => {
        const item = group(g), w = 22 - i * 3;
        el("rect", { x: -w / 2, y: -w / 2, width: w, height: w, rx: 5, fill: col, stroke: "#fff", "stroke-width": 2.5 }, item);
        item.setAttribute("opacity", 0);
        return item;
      }) };
    }
    // u: how far the lead chip has travelled (0..1); recolor: [fraction, colourAfter, colourBefore] switches colour part-way
    return function flow(name, u, recolor) {
      const f = all[name];
      f.items.forEach((item, k) => {
        const t = u * 1.35 - k * 0.15;
        if (u <= 0 || t <= 0 || t >= 1) { item.setAttribute("opacity", 0); return; }
        const [x, y] = f.route.at(ease(t));
        item.setAttribute("transform", `translate(${x} ${y})`);
        item.setAttribute("opacity", Math.min(1, t * 9, (1 - t) * 9));
        if (recolor) item.firstChild.setAttribute("fill", t > recolor[0] ? recolor[1] : recolor[2]);
      });
    };
  }

  // Captions, step buttons, progress bar, play / step / restart / speed, and the animation clock.
  function clock({ root, phases, phaseMs, render }) {
    const $ = (sel) => root.querySelector(sel);
    const pill = $(".anim-pill"), title = $(".anim-title"), desc = $(".anim-desc"), eq = $(".anim-eq");
    const steps = [...root.querySelectorAll(".anim-steps button")];
    const bars = [...root.querySelectorAll(".anim-bar i")];
    const playBtn = $(".anim-play"), speedSel = $(".anim-speed");
    const N = phases.length;
    let shown = -1, t = 0.1, playing = true, inView = false, last = 0, raf = 0, speed = 1;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { playing = false; t = N - 1.1; }

    function renderEq() {
      const P = phases[Math.max(0, shown)];
      if (window.katex) window.katex.render(P.tex, eq, { throwOnError: false, displayMode: false, output: "html" });
      else eq.textContent = "";
    }
    function setCaption(ph) {
      if (ph === shown) return;
      shown = ph;
      const P = phases[ph];
      pill.textContent = P.pill; pill.dataset.kind = P.kind;
      title.textContent = P.title; desc.textContent = " " + P.desc;
      steps.forEach((b, k) => b.setAttribute("aria-pressed", String(k === ph)));
      renderEq();
    }
    function draw() {
      render(t);
      setCaption(Math.floor(t) % N);
      bars.forEach((b, k) => { b.style.backgroundSize = (t >= k + 1 ? 100 : t >= k ? (t - k) * 100 : 0) + "% 100%"; });
    }
    const running = () => playing && inView && !document.hidden;
    function frame(ts) {
      if (!running()) { raf = 0; return; }
      if (!last) last = ts;
      const dt = clamp(ts - last, 0, 64); last = ts; // the frame timestamp can precede the click that restarted us
      t = (t + dt / (phaseMs / speed)) % N;
      draw();
      raf = requestAnimationFrame(frame);
    }
    function kick() {
      playBtn.textContent = playing ? "Pause" : "Play";
      playBtn.setAttribute("aria-pressed", String(!playing));
      if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); }
    }
    const jump = (k) => { playing = false; t = k + .9; draw(); kick(); };

    playBtn.addEventListener("click", () => { playing = !playing; kick(); });
    $(".anim-step").addEventListener("click", () => jump((Math.floor(t) + 1) % N));
    $(".anim-restart").addEventListener("click", () => { t = 0; playing = true; draw(); kick(); });
    steps.forEach((b, k) => b.addEventListener("click", () => jump(k)));
    speedSel.addEventListener("change", () => { speed = Number(speedSel.value); });

    // only run while visible (a panel stays hidden until its stage card is selected)
    new IntersectionObserver((entries) => { inView = entries.some((e) => e.isIntersecting); kick(); }, { threshold: .25 }).observe(root);
    document.addEventListener("visibilitychange", kick);
    window.addEventListener("load", renderEq);

    draw();
    root.__setTime = (v) => { playing = false; t = v; draw(); kick(); }; // lets tests pin a frame
  }

  window.AnimKit = { clamp, seg, ease, lerp, bump, mixHex, route, scene, chips, clock };
})();
