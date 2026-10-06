// Stage 3 walkthrough: dual-teacher few-step distillation, drawn in the same visual language as the Stage 2 figure
// (orange = the student / target, blue = bidirectional teacher, green = memory-augmented teacher).
// Coordinates are in a 2000 x 1060 space.
(() => {
  "use strict";
  const root = document.getElementById("dmd-anim");
  if (!root || !window.AnimKit) return;
  const { seg, ease, lerp, bump, mixHex, route } = window.AnimKit;
  const svg = root.querySelector(".anim-svg");

  const C = {
    ink: "#25313c", grey: "#7d8a94", muted: "#5d6c7b", line: "#dee4e6",
    blue: "#537d95", blueT: "#4d7a97", blueF: "#e8eff5", blueP: "#f4f8fb", tile: "#bed7e9",
    green: "#63836a", greenF: "#ecf3ed", greenP: "#f5f8f5", greenIn: "#b4c5b7", tileG: "#cfe0d3",
    orange: "#b87c4b", orangeF: "#f8ecdf",
    neutral: "#8e99a5",
  };
  const S = window.AnimKit.scene(svg, { prefix: "dmd", ink: C.ink, arrows: { blue: C.blue, green: C.green, orange: C.orange, ink: C.ink } });
  const { root: scene, el, group, arrow, box, label, math } = S;

  // ---- static frame: panel titles, divider, the two score panels ----
  const st = group();
  el("path", { d: "M10 300H1990", stroke: C.line, "stroke-width": 3 }, st);
  label(st, 40, 46, "(a)", { anchor: "start", size: 38, weight: 700 });
  label(st, 108, 46, "Few-Step Student Rollout", { anchor: "start", size: 38, weight: 700 });
  label(st, 40, 350, "(b)", { anchor: "start", size: 38, weight: 700 });
  label(st, 108, 350, "Dual-Teacher Distribution Matching", { anchor: "start", size: 38, weight: 700 });
  box(st, 22, 395, 928, 565, 46, C.blueP, C.blue, 3.5);
  box(st, 1050, 395, 928, 565, 46, C.greenP, C.green, 3.5);

  // ---- (a) student and its rollout ----
  const gStudent = group(), gInit = group(), gRoll = group();
  const stGlow = el("rect", { x: 34, y: 99, width: 352, height: 162, rx: 30, fill: "none", stroke: C.orange, "stroke-width": 9, opacity: 0 }, gStudent);
  const stBox = box(gStudent, 40, 105, 340, 150, 26, C.orangeF, C.orange, 4);
  label(gStudent, 210, 152, "Few-Step Student", { weight: 700, size: 34 });
  math(gStudent, 210, 194, [["G", "i"], ["θ", "s"], [" · 4 steps", ""]], { fill: C.orange, weight: 500, size: 30 });
  const steps = [0, 1, 2, 3].map((i) => box(gStudent, 137 + i * 40, 212, 26, 26, 5, "#fff", C.orange, 3.5));

  const initBox = box(gInit, 1470, 105, 490, 112, 22, "#f6f7f8", "#9aa6b1", 4, "17 12");
  label(gInit, 1715, 146, "Initialization", { weight: 700, size: 32, fill: C.muted });
  label(gInit, 1715, 182, "Consistency distillation, 50 → 4 steps", { size: 27, fill: C.muted });

  label(gRoll, 962, 100, "Student Rollout", { weight: 700, fill: C.orange });
  const BLOCKS = [[520, "1"], [718, "2"], [916, "3"], [1235, "N"]];
  const blocks = BLOCKS.map(([x, n], i) => {
    const g = group(gRoll);
    const glow = el("rect", { x: x - 6, y: 134, width: 182, height: 96, rx: 26, fill: "none", stroke: C.orange, "stroke-width": 9, opacity: 0 }, g);
    box(g, x, 140, 170, 84, 22, C.orangeF, C.orange, 4);
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      cells.push({ e: el("rect", { x: x + 32 + c * 22, y: 151 + r * 22, width: 18, height: 18, rx: 3, fill: C.orange }, g), k: 0.35 + ((r * 5 + c + i) * 37 % 65) / 100 });
    }
    math(g, x + 85, 194, [["x"], ["θ," + n, "s"]], { fill: C.orange });
    return { g, glow, cells };
  });
  label(gRoll, 1160, 190, "···", { fill: C.orange, size: 32 });
  const chain = [
    arrow(gRoll, "M382 182H514", "orange"), arrow(gRoll, "M692 182H712", "orange"),
    arrow(gRoll, "M890 182H910", "orange"), arrow(gRoll, "M1196 182H1229", "orange"),
  ];

  // ---- noised sample z_t and the bus into the four score boxes ----
  const gZt = group();
  const BUS_X = { lt: 235, lc: 705, mt: 1265, mc: 1735 };
  arrow(gZt, "M1001 226V322", "ink", 3.5);
  const ztBox = box(gZt, 930, 325, 140, 50, 25, "#fff", C.ink, 3.5);
  math(gZt, 1000, 360, [["z", "i"], ["t", "s"]], { size: 36 });
  label(gZt, 1090, 360, "add noise at random t", { anchor: "start", size: 27, fill: C.grey });
  el("path", { d: "M1000 376V500M235 500H1735", stroke: C.ink, "stroke-width": 3.5, fill: "none", "stroke-linecap": "round" }, gZt);
  for (const x of Object.values(BUS_X)) arrow(gZt, `M${x} 500V541`, "ink", 3.5);

  // ---- (b) the two teacher / critic pairs ----
  const gL = group(), gR = group(), gMem = group();
  const pair = (g, key, col, colT, fillT, hasMem) => {
    const cx = BUS_X[key], isCritic = key === "lc" || key === "mc";
    const x = cx - 190;
    const b = box(g, x, 545, 380, 120, 24, isCritic ? "#fff" : fillT, col, 4, isCritic ? "17 12" : null);
    const tx = hasMem ? (key === "mt" ? cx - 35 : cx + 25) : cx;
    label(g, tx, 592, isCritic ? "Critic" : "Teacher", { weight: 700, size: 34 });
    label(g, tx, 632, isCritic ? "fit to student samples" : key === "lt" ? "Stage 1 · frozen" : "Stage 2 · frozen", { size: isCritic ? 25 : 27, fill: colT, italic: isCritic });
    return b;
  };
  const LT = pair(gL, "lt", C.blue, C.blueT, C.blueF, false);
  const LC = pair(gL, "lc", C.blue, C.blueT, C.blueF, false);
  const MT = pair(gR, "mt", C.green, C.green, C.greenF, true);
  const MC = pair(gR, "mc", C.green, C.green, C.greenF, true);

  // memory glyphs inside the memory-augmented boxes, and the replay of the student rollout into them
  const glyph = (x) => {
    const r = box(gMem, x, 565, 52, 52, 12, "#fff", C.greenIn, 3.5);
    const f = el("rect", { x, y: 565, width: 52, height: 52, rx: 12, fill: C.green, opacity: 0 }, gMem);
    math(gMem, x + 26, 603, [["ℳ", "i"]], { fill: C.green, weight: 400, size: 38 });
    return { r, f };
  };
  const gT = glyph(1384), gC = glyph(1564);
  const replay = el("path", { d: "M1320 226V262H1500V606H1442M1500 606H1558", fill: "none", stroke: C.green, "stroke-width": 4, "stroke-dasharray": "13 10", "stroke-linecap": "round" }, gMem);
  label(gMem, 1342, 252, "replayed through memory updates", { anchor: "start", size: 24, fill: C.green, italic: true });

  // x0 predictions, difference node, gradient pill
  const outs = { L: group(gL), R: group(gR) };
  const tiles = (g, cx, fill, dashed) => [0, 1, 2].forEach((i) => el("rect", { x: cx - 72 + i * 50, y: 716, width: 44, height: 30, rx: 3, fill, stroke: dashed ? C.neutral : "none", "stroke-width": 2.5, ...(dashed ? { "stroke-dasharray": "6 4" } : {}) }, g));
  const diffNode = {};
  for (const [side, g, lcol, cxT, cxC, mid, fill] of [
    ["L", outs.L, C.blueT, 235, 705, 486, C.tile],
    ["R", outs.R, C.green, 1265, 1735, 1514, C.tileG],
  ]) {
    const col = side === "L" ? "blue" : "green";
    arrow(g, `M${cxT} 668V710`, col, 3.5); arrow(g, `M${cxC} 668V710`, col, 3.5);
    tiles(g, cxT, fill, false); tiles(g, cxC, fill, true);
    math(g, cxT, 784, [["x"], ["0", "S"], [" · teacher", ""]], { fill: lcol, weight: 500, size: 27 });
    math(g, cxC, 784, [["x"], ["0", "S"], [" · critic", ""]], { fill: lcol, weight: 500, size: 27 });
    arrow(g, `M${cxT + 74} 731H${mid - 34}`, col, 3.5); arrow(g, `M${cxC - 74} 731H${mid + 34}`, col, 3.5);
    diffNode[side] = el("circle", { cx: mid, cy: 731, r: 30, fill: "#fff", stroke: C.ink, "stroke-width": 3.5 }, g);
    label(g, mid, 745, "−", { size: 44, weight: 600 });
    arrow(g, `M${mid} 763V860`, col, 3.5);
  }
  const gPills = group();
  const pill = (x, fill, stroke, sub, textFill) => {
    const r = box(gPills, x, 862, 260, 56, 28, fill, stroke, 3.5);
    math(gPills, x + 130, 900, [["∇ℒ"], [sub, "S"]], { size: 34, fill: textFill });
    return r;
  };
  const pillL = pill(356, C.blueF, C.blue, "bidir", C.blueT), pillR = pill(1384, C.greenF, C.green, "mem", C.green);
  arrow(gPills, "M618 890H956", "blue", 3.5); arrow(gPills, "M1382 890H1044", "green", 3.5);
  const sumC = el("circle", { cx: 1000, cy: 890, r: 38, fill: "#fff", stroke: C.ink, "stroke-width": 4 }, gPills);
  label(gPills, 1000, 905, "+", { size: 46, weight: 600 });

  // ---- sum -> update the student ----
  const gUpd = group();
  const upd = arrow(gUpd, "M1000 930V1035H14V182H34", "orange", 4);
  upd.setAttribute("stroke-dasharray", "14 10");
  math(gUpd, 1024, 998, [["∇"], ["θ", "s"], ["ℒ"], ["DMD", "S"]], { anchor: "start", size: 36 });

  // panel titles go last so they sit above the lines; the right ones get a halo so the replay line passes behind them
  const gTitles = group();
  label(gTitles, 486, 437, "Bidirectional Score", { weight: 700, size: 36, fill: C.blueT });
  label(gTitles, 486, 470, "short-range realism · motion coherence", { size: 27, fill: C.grey });
  for (const [y, str, o] of [[437, "Memory-Augmented AR Score", { weight: 700, size: 36, fill: C.green }], [470, "long-horizon consistency", { size: 27, fill: C.grey }]]) {
    const t = label(gTitles, 1514, y, str, o);
    t.setAttribute("paint-order", "stroke"); t.setAttribute("stroke", C.greenP); t.setAttribute("stroke-width", 12); t.setAttribute("stroke-linejoin", "round");
  }

  // ---------- moving chips ----------
  const bus = (x) => route([[1000, 378], [1000, 500], [x, 500], [x, 541]]);
  const flow = window.AnimKit.chips(scene, el, group, {
    s0: { route: route([[382, 182], [514, 182]]), chips: [C.orange] },
    s1: { route: route([[692, 182], [712, 182]]), chips: [C.orange] },
    s2: { route: route([[890, 182], [910, 182]]), chips: [C.orange] },
    s3: { route: route([[1196, 182], [1229, 182]]), chips: [C.orange] },
    zt: { route: route([[1001, 228], [1001, 322]]), chips: [C.orange, C.orange] },
    bLT: { route: bus(BUS_X.lt), chips: [C.neutral, C.neutral] }, bLC: { route: bus(BUS_X.lc), chips: [C.neutral, C.neutral] },
    bMT: { route: bus(BUS_X.mt), chips: [C.neutral, C.neutral] }, bMC: { route: bus(BUS_X.mc), chips: [C.neutral, C.neutral] },
    rep1: { route: route([[1320, 228], [1320, 262], [1500, 262], [1500, 606], [1442, 606]]), chips: [C.green, C.green, C.green] },
    rep2: { route: route([[1320, 228], [1320, 262], [1500, 262], [1500, 606], [1558, 606]]), chips: [C.green, C.green, C.green] },
    mL1: { route: route([[309, 731], [450, 731]]), chips: [C.blue] }, mL2: { route: route([[631, 731], [522, 731]]), chips: [C.blue] },
    mR1: { route: route([[1339, 731], [1480, 731]]), chips: [C.green] }, mR2: { route: route([[1661, 731], [1548, 731]]), chips: [C.green] },
    gL: { route: route([[486, 765], [486, 858]]), chips: [C.blue, C.blue] }, gR: { route: route([[1514, 765], [1514, 858]]), chips: [C.green, C.green] },
    sL: { route: route([[620, 890], [956, 890]]), chips: [C.blue, C.blue] }, sR: { route: route([[1380, 890], [1044, 890]]), chips: [C.green, C.green] },
    up: { route: route([[1000, 934], [1000, 1035], [14, 1035], [14, 182], [34, 182]]), chips: [C.orange, C.orange, C.orange] },
  });

  // ---------- phase script ----------
  const PHASES = [
    { kind: "orange", pill: "Rollout", title: "A four-step student rolls out its own video.",
      desc: "Initialized by consistency distillation, the few-step generator denoises each block in four steps, conditioning on what it generated before.",
      tex: String.raw`\mathbf{x}_\theta=G_\theta(\boldsymbol{\epsilon})\qquad\text{(4 denoising steps)}` },
    { kind: "blue", pill: "Score", title: "Noise a student sample and ask both teachers.",
      desc: "Each teacher is paired with a critic trained on student samples. The memory-augmented pair first replays the student's rollout through its memory update schedule.",
      tex: String.raw`\mathbf{z}_t=\text{noise}(\mathbf{x}_\theta,\,t),\qquad \hat{\mathbf{x}}_{0,\text{teacher}}(\mathbf{z}_t),\ \ \hat{\mathbf{x}}_{0,\text{critic}}(\mathbf{z}_t)` },
    { kind: "green", pill: "Match", title: "Distribution matching, in two complementary ways.",
      desc: "The gap between teacher and critic predictions gives a gradient. The bidirectional pair keeps local realism and motion; the memory pair keeps long-horizon consistency.",
      tex: String.raw`\nabla_\theta\mathcal{L}_{\mathrm{DMD}}(\text{teacher},\text{critic})=-\,\mathbb{E}_{t,\mathbf{z}_t}\Big[\big(\hat{\mathbf{x}}_{0,\text{teacher}}-\hat{\mathbf{x}}_{0,\text{critic}}\big)\,\tfrac{\partial\mathbf{x}_\theta}{\partial\theta}\Big]` },
    { kind: "orange", pill: "Update", title: "Sum the two gradients and update the student.",
      desc: "Both signals update the generator together, while the critics keep adapting to its samples. The memory pair penalizes drift over the student's own long rollouts.",
      tex: String.raw`\nabla_\theta\mathcal{L}_{\mathrm{DMD}}=\nabla_\theta\mathcal{L}(\text{teacher}_{\text{bidir}},\text{critic}_{\text{bidir}})+\nabla_\theta\mathcal{L}(\text{teacher}_{\text{mem}},\text{critic}_{\text{mem}})` },
  ];

  // How strongly each part is shown in each phase; the rest stays visible, just quieter.
  const FOCUS = {
    st: [1, .5, .4, 1], init: [.7, .4, .4, .4], roll: [1, .85, .45, .6], zt: [.4, 1, .5, .4],
    L: [.4, 1, 1, .6], R: [.4, 1, 1, .6], mem: [.4, 1, .5, .5], pills: [.4, .45, 1, 1], upd: [.4, .4, .45, 1],
  };
  const GROUPS = { st: gStudent, init: gInit, roll: gRoll, zt: gZt, L: gL, R: gR, mem: gMem, pills: gPills, upd: gUpd };
  const BLOCK_AT = [.08, .28, .48, .68];

  function render(tAbs, animating) {
    const ph = Math.floor(tAbs) % 4, p = tAbs - Math.floor(tAbs), prev = (ph + 3) % 4;
    const blend = animating ? ease(seg(p, 0, .2)) : 1;
    for (const k in GROUPS) GROUPS[k].setAttribute("opacity", lerp(FOCUS[k][prev], FOCUS[k][ph], blend));
    scene.setAttribute("opacity", !animating ? 1 : ph === 3 ? 1 - ease(seg(p, .94, 1)) * .8 : ph === 0 ? .2 + ease(seg(p, 0, .08)) * .8 : 1);

    // (a) the student rolls out block by block, each denoised in four steps
    steps.forEach((s, i) => {
      const lit = ph === 0 ? bump(p, .04 + .11 * i, .24 + .11 * i) : ph === 3 ? bump(p, .6 + .04 * i, .8 + .04 * i) : 0;
      s.setAttribute("fill", mixHex("#ffffff", C.orange, lit));
    });
    stGlow.setAttribute("opacity", ph === 0 ? bump(p, 0, .2) * .4 : ph === 3 ? bump(p, .6, .92) * .5 : 0);
    stBox.setAttribute("stroke-width", 4 + 3 * (ph === 3 ? bump(p, .6, .92) : 0));
    initBox.setAttribute("stroke-width", 4 + 4 * (ph === 0 ? bump(p, 0, .25) : 0));
    blocks.forEach((b, i) => {
      const show = ph === 0 ? ease(seg(p, BLOCK_AT[i], BLOCK_AT[i] + .08)) : 1;
      const noise = ph === 0 ? 1 - ease(seg(p, BLOCK_AT[i] + .04, BLOCK_AT[i] + .22)) : 0;
      b.g.setAttribute("opacity", show);
      b.cells.forEach((c, k) => c.e.setAttribute("opacity", noise * c.k * (.55 + .45 * Math.sin(tAbs * 5 + k * 1.7))));
      b.glow.setAttribute("opacity", i === 2 && ph === 1 ? bump(p, 0, .35) * .5 : 0);
    });
    chain.forEach((c, i) => c.setAttribute("opacity", ph === 0 ? ease(seg(p, BLOCK_AT[i] - .02, BLOCK_AT[i] + .06)) : 1));
    for (let i = 0; i < 4; i++) flow("s" + i, ph === 0 ? seg(p, BLOCK_AT[i] - .06, BLOCK_AT[i] + .1) : 0);

    // z_t goes to both teacher / critic pairs; the memory pair replays the rollout first
    flow("zt", ph === 1 ? seg(p, 0, .25) : 0);
    ztBox.setAttribute("stroke-width", 3.5 + 4 * (ph === 1 ? bump(p, .22, .4) : 0));
    flow("bLT", ph === 1 ? seg(p, .3, .62) : 0); flow("bLC", ph === 1 ? seg(p, .32, .64) : 0);
    flow("bMT", ph === 1 ? seg(p, .34, .66) : 0); flow("bMC", ph === 1 ? seg(p, .36, .68) : 0);
    const arrive = ph === 1 ? bump(p, .58, .76) : 0;
    for (const b of [LT, LC, MT, MC]) b.setAttribute("stroke-width", 4 + 4 * arrive);
    flow("rep1", ph === 1 ? seg(p, .08, .55) : 0); flow("rep2", ph === 1 ? seg(p, .1, .57) : 0);
    replay.setAttribute("stroke-opacity", ph === 1 ? .55 + .45 * bump(p, .05, .6) : .55);
    const memPulse = ph === 1 ? bump(p, .52, .72) : 0;
    gT.f.setAttribute("opacity", memPulse * .4); gC.f.setAttribute("opacity", memPulse * .4);
    const outs_ = ph === 0 ? 0 : ph === 1 ? ease(seg(p, .64, .85)) : 1;
    outs.L.setAttribute("opacity", outs_); outs.R.setAttribute("opacity", outs_);

    // gradients: teacher vs critic prediction -> difference -> pill -> sum
    for (const k of ["mL1", "mL2", "mR1", "mR2"]) flow(k, ph === 2 ? seg(p, 0, .35) : 0);
    const diff = ph === 2 ? bump(p, .3, .5) : 0;
    for (const n of Object.values(diffNode)) n.setAttribute("stroke-width", 3.5 + 4 * diff);
    flow("gL", ph === 2 ? seg(p, .45, .66) : 0); flow("gR", ph === 2 ? seg(p, .45, .66) : 0);
    const pillOn = ph === 2 ? bump(p, .62, .8) : 0;
    pillL.setAttribute("fill", mixHex(C.blueF, "#cfe0ec", pillOn)); pillR.setAttribute("fill", mixHex(C.greenF, "#d3e4d7", pillOn));
    flow("sL", ph === 2 ? seg(p, .72, .95) : 0); flow("sR", ph === 2 ? seg(p, .72, .95) : 0);
    const sumOn = ph === 2 ? bump(p, .88, 1) : ph === 3 ? bump(p, 0, .2) : 0;
    sumC.setAttribute("stroke-width", 4 + 4 * sumOn);

    // update: the gradient travels back to the student; the critics keep fitting its samples
    flow("up", ph === 3 ? seg(p, .05, .62) : 0);
    const fit = ph === 3 ? bump(p, .2, .95) : 0;
    for (const c of [LC, MC]) { c.setAttribute("stroke-width", 4 + 3 * fit); c.setAttribute("stroke-dashoffset", ph === 3 ? -tAbs * 160 : 0); }
  }

  window.AnimKit.clock({ root, phases: PHASES, phaseMs: 8000, render });
})();
