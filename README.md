# World-T³ project page

Static site for *World-T³: Test-Time Training as Persistent Memory for Real-Time Video World Models*.
No build step: GitHub Pages serves `index.html` directly.

## Layout

```
index.html              page content
static/css/style.css    styles (light + dark mode)
static/js/main.js       tabs, synced 3-up player, BibTeX copy, KaTeX
static/images/          figures rendered from the paper PDFs (WebP)
static/videos/revisit/  10 s out-and-back, 6 methods stitched 2×3 (case1–4)
static/videos/long/     30 s rollouts, Ours / DreamX-AR / SANA-WM (s01–s06 × left/center/right)
asset/                  Overleaf source + PDF (git-ignored, not published)
```

## Preview locally

```
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

Push to GitHub, then Settings → Pages → Deploy from branch → `main` / root.
