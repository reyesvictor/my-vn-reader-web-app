# VN Reader — web app

A visual-novel style EPUB reader for the browser, meant to replace the Expo app
([my-vn-reader-app](https://github.com/reyesvictor/my-vn-reader-app), private). Sentence by sentence, with a
typewriter effect, sounds, auto mode, bionic reading and RSVP. Made for phone use (Pixel 7a, Firefox / Chrome) and
installable as a PWA.

Live: https://reyesvictor.github.io/my-vn-reader-web-app/

## Status
v1: library (import EPUBs, progress kept even after removing a book), sentence-by-sentence reader with typewriter,
auto mode, pause, bionic, RSVP, sounds + volume, wake lock, chapters from the real table of contents with chapter
progress, per-book settings, themes (Cyber, Dark, Light, Snow, Amber, Detective), minimal display.
`spike/` is the feasibility test page that validated the web approach on the phone (Firefox).

## Layout
```
index.html, css/app.css     app shell + themes
js/main.js                  routing (#/ library, #/read/<id> reader) + library view
js/ui/reader.js             reader engine (state machine typing → holding → next), HUD, chapters, settings sheets
js/core/zip.js              ZIP reader (native DecompressionStream)
js/core/epub.js             EPUB → sentences / headings / chapters (spine + nav/ncx TOC, #anchors) / images / notes
js/core/splitter.js         sentence splitter (abbreviations, quotes « » „ “ ” "…") — pure, tested in node
js/store/db.js, library.js  IndexedDB (meta, parsed cache, files, per-book state, kv)
js/settings.js audio.js wake.js
fonts/ sfx/ icons/ sw.js manifest.webmanifest
tests/splitter.test.js      npm test (node ≥ 18, no dependencies)
```

## Principles
- **No build, no npm dependencies.** Plain HTML/CSS/JS (ES modules) served as static files. Third-party code,
  if ever needed, is vendored as a single `.js` file under `vendor/`.
- Books never leave the device: EPUBs are unzipped in the browser (`DecompressionStream`) and stored in IndexedDB.

## Run locally
```bash
python3 -m http.server 8765
```
Then open http://localhost:8765/ (put test EPUBs in the git-ignored `data/` folder). Wake lock, service worker and clipboard need a secure context:
`localhost` counts as one, but a LAN IP does not. On the phone, use the GitHub Pages URL.

## Deploy
GitHub Pages serves the `main` branch root (Settings → Pages → Deploy from a branch → `main` / root).
