# VN Reader — web app

A visual-novel style EPUB reader for the browser, meant to replace the Expo app
([my-vn-reader-app](https://github.com/reyesvictor/my-vn-reader-app), private). Sentence by sentence, with a
typewriter effect, sounds, auto mode, bionic reading and RSVP. Made for phone use (Pixel 7a, Firefox / Chrome) and
installable as a PWA.

Live: https://reyesvictor.github.io/my-vn-reader-web-app/

## Status
- `spike/` is a feasibility test page (sound vs. music apps, wake lock, word lookup via text selection,
  fullscreen, opening EPUBs locally). Results decide the switch from Expo to web.
- The app itself comes next (root `index.html`).

## Principles
- **No build, no npm dependencies.** Plain HTML/CSS/JS (ES modules) served as static files. Third-party code,
  if ever needed, is vendored as a single `.js` file under `vendor/`.
- Books never leave the device: EPUBs are unzipped in the browser (`DecompressionStream`) and stored in IndexedDB.

## Run locally
```bash
python3 -m http.server 8765
```
Then open http://localhost:8765/spike/. Wake lock, service worker and clipboard need a secure context:
`localhost` counts as one, but a LAN IP does not. On the phone, use the GitHub Pages URL.

## Deploy
GitHub Pages serves the `main` branch root (Settings → Pages → Deploy from a branch → `main` / root).
