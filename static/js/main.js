// World-T3 project page interactions.

// ---- Scene data --------------------------------------------------------
const REVISIT_CASES = ["case1", "case2", "case3", "case4"];
const LONG_SCENES = ["s01", "s02", "s03", "s04", "s05", "s06"];
const LONG_SLOTS = ["left", "center", "right"]; // Ours, DreamX-AR, SANA-WM

const fmt = (t) => {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// ---- Generic tab group -------------------------------------------------
function bindTabs(name, onSelect) {
  const group = document.querySelector(`[data-tabs="${name}"]`);
  if (!group) return;
  group.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab || tab.classList.contains("active")) return;
    group.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t === tab);
      t.setAttribute("aria-selected", t === tab);
    });
    onSelect(Number(tab.dataset.index));
  });
}

// ---- 10 s revisit videos (single stitched video) -------------------------
function initRevisit() {
  const video = document.getElementById("revisit-video");
  if (!video) return;
  bindTabs("revisit", (i) => {
    const id = REVISIT_CASES[i];
    const wasPlaying = !video.paused;
    video.poster = `static/videos/revisit/${id}.jpg`;
    video.src = `static/videos/revisit/${id}.mp4`;
    if (wasPlaying) video.play().catch(() => {});
  });
}

// ---- 30 s synchronized 3-up player ---------------------------------------
function initLongRollouts() {
  const grid = document.getElementById("long-grid");
  const controls = document.getElementById("long-controls");
  if (!grid || !controls) return;

  const videos = LONG_SLOTS.map((slot) => grid.querySelector(`video[data-slot="${slot}"]`));
  const master = videos[0];
  const btn = controls.querySelector('[data-action="toggle"]');
  const scrubber = controls.querySelector(".scrubber");
  const timeEl = controls.querySelector(".time");
  const speedEl = controls.querySelector(".speed");
  let scrubbing = false;

  const load = (sceneId) => {
    videos.forEach((v, i) => {
      v.pause();
      v.poster = `static/videos/long/${sceneId}-${LONG_SLOTS[i]}.jpg`;
      v.src = `static/videos/long/${sceneId}-${LONG_SLOTS[i]}.mp4`;
      v.playbackRate = Number(speedEl.value);
    });
    btn.classList.remove("playing");
    scrubber.value = 0;
    updateTime();
  };

  const isPlaying = () => !master.paused && !master.ended;
  const play = () => {
    videos.forEach((v) => { v.currentTime = master.currentTime; });
    Promise.all(videos.map((v) => v.play().catch(() => {})));
    btn.classList.add("playing");
  };
  const pause = () => {
    videos.forEach((v) => v.pause());
    btn.classList.remove("playing");
  };
  const toggle = () => (isPlaying() ? pause() : play());

  function updateTime() {
    const d = master.duration || 0;
    timeEl.textContent = `${fmt(master.currentTime)} / ${fmt(d)}`;
    if (!scrubbing && d) scrubber.value = Math.round((master.currentTime / d) * 1000);
  }

  // Keep followers within ~2 frames of the master.
  master.addEventListener("timeupdate", () => {
    updateTime();
    if (!isPlaying()) return;
    for (const v of videos.slice(1)) {
      if (Math.abs(v.currentTime - master.currentTime) > 0.12) v.currentTime = master.currentTime;
    }
  });
  master.addEventListener("loadedmetadata", updateTime);
  master.addEventListener("ended", () => {
    // Loop all three together.
    videos.forEach((v) => { v.currentTime = 0; });
    play();
  });

  btn.addEventListener("click", toggle);
  videos.forEach((v) => v.addEventListener("click", toggle));

  scrubber.addEventListener("input", () => {
    scrubbing = true;
    const t = (scrubber.value / 1000) * (master.duration || 0);
    videos.forEach((v) => { v.currentTime = t; });
    timeEl.textContent = `${fmt(t)} / ${fmt(master.duration)}`;
  });
  scrubber.addEventListener("change", () => { scrubbing = false; });

  speedEl.addEventListener("change", () => {
    videos.forEach((v) => { v.playbackRate = Number(speedEl.value); });
  });

  bindTabs("long", (i) => load(LONG_SCENES[i]));
  load(LONG_SCENES[0]);
}

// ---- Method stage cards (tabs controlling one figure panel) --------------
function initStages() {
  const tabs = [...document.querySelectorAll('.stages [role="tab"]')];
  if (!tabs.length) return;

  const select = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });
}

// ---- BibTeX copy -------------------------------------------------------
function initCopy() {
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = document.querySelector(btn.dataset.copy)?.innerText ?? "";
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Press ⌘C";
      }
      setTimeout(() => { btn.textContent = "Copy"; }, 1500);
    });
  });
}

// ---- Math --------------------------------------------------------------
function initMath() {
  if (typeof renderMathInElement !== "function") return;
  renderMathInElement(document.body, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\(", right: "\\)", display: false },
    ],
    ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    throwOnError: false,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initRevisit();
  initLongRollouts();
  initStages();
  initCopy();
});
// KaTeX scripts are deferred too; render once everything has loaded.
window.addEventListener("load", initMath);
