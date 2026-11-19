// Memory test: rotate / move out for 5 s, hold still for 0 / 5 / 10 s, then return along the same path.
// Three clips play in lock-step: Ours, AR + pose-retrieved KV, SANA-WM. Reuses createPlayer from main.js.
(function () {
  "use strict";
  const root = document.getElementById("pause-cmp");
  if (!root) return;
  const DIR = "static/videos/pause";
  const CELLS = [
    { k: "ours", name: "Ours", ours: true },
    { k: "kv", name: "AR + Pose-retrieved KV" },
    { k: "sana", name: "SANA-WM (strongest baseline)" },
  ];
  const MOTIONS = [["rot", "Rotation", "Rotate away", "Rotate back"], ["trans", "Translation", "Move away", "Move back"]];
  const PAUSES = [[0, "Hold 0 s"], [5, "Hold 5 s"], [10, "Hold 10 s"]];
  const OUT = 5;
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  const grid = root.querySelector(".rvc-grid");
  const controls = document.getElementById("pause-controls");
  const legs = controls.querySelector(".rvc-legs");
  const vids = CELLS.map((c) => {
    const cell = el("div", "rvc-cell" + (c.ours ? " ours" : ""));
    const v = el("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.dataset.k = c.k;
    cell.append(v, el("div", "rvc-tag" + (c.ours ? " ours" : ""), c.name));
    grid.appendChild(cell);
    return v;
  });
  const master = vids[0];
  const player = createPlayer(vids, controls);
  const S = { motion: "rot", pause: 5, started: false };

  function setActive(group, attr, value) {
    group.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset[attr] === String(value);
      t.classList.toggle("active", on); t.setAttribute("aria-selected", on);
    });
  }
  const motionTabs = root.querySelector('[data-tabs="pause-motion"]');
  const pauseTabs = root.querySelector('[data-tabs="pause-len"]');
  MOTIONS.forEach(([k, n]) => { const b = el("button", "tab", n); b.setAttribute("role", "tab"); b.dataset.motion = k; motionTabs.appendChild(b); });
  PAUSES.forEach(([k, n]) => { const b = el("button", "tab", n); b.setAttribute("role", "tab"); b.dataset.pause = String(k); pauseTabs.appendChild(b); });

  function legsFor(p) {
    const m = MOTIONS.find((x) => x[0] === S.motion);
    legs.innerHTML = "";
    [[m[2], OUT, 0, "out"], ["Hold still", p, OUT, "hold"], [m[3], OUT, OUT + p, "back"]].forEach(([n, w, t0, cls]) => {
      if (!w) return;
      const sp = el("span", cls, `<b>${n}</b><small>${t0}\u2013${t0 + w} s</small>`); sp.style.flex = String(w); legs.appendChild(sp);
    });
  }
  function load(keep) {
    const d = `${DIR}/${S.motion}_${S.pause}`;
    setActive(motionTabs, "motion", S.motion); setActive(pauseTabs, "pause", S.pause);
    legsFor(S.pause);
    player.load(CELLS.map((c) => ({ src: `${d}/${c.k}.mp4`, poster: `${d}/${c.k}.jpg` })), keep);
    phase();
  }
  motionTabs.addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t && t.dataset.motion !== S.motion) { S.motion = t.dataset.motion; load(true); } });
  pauseTabs.addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t && Number(t.dataset.pause) !== S.pause) { S.pause = Number(t.dataset.pause); load(true); } });

  // highlight the current phase under the scrubber
  function phase() {
    const t = master.currentTime, p = S.pause;
    const idx = t < OUT ? 0 : (p && t < OUT + p ? 1 : (p ? 2 : 1));  // with no hold there are only two segments
    [...legs.children].forEach((sp, i) => sp.classList.toggle("on", i === idx));
  }
  ["timeupdate", "seeking", "loadedmetadata"].forEach((ev) => master.addEventListener(ev, phase));

  // search hook: every motion x pause combination
  window.PAUSE_CASES = [];
  MOTIONS.forEach(([mk, mn]) => PAUSES.forEach(([pk, pn]) => window.PAUSE_CASES.push({
    label: `${mn}, ${pn.toLowerCase()}`,
    go: () => { S.motion = mk; S.pause = pk; load(true); document.getElementById("pause").scrollIntoView({ behavior: "smooth", block: "start" }); },
  })));

  load(false);
  // start playing the first time the section scrolls into view
  new IntersectionObserver((es, io) => {
    if (es.some((e) => e.isIntersecting) && !S.started) {
      S.started = true; io.disconnect();
      const b = controls.querySelector('[data-action="toggle"]'); if (!b.classList.contains("playing")) b.click();
    }
  }, { threshold: 0.35 }).observe(root);
})();
