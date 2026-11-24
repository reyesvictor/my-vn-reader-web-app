# VN Reader (web) — instructions for Claude

Personal project of a single user (the owner), who reads mostly French EPUBs on a **Pixel 7a in Firefox**
(no Chrome). Deployed by GitHub Pages from `main` root: https://reyesvictor.github.io/my-vn-reader-web-app/

## Where things are
- Roadmap + lab notebook live in the **private** sibling repo: `../my-vn-reader-app/docs/PLAN.md` and
  `../my-vn-reader-app/docs/NOTEBOOK.md`. Update item statuses there when you finish something (#numbers = the
  owner's original list) and commit + push that repo too. Don't copy personal notes into this public repo.
- Reference books: `data/*.epub` (git-ignored, copyrighted — never commit). Originals in `../my-vn-reader-app/data/epubs/`.
- Code layout: see README.md.

## Rules
- No build step, no npm dependencies. Plain ES modules. `package.json` only exists for `npm test`.
- Run `npm test` (splitter) after touching `js/core/splitter.js`. After touching the parser, check the 3 books in
  the browser (sentence/chapter counts in NOTEBOOK.md "Web v1 built") — import with a DataTransfer on the file input.
- Preview: from the private repo, the `web-app` launch config serves this folder on http://localhost:8765.
- Bump `PARSER_VERSION` (js/core/epub.js) when parsing output changes. Cached books then get re-parsed.
- Bump `CACHE` in `sw.js` and add new files to `SHELL` when adding app files.
- Never lose the owner's data: IndexedDB `state` store (progress, settings, notes) survives book removal; migrate, never wipe.
- Commit + push at each step (conventional commits, mention item numbers). End commits with the attribution line.
- Owner defaults: 25 cps, Courier Prime 24px, line height 1.5, left aligned, UI in Monocraft.
- Firefox Android has no `navigator.vibrate`. Never `await AudioContext.resume()` before changing state.
