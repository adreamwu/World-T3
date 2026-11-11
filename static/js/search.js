// Case search with autocomplete: jump to any demo (Revisit / Longer Generation / More Results).
(function () {
  "use strict";
  const root = document.getElementById("case-search");
  if (!root) return;
  const input = root.querySelector("input");
  const list = root.querySelector(".cs-list");
  const GAL_MANIFEST = "static/videos/gallery/manifest.json";
  const SECTIONS = [
    { key: "gallery", name: "More Results", sec: "gallery" },
    { key: "revisit", name: "Comparison with Baselines and Reference", tabs: "revisit-cmp", sec: "revisit" },
    { key: "long", name: "Longer Generation", tabs: "long-cmp", sec: "long" },
  ];

  // Built at query time: the gallery tiles are created asynchronously.
  function collect() {
    const items = [];
    SECTIONS.forEach((S) => {
      if (S.tabs) {
        document.querySelectorAll(`[data-tabs="${S.tabs}"] .tab`).forEach((t) => {
          items.push({ S, label: t.textContent.trim(), extra: "", go: () => { if (!t.classList.contains("active")) t.click(); scrollToSec(S.sec); } });
        });
      } else {
        const man = (window.__DATA && window.__DATA[GAL_MANIFEST]) || [];
        document.querySelectorAll(".gal-tile").forEach((tile) => {
          const label = (tile.getAttribute("aria-label") || "").replace(/: open full size$/, "");
          const m = man.find((x) => x.label === label) || {};
          items.push({ S, label, extra: `${m.caption || ""} ${m.domain || ""}`, go: () => flash(tile) });
        });
      }
    });
    return items;
  }

  function scrollToSec(id) {
    const e = document.getElementById(id);
    if (e) e.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function flash(tile) {
    tile.scrollIntoView({ behavior: "smooth", block: "center" });
    tile.classList.remove("cs-flash"); void tile.offsetWidth; tile.classList.add("cs-flash");
    setTimeout(() => tile.classList.remove("cs-flash"), 2200);
  }

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function hl(label, toks) {
    const low = label.toLowerCase(); const mark = new Array(label.length).fill(false);
    toks.forEach((t) => { let i = low.indexOf(t); while (i >= 0 && t) { for (let k = i; k < i + t.length; k++) mark[k] = true; i = low.indexOf(t, i + t.length); } });
    let out = "", open = false;
    for (let i = 0; i < label.length; i++) {
      if (mark[i] && !open) { out += "<mark>"; open = true; }
      if (!mark[i] && open) { out += "</mark>"; open = false; }
      out += esc(label[i]);
    }
    return out + (open ? "</mark>" : "");
  }

  let shown = [], active = -1;
  function render() {
    const q = input.value.trim().toLowerCase();
    const toks = q.split(/\s+/).filter(Boolean);
    let items = collect().map((it) => {
      const lab = it.label.toLowerCase(), hay = `${lab} ${it.S.name.toLowerCase()} ${it.extra.toLowerCase()}`;
      if (!toks.every((t) => hay.includes(t))) return null;
      const score = !toks.length ? 0 : lab.startsWith(toks[0]) ? 0 : lab.includes(toks[0]) ? 1 : toks.every((t) => lab.includes(t)) ? 2 : 3;
      return { it, score };
    }).filter(Boolean);
    if (toks.length) items.sort((a, b) => a.score - b.score);
    shown = items.map((x) => x.it);
    if (!shown.length) { list.innerHTML = `<li class="cs-empty">No matching case</li>`; active = -1; list.hidden = false; return; }
    let html = "", last = null;
    shown.forEach((it, i) => {
      if (!toks.length && it.S !== last) { html += `<li class="cs-group" role="presentation">${esc(it.S.name)}</li>`; last = it.S; }
      html += `<li role="option" class="cs-item" data-i="${i}"><span class="cs-label">${hl(it.label, toks)}</span>${toks.length ? `<span class="cs-sec">${esc(it.S.name)}</span>` : ""}</li>`;
    });
    list.innerHTML = html; active = toks.length ? 0 : -1; paint(); list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function paint() {
    list.querySelectorAll(".cs-item").forEach((li) => li.classList.toggle("on", Number(li.dataset.i) === active));
    const on = list.querySelector(".cs-item.on"); if (on) on.scrollIntoView({ block: "nearest" });
  }
  function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; }
  function pick(i) { const it = shown[i]; if (!it) return; input.value = it.label; close(); input.blur(); it.go(); }

  input.addEventListener("focus", render);
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) render(); active = (active + 1) % Math.max(shown.length, 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + shown.length) % Math.max(shown.length, 1); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); pick(active >= 0 ? active : 0); }
    else if (e.key === "Escape") { close(); }
  });
  list.addEventListener("mousedown", (e) => { const li = e.target.closest(".cs-item"); if (li) { e.preventDefault(); pick(Number(li.dataset.i)); } });
  document.addEventListener("mousedown", (e) => { if (!root.contains(e.target)) close(); });
  // "/" focuses the search (unless typing somewhere)
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
  });
})();
