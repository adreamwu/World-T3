// Stage 2 walkthrough. The drawing reproduces the paper figure (a) context window and camera revisit,
// (b) WRITE / READ of the TTT memory, (c) DiT integration, and animates data moving through it.
// All coordinates are in the figure's own 2000 x 1067 space.
(() => {
  "use strict";
  const root = document.getElementById("ttt-anim");
  if (!root) return;
  const svg = root.querySelector(".ttt-svg");
  const $ = (sel) => root.querySelector(sel);
  const NS = "http://www.w3.org/2000/svg";

  // Colours sampled from the paper figure.
  const C = {
    ink: "#25313c", grey: "#7d8a94", line: "#dee4e6",
    blue: "#537d95", blueT: "#4d7a97", blueF: "#e8eff5", tile: "#bed7e9",
    green: "#63836a", greenF: "#ecf3ed", greenL: "#f6f8f6", greenIn: "#b4c5b7",
    orange: "#b87c4b", orangeF: "#f8ecdf", orangeL: "#fcf6ec", orangeG: "#bf8a5f",
    dit: "#869197", ditBox: "#b8c0c5", ditF: "#fafbfb",
    purple: "#9b96bd", purpleF: "#ebe8f0",
  };
  const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

  // ---------- helpers ----------
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
  let scene;
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent !== null) (parent || scene).appendChild(e);
    return e;
  }
  const group = (parent) => el("g", {}, parent);

  // Inline "math" in the figure's sans style. parts: [text, kind]; kind "" normal, "s" italic subscript,
  // "S" upright subscript, "p" superscript, "i" italic.
  function math(parent, x, y, parts, o = {}) {
    const fs = o.size || 36;
    const t = el("text", { x, y, "text-anchor": o.anchor || "middle", fill: o.fill || C.ink, "font-size": fs, "font-weight": o.weight || 600, "font-family": FONT }, parent);
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
  function label(parent, x, y, str, o = {}) {
    const t = el("text", { x, y, "text-anchor": o.anchor || "middle", fill: o.fill || C.ink, "font-size": o.size || 31, "font-weight": o.weight || 400, "font-family": FONT, "font-style": o.italic ? "italic" : "normal" }, parent);
    t.textContent = str;
    return t;
  }
  function route(points) { // smooth polyline (Catmull-Rom) with arc-length lookup
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

  // ---------- scene ----------
  const defs = el("defs", {}, svg);
  const ARROW = {}, ARROW_COL = { green: C.green, orange: C.orange, ink: C.ink, purple: C.purple };
  for (const k in ARROW_COL) {
    defs.innerHTML += `<marker id="ttt-ah-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${ARROW_COL[k]}"/></marker>`;
    ARROW[k] = `url(#ttt-ah-${k})`;
  }
  scene = el("g", {}, svg);
  const arrow = (parent, d, col, w = 4) => el("path", { d, fill: "none", stroke: ARROW_COL[col], "stroke-width": w, "stroke-linecap": "round", "marker-end": ARROW[col] }, parent);
  const box = (parent, x, y, w, h, rx, fill, stroke, sw = 4, dash) => el("rect", { x, y, width: w, height: h, rx, fill, stroke, "stroke-width": sw, ...(dash ? { "stroke-dasharray": dash } : {}) }, parent);

  // static: panel titles and dividers
  const st = group();
  el("path", { d: "M10 332H1990", stroke: C.line, "stroke-width": 3 }, st);
  el("path", { d: "M1410 70V300", stroke: C.line, "stroke-width": 3 }, st);
  el("path", { d: "M1358 372V1056", stroke: C.line, "stroke-width": 3 }, st);
  label(st, 10, 46, "(a)", { anchor: "start", size: 38, weight: 700 });
  label(st, 78, 46, "Context Window Modeling and Camera Revisit", { anchor: "start", size: 38, weight: 700 });
  label(st, 10, 402, "(b)", { anchor: "start", size: 38, weight: 700 });
  label(st, 78, 402, "Test-Time Memory Consolidation", { anchor: "start", size: 38, weight: 700 });
  label(st, 1385, 402, "(c)", { anchor: "start", size: 38, weight: 700 });
  label(st, 1450, 402, "DiT Integration", { anchor: "start", size: 38, weight: 700 });

  // ---- (a) blocks ----
  const gCtx = group(), gEv = group(), gCur = group();
  label(gCtx, 104, 100, "Sink", { fill: C.blueT, weight: 700 });
  label(gCtx, 806, 100, "K Recent Clean Blocks", { fill: C.blueT, weight: 700 });
  label(gEv, 343, 100, "Evicted Block", { fill: C.green, weight: 700 });
  label(gCur, 1266, 100, "Current Block", { fill: C.orange, weight: 700 });
  const BOX_Y = 125, BOX_H = 83;
  const glows = [];
  const blk = (parent, x, w, fill, stroke, dash, glowCol) => {
    const g = el("rect", { x: x - 6, y: BOX_Y - 6, width: w + 12, height: BOX_H + 12, rx: 26, fill: "none", stroke: glowCol, "stroke-width": 9, opacity: 0 }, parent);
    box(parent, x, BOX_Y, w, BOX_H, 22, fill, stroke, 4, dash);
    return g;
  };
  glows.push(blk(gCtx, 22, 164, C.blueF, C.blue, null, C.blue));
  math(gCtx, 104, 180, [["s = x"], ["1", "S"]], { fill: C.blueT });
  glows.push(blk(gCtx, 495, 163, C.blueF, C.blue, null, C.blue));
  math(gCtx, 576, 180, [["x"], ["b−K", "s"]], { fill: C.blueT });
  glows.push(blk(gCtx, 678, 163, C.blueF, C.blue, null, C.blue));
  math(gCtx, 760, 180, [["x"], ["b−K+1", "s"]], { fill: C.blueT });
  label(gCtx, 895, 175, "···", { fill: C.blueT, size: 32 });
  glows.push(blk(gCtx, 955, 163, C.blueF, C.blue, null, C.blue));
  math(gCtx, 1036, 180, [["x"], ["b−1", "s"]], { fill: C.blueT });
  label(gCtx, 103, 252, "Never Evicted", { fill: C.grey });
  const evGlow = blk(gEv, 259, 163, C.greenL, C.green, "17 12", C.green);
  math(gEv, 340, 180, [["x"], ["eb", "s"]], { fill: C.green });
  arrow(gEv, "M341 214V266", "green", 4);
  label(gEv, 343, 312, "Consolidate on Eviction", { fill: C.green });
  glows.push(blk(gCur, 1186, 163, C.orangeF, C.orange, null, C.orange));
  const noiseG = group(gCur);
  const noise = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 7; c++) {
    noise.push({ e: el("rect", { x: 1193 + c * 22, y: 133 + r * 22, width: 17, height: 17, rx: 3, fill: C.orange }, noiseG), k: 0.3 + ((r * 7 + c) * 37 % 70) / 100 });
  }
  math(gCur, 1267, 180, [["x"], ["b", "s"]], { fill: C.orange });
  label(gCur, 1267, 252, "Noisy Target", { fill: C.orange });

  // ---- (a) camera revisit ----
  const gCam = group();
  const ECX = 1727, ECY = 162, ERX = 240, ERY = 70;
  el("ellipse", { cx: ECX, cy: ECY, rx: ERX, ry: ERY, fill: "none", stroke: "#b5bdc4", "stroke-width": 3, "stroke-dasharray": "13 10" }, gCam);
  const onEllipse = (deg) => [ECX + ERX * Math.cos(deg * Math.PI / 180), ECY + ERY * Math.sin(deg * Math.PI / 180)];
  function camera(parent, fill, stroke) {
    const g = group(parent);
    el("path", { d: "M-7 -8 L-25 -62 L25 -62 L7 -8 Z", fill, stroke, "stroke-width": 3.5, "stroke-linejoin": "round" }, g);
    el("rect", { x: -9, y: -9, width: 18, height: 18, rx: 2, fill: stroke, transform: "rotate(45)" }, g);
    return g;
  }
  const place = (g, [x, y], rot) => g.setAttribute("transform", `translate(${x} ${y}) rotate(${rot})`);
  for (const [deg, rot] of [[282, 41], [330, -43], [42, -50], [109, 22]]) place(camera(gCam, "#fff", "#8e99a5"), onEllipse(deg), rot);
  const ejCam = camera(gCam, C.greenF, C.green); place(ejCam, [1487, 146], 54);
  math(gCam, 1455, 130, [["e", "i"], ["j", "s"]], { fill: C.green, weight: 500, size: 38 });
  const bCam = camera(gCam, C.orangeF, C.orange);
  const ring = el("circle", { cx: 1500, cy: 160, r: 58, fill: "none", stroke: C.orange, "stroke-width": 4, "stroke-dasharray": "9 8", opacity: 0 }, gCam);
  math(gCam, 1467, 222, [["b", "i"]], { fill: C.orange, weight: 500, size: 38 });
  el("path", { d: "M1596 212 L1540 200 L1546 208 L1534 205 Z", fill: "#a9b4be" }, gCam);
  label(gCam, 1480, 300, "Revisit Viewpoint", { fill: C.orange, weight: 700, size: 30, anchor: "start" });
  const revPi = math(gCam, 1900, 300, [["Π", "i"], ["b", "s"], [" = ", ""], ["Π", "i"], ["ej", "s"]], { size: 32, fill: C.ink });
  const rk = revPi.children;
  rk[0].setAttribute("fill", C.orange); rk[1].setAttribute("fill", C.orange);
  rk[3].setAttribute("fill", C.green); rk[4].setAttribute("fill", C.green);

  // ---- (b) WRITE ----
  const gWrite = group(), gMem = group();
  label(gWrite, 22, 462, "WRITE", { fill: C.green, weight: 700, size: 40, anchor: "start" });
  math(gWrite, 72, 590, [["Π", "i"], ["ej", "s"]], { fill: C.green });
  math(gWrite, 62, 730, [["h", ""], ["eb", "s"]], { fill: C.green });
  arrow(gWrite, "M118 577H166", "green"); arrow(gWrite, "M118 719H166", "green");
  const phiKw = box(gWrite, 171, 544, 108, 64, 12, C.greenF, C.green);
  const phiVw = box(gWrite, 171, 685, 108, 64, 12, C.greenF, C.green);
  math(gWrite, 225, 590, [["ϕ", "i"], ["K", "s"]], { fill: C.green, weight: 500 });
  math(gWrite, 225, 731, [["ϕ", "i"], ["V", "s"]], { fill: C.green, weight: 500 });
  arrow(gWrite, "M281 577H380", "green"); arrow(gWrite, "M281 719H380", "green");
  math(gWrite, 330, 556, [["k"], ["j", "s"]], { fill: C.green });
  math(gWrite, 330, 698, [["v"], ["j", "s"]], { fill: C.green });
  box(gWrite, 385, 500, 495, 268, 46, C.greenL, C.green);
  label(gWrite, 630, 535, "RLS update", { weight: 700, size: 34, fill: C.ink });
  const eqPlate = [
    el("rect", { x: 420, y: 548, width: 420, height: 90, rx: 14, fill: C.green, opacity: 0 }, gWrite),
    el("rect", { x: 420, y: 646, width: 420, height: 50, rx: 14, fill: C.green, opacity: 0 }, gWrite),
    el("rect", { x: 420, y: 702, width: 420, height: 50, rx: 14, fill: C.green, opacity: 0 }, gWrite),
  ];
  const eqCol = "#4a6c54";
  math(gWrite, 520, 606, [["g ="]], { fill: eqCol, size: 36 });
  math(gWrite, 668, 584, [["Pφ"]], { fill: eqCol, size: 36 });
  el("path", { d: "M571 596H764", stroke: eqCol, "stroke-width": 3 }, gWrite);
  math(gWrite, 668, 640, [["w"], ["−1", "p"], [" + φ"], ["⊤", "p"], ["Pφ"]], { fill: eqCol, size: 36 });
  math(gWrite, 637, 683, [["W"], ["2", "S"], [" ← W"], ["2", "S"], [" + (v − W"], ["2", "S"], ["φ)g"], ["⊤", "p"]], { fill: eqCol, size: 36 });
  math(gWrite, 627, 739, [["P ← P − gφ"], ["⊤", "p"], ["P"]], { fill: eqCol, size: 36 });
  arrow(gWrite, "M884 636H978", "green");
  label(gWrite, 928, 604, "update", { fill: C.grey, size: 29 });

  box(gMem, 982, 500, 355, 268, 46, C.greenF, C.green);
  label(gMem, 1157, 535, "Persistent Memory", { weight: 700, size: 33, fill: C.ink });
  math(gMem, 1157, 580, [["ℳ", "i"], ["b", "s"]], { fill: C.green, weight: 400, size: 40 });
  label(gMem, 1077, 628, "Fast Weights", { fill: C.green, size: 29 });
  label(gMem, 1240, 628, "RLS State", { fill: C.green, size: 29 });
  box(gMem, 1014, 654, 126, 80, 16, "#fff", C.greenIn, 3.5);
  box(gMem, 1178, 654, 126, 80, 16, "#fff", C.greenIn, 3.5);
  const flashW = el("rect", { x: 1014, y: 654, width: 126, height: 80, rx: 16, fill: C.green, opacity: 0 }, gMem);
  const flashP = el("rect", { x: 1178, y: 654, width: 126, height: 80, rx: 16, fill: C.green, opacity: 0 }, gMem);
  el("text", { x: 1054, y: 716, "font-size": 44, "font-weight": 600, fill: eqCol, "font-family": FONT, "text-anchor": "middle" }, gMem).textContent = "W";
  el("text", { x: 1081, y: 726, "font-size": 29, "font-weight": 500, fill: eqCol, "font-family": FONT }, gMem).textContent = "2";
  el("text", { x: 1085, y: 690, "font-size": 27, "font-style": "italic", fill: eqCol, "font-family": FONT }, gMem).textContent = "(Jb)";
  math(gMem, 1241, 712, [["P"], ["Jb", "s"]], { fill: eqCol, size: 44 });

  // ---- (b) READ ----
  const gRead = group(), gRet = group(), gMemArrow = group();
  label(gRead, 22, 826, "READ", { fill: C.orange, weight: 700, size: 40, anchor: "start" });
  const piB = math(gRead, 74, 958, [["Π", "i"], ["b", "s"]], { fill: C.orange });
  arrow(gRead, "M118 948H166", "orange");
  const phiKr = box(gRead, 171, 912, 108, 66, 12, C.orangeF, C.orange);
  math(gRead, 225, 958, [["ϕ", "i"], ["K", "s"]], { fill: C.orange, weight: 500 });
  arrow(gRead, "M281 948H430", "orange");
  math(gRead, 333, 928, [["k"], ["b", "s"]], { fill: C.orange });
  arrow(gMemArrow, "M1078 736V866", "green");
  box(gRet, 435, 871, 733, 167, 46, C.orangeL, C.orange);
  label(gRet, 800, 905, "Pose-Keyed Retrieval", { weight: 700, size: 34, fill: C.ink });
  const retPlate = [
    el("rect", { x: 560, y: 922, width: 480, height: 50, rx: 14, fill: C.orange, opacity: 0 }, gRet),
    el("rect", { x: 560, y: 976, width: 480, height: 50, rx: 14, fill: C.orange, opacity: 0 }, gRet),
  ];
  math(gRet, 800, 958, [["φ(k) = gelu(W"], ["1", "S"], ["k)"]], { fill: C.orange, size: 37 });
  math(gRet, 800, 1013, [["m"], ["b", "s"], [" = W"], ["2", "S"], ["φ(k"], ["b", "s"], [")"]], { fill: C.orange, size: 37 });

  // ---- (c) DiT ----
  const gDit = group(), gGate = group(), gOA = group();
  const tiles = (parent, x, y, n, col, size = 38, gap = 6) => Array.from({ length: n }, (_, i) => el("rect", { x: x + i * (size + gap), y, width: size, height: 30, rx: 2, fill: col }, parent));
  const inTiles = tiles(gDit, 1577, 422, 3, C.tile);
  math(gDit, 1816, 452, [["× "], ["L", "i"]], { fill: C.ink, weight: 400, size: 38 });
  box(gDit, 1402, 462, 476, 492, 48, C.ditF, C.ditBox, 4);
  const ditRows = [[482, 57, "Block-Causal Self-Attention"], [573, 57, "Camera Modulation"], [808, 52, "Cross-Attention Block"], [895, 42, "FFN Block"]].map(([y, h, name]) => {
    const r = box(gDit, 1433, y, 413, h, 9, "#fff", C.dit, 3.5);
    label(gDit, 1640, y + h / 2 + 11, name, { size: 31, fill: C.ink });
    return r;
  });
  for (const [y1, y2] of [[439, 482], [539, 573], [630, 665], [773, 808], [860, 895], [937, 980]]) arrow(gDit, `M1642 ${y1}V${y2}`, "ink", 3.5);
  const outTiles = tiles(gDit, 1579, 989, 3, C.tile);
  label(gDit, 1642, 1048, "Video Latent", { fill: C.blueT, weight: 700, size: 34 });
  tiles(gDit, 1901, 817, 3, C.purpleF, 26, 4);
  arrow(gDit, "M1893 832H1852", "purple", 3.5);
  label(gDit, 1946, 884, "Text", { fill: C.purple, weight: 700, size: 33 });
  const gateBox = box(gGate, 1433, 665, 413, 108, 16, C.orangeF, C.orangeG, 4);
  const gateGlow = el("rect", { x: 1427, y: 659, width: 425, height: 120, rx: 20, fill: "none", stroke: C.orange, "stroke-width": 9, opacity: 0 }, gGate);
  label(gGate, 1640, 706, "Gated Memory Residual", { weight: 700, size: 34, fill: C.ink });
  const gatePlate = el("rect", { x: 1448, y: 719, width: 383, height: 44, rx: 12, fill: C.orange, opacity: 0 }, gGate);
  math(gGate, 1640, 753, [["h"], ["b", "s"], [" ← h"], ["b", "s"], [" + γ ⊙ W"], ["out", "S"], ["m"], ["b", "s"]], { fill: C.orange, size: 35 });
  arrow(gOA, "M1170 954H1375V721H1426", "orange", 4);

  // ---------- moving chips ----------
  const chipG = group();
  const mkChip = (col, w = 22) => {
    const g = group(chipG);
    el("rect", { x: -w / 2, y: -w / 2, width: w, height: w, rx: 5, fill: col, stroke: "#fff", "stroke-width": 2.5 }, g);
    g.setAttribute("opacity", 0);
    return g;
  };
  const R = {
    pi: route([[339, 268], [339, 340], [280, 420], [160, 500], [110, 550], [110, 577], [225, 577], [330, 577], [452, 577]]),
    h: route([[339, 268], [339, 340], [280, 420], [160, 500], [110, 560], [110, 719], [225, 719], [330, 719], [452, 719]]),
    upd: route([[886, 636], [940, 636], [1000, 636]]),
    read: route([[120, 948], [225, 948], [330, 948], [450, 948], [530, 948]]),
    mem: route([[1078, 740], [1078, 866]]),
    inj: route([[1172, 954], [1375, 954], [1375, 721], [1426, 721], [1520, 721]]),
    txt: route([[1932, 832], [1866, 832]]),
  };
  const chip = {
    pi: [mkChip("#8aa593"), mkChip("#8aa593", 18)], h: [mkChip("#8aa593"), mkChip("#8aa593", 18)],
    upd: [mkChip(C.green), mkChip(C.green, 18)], read: [mkChip(C.orange), mkChip(C.orange, 18)],
    mem: [mkChip(C.green), mkChip(C.green, 18)], inj: [mkChip(C.orange), mkChip(C.orange, 18), mkChip(C.orange, 14)], txt: [mkChip(C.purple, 18)],
  };
  // write chips turn into the key (blue) / value (green) once they leave their encoder
  const afterEncoder = { pi: C.blue, h: C.green };
  function flow(name, u, recolorAt) {
    chip[name].forEach((g, k) => {
      const t = u * 1.35 - k * 0.15;
      if (u <= 0 || t <= 0 || t >= 1) { g.setAttribute("opacity", 0); return; }
      const [x, y] = R[name].at(ease(t));
      g.setAttribute("transform", `translate(${x} ${y})`);
      g.setAttribute("opacity", Math.min(1, t * 9, (1 - t) * 9));
      if (recolorAt) g.firstChild.setAttribute("fill", t > recolorAt ? afterEncoder[name] : "#8aa593");
    });
  }
  const latent = group(chipG);
  for (let i = 0; i < 3; i++) el("rect", { x: -63 + i * 44, y: -15, width: 38, height: 30, rx: 3, fill: C.tile, stroke: "#6f9cbf", "stroke-width": 2.5 }, latent);
  latent.setAttribute("opacity", 0);

  // ---------- phase script ----------
  const PHASES = [
    { kind: "gen", pill: "Context", title: "A bounded context and a block waiting to be generated.",
      desc: "The sink and the K most recent clean blocks condition the noisy target. Anything older is evicted once it leaves the window.",
      tex: String.raw`p_\theta(\mathbf{x}_b\mid C_b,\ \mathcal{M}_b,\ \mathcal{T}_{1:b},\ c_I,\ c)` },
    { kind: "write", pill: "Write", title: "Evict, then consolidate by recursive least squares.",
      desc: "The evicted block's raymap and clean hidden state become a key–value pair. The whitening step folds in only what the memory does not already hold.",
      tex: String.raw`\mathbf{g}=\tfrac{\mathbf{P}\boldsymbol{\phi}}{w^{-1}+\boldsymbol{\phi}^{\top}\mathbf{P}\boldsymbol{\phi}},\quad \mathbf{W}_2\leftarrow\mathbf{W}_2+(\mathbf{v}-\mathbf{W}_2\boldsymbol{\phi})\,\mathbf{g}^{\top},\quad \mathbf{P}\leftarrow\mathbf{P}-\mathbf{g}\boldsymbol{\phi}^{\top}\mathbf{P}` },
    { kind: "read", pill: "Read", title: "Revisit the viewpoint, read by pose alone.",
      desc: "The camera returns to the pose of an evicted block. The pose key alone queries the fast weights, and the stored scene feature comes back.",
      tex: String.raw`\mathbf{m}_b=\mathbf{W}_2\,\mathrm{gelu}(\mathbf{W}_1\mathbf{k}_b)` },
    { kind: "inject", pill: "Inject", title: "Inject through a gated residual.",
      desc: "The retrieved feature enters each DiT block, so the target block regenerates what was seen at this viewpoint instead of resynthesizing it.",
      tex: String.raw`\mathbf{h}_b\leftarrow\mathbf{h}_b+\boldsymbol{\gamma}\odot\mathbf{W}_{\text{out}}\,\mathbf{m}_b` },
  ];

  // How strongly each part of the figure is shown in each phase; the rest stays visible, just quieter.
  const FOCUS = {
    ctx: [1, .5, .45, .45], ev: [.6, 1, .4, .4], cur: [1, .5, .45, 1],
    cam: [.45, .4, 1, .4],
    wr: [.4, 1, .55, .4], mem: [.4, 1, 1, .5],
    rd: [.4, .4, 1, .5], ret: [.4, .4, 1, 1], ma: [.4, .4, 1, .5],
    dit: [.4, .4, .4, 1], gate: [.4, .4, .4, 1], oa: [.4, .4, .5, 1],
  };
  const GROUPS = { ctx: gCtx, ev: gEv, cur: gCur, cam: gCam, wr: gWrite, mem: gMem, rd: gRead, ret: gRet, ma: gMemArrow, dit: gDit, gate: gGate, oa: gOA };
  const highlight = (plate, v, a = .16) => plate.setAttribute("opacity", v * a);
  const ROW_MID = [510, 601, 834, 916];

  function render(tAbs) {
    const ph = Math.floor(tAbs) % 4, p = tAbs - Math.floor(tAbs), prev = (ph + 3) % 4;
    const blend = ease(seg(p, 0, .2));
    for (const k in GROUPS) GROUPS[k].setAttribute("opacity", lerp(FOCUS[k][prev], FOCUS[k][ph], blend));
    // soft cross-fade when the loop wraps
    scene.setAttribute("opacity", ph === 3 ? 1 - ease(seg(p, .94, 1)) * .8 : ph === 0 ? .2 + ease(seg(p, 0, .08)) * .8 : 1);

    // (a) context: a ripple of attention runs over the conditioning blocks, then the target
    glows.forEach((g, i) => g.setAttribute("opacity", ph === 0 ? bump(p, .06 + i * .13, .3 + i * .13) * .45 : 0));
    evGlow.setAttribute("opacity", ph === 1 ? bump(p, 0, .3) * .5 : ph === 0 ? seg(p, .8, 1) * .25 : 0);
    // noise on the target shimmers until the DiT generates it
    const level = ph === 3 ? 1 - ease(seg(p, .45, .95)) : 1;
    noise.forEach((n, i) => n.e.setAttribute("opacity", level * n.k * (.55 + .45 * Math.sin(tAbs * 5 + i * 1.7))));

    // (b) write
    flow("pi", ph === 1 ? seg(p, .1, .5) : 0, .58);
    flow("h", ph === 1 ? seg(p, .13, .53) : 0, .58);
    phiKw.setAttribute("stroke-width", 4 + 5 * (ph === 1 ? bump(p, .3, .52) : 0));
    phiVw.setAttribute("stroke-width", 4 + 5 * (ph === 1 ? bump(p, .32, .54) : 0));
    highlight(eqPlate[0], ph === 1 ? bump(p, .48, .66) : 0);
    highlight(eqPlate[1], ph === 1 ? bump(p, .6, .78) : 0);
    highlight(eqPlate[2], ph === 1 ? bump(p, .72, .9) : 0);
    flow("upd", ph === 1 ? seg(p, .8, .97) : 0);
    flashW.setAttribute("opacity", ph === 1 ? bump(p, .88, 1) * .45 : 0);
    flashP.setAttribute("opacity", ph === 1 ? bump(p, .9, 1) * .45 : 0);

    // (a) the camera returns to the pose of e_j
    const move = ph === 2 ? ease(seg(p, 0, .42)) : ph === 3 ? 1 : 0;
    const [bx, by] = onEllipse(lerp(78, 163, move));
    place(bCam, [bx - 6 * move, by + 14 * move], lerp(-30, 52, move));
    bCam.setAttribute("opacity", ph >= 2 ? 1 : 0);
    ring.setAttribute("opacity", ph === 2 ? ease(seg(p, .38, .55)) * (.6 + .4 * Math.sin(tAbs * 9)) : ph === 3 ? .6 : 0);
    revPi.setAttribute("opacity", ph === 2 ? .65 + .35 * ease(seg(p, .35, .5)) : 1);

    // (b) read
    flow("read", ph === 2 ? seg(p, .4, .68) : 0);
    phiKr.setAttribute("stroke-width", 4 + 5 * (ph === 2 ? bump(p, .5, .66) : 0));
    piB.setAttribute("opacity", ph === 2 ? .6 + .4 * bump(p, .32, .5) : 1);
    flow("mem", ph === 2 ? seg(p, .5, .72) : 0);
    highlight(retPlate[0], ph === 2 ? bump(p, .68, .84) : 0, .17);
    highlight(retPlate[1], ph === 2 ? bump(p, .8, .97) : 0, .17);

    // (c) inject
    flow("inj", ph === 3 ? seg(p, .02, .32) : 0);
    const gate = ph === 3 ? ease(seg(p, .26, .4)) : 0;
    gateGlow.setAttribute("opacity", gate * .4 + (ph === 3 ? bump(p, .26, .6) * .2 : 0));
    gateBox.setAttribute("fill", mixHex(C.orangeF, "#f4dcc2", gate));
    gatePlate.setAttribute("opacity", gate * .14);
    // latent tiles travel down the stack; each row lights up as they pass
    const lp = ph === 3 ? seg(p, .3, .86) : 0;
    const ly = lerp(440, 985, lp);
    latent.setAttribute("transform", `translate(1640 ${ly})`);
    latent.setAttribute("opacity", lp > 0 && lp < 1 ? Math.min(1, lp * 12, (1 - lp) * 12) : 0);
    ditRows.forEach((r, i) => {
      const near = lp > 0 && lp < 1 ? clamp(1 - Math.abs(ly - ROW_MID[i]) / 55) : 0;
      r.setAttribute("stroke", mixHex(C.dit, C.ink, near * .7));
      r.setAttribute("stroke-width", 3.5 + near * 3);
    });
    flow("txt", ph === 3 ? seg(p, .58, .78) : 0);
    const outPulse = ph === 3 ? bump(p, .84, 1) : 0;
    outTiles.forEach((tl) => tl.setAttribute("fill", mixHex(C.tile, "#8fbad8", outPulse)));
    inTiles.forEach((tl) => tl.setAttribute("fill", mixHex(C.tile, "#8fbad8", ph === 3 ? bump(p, .26, .42) : 0)));
  }

  // ---------- captions, controls, clock ----------
  const pill = $("#ttt-pill"), title = $("#ttt-title"), desc = $("#ttt-desc"), eq = $("#ttt-eq");
  const steps = [...root.querySelectorAll(".ttt-steps button")];
  const bars = [...root.querySelectorAll(".ttt-bar i")];
  const playBtn = $("#ttt-play"), speedSel = $("#ttt-speed");
  let shownPhase = -1;
  function setCaption(ph) {
    if (ph === shownPhase) return;
    shownPhase = ph;
    const P = PHASES[ph];
    pill.textContent = P.pill; pill.dataset.kind = P.kind;
    title.textContent = P.title; desc.textContent = " " + P.desc;
    steps.forEach((b, k) => b.setAttribute("aria-pressed", String(k === ph)));
    renderEq();
  }
  function renderEq() {
    const P = PHASES[Math.max(0, shownPhase)];
    if (window.katex) window.katex.render(P.tex, eq, { throwOnError: false, displayMode: false, output: "html" });
    else eq.textContent = "";
  }
  function draw() {
    render(t);
    setCaption(Math.floor(t) % 4);
    bars.forEach((b, k) => { b.style.backgroundSize = (t >= k + 1 ? 100 : t >= k ? (t - k) * 100 : 0) + "% 100%"; });
  }

  const PHASE_MS = 5200;
  let t = 0.1, playing = true, inView = false, last = 0, raf = 0, speed = 1;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { playing = false; t = 2.9; }
  const running = () => playing && inView && !document.hidden;
  function frame(ts) {
    if (!running()) { raf = 0; return; }
    if (!last) last = ts;
    const dt = clamp(ts - last, 0, 64); last = ts; // the frame timestamp can precede the click that restarted us
    t = (t + dt / (PHASE_MS / speed)) % 4;
    draw();
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    playBtn.textContent = playing ? "Pause" : "Play";
    playBtn.setAttribute("aria-pressed", String(!playing));
    if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); }
  }
  function jump(k) { playing = false; t = k + .9; draw(); kick(); }

  playBtn.addEventListener("click", () => { playing = !playing; kick(); });
  $("#ttt-step").addEventListener("click", () => jump((Math.floor(t) + 1) % 4));
  $("#ttt-restart").addEventListener("click", () => { t = 0; playing = true; draw(); kick(); });
  steps.forEach((b, k) => b.addEventListener("click", () => jump(k)));
  speedSel.addEventListener("change", () => { speed = Number(speedSel.value); });

  // only run while visible (the panel is hidden until its stage card is selected)
  new IntersectionObserver((entries) => { inView = entries.some((e) => e.isIntersecting); kick(); }, { threshold: .25 }).observe(root);
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("load", renderEq);

  draw();
  root.__setTime = (v) => { playing = false; t = v; draw(); kick(); }; // lets tests pin a frame
})();
