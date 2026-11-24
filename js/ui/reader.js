// Reader screen. The sentence engine is an explicit state machine:
//   typing ──(all chars shown / tap)──▶ holding ──(auto delay)──▶ next sentence
// Pause freezes the current phase and resume continues it (fixes the Expo bugs #3 #13 #15 #22 #24 #29).
import * as audio from '../audio.js';
import { keepAwake } from '../wake.js';
import { saveState, saveDefaults } from '../store/library.js';
import { flushAll } from '../store/db.js';
import { FONTS, THEMES, SOUNDS } from '../settings.js';

const $ = s => document.querySelector(s);
const textEl = $('#text'), boxEl = $('#textBox'), readerEl = $('#reader');

let book = null;      // { id, parsed, state }
let S = null;         // settings of the current book (#28)
const R = { idx: 0, chars: [], shown: 0, phase: 'idle', paused: false, timer: null, holdLeft: 0, holdStart: 0, words: [], wi: 0, nonSpace: 0 };
let onExit = () => {};

// ---------------------------------------------------------------- public
export function openReader(b, { exit }) {
  book = b; S = b.state.settings; onExit = exit;
  R.paused = false; readerEl.classList.remove('paused');
  applySettings();
  show(Math.min(b.state.index || 0, b.parsed.sentences.length - 1), { instant: true });
}
export function closeReader() { closeSheets(); clear(); R.phase = 'idle'; keepAwake(false); persist(); flushAll(); book = null; }

// ---------------------------------------------------------------- engine
const sentences = () => book.parsed.sentences;
function clear() { clearTimeout(R.timer); R.timer = null; }

function show(i, { instant = false } = {}) {
  clear();
  R.idx = Math.max(0, Math.min(i, sentences().length - 1));
  const text = sentences()[R.idx] || '';
  const heading = book.parsed.headings.includes(R.idx);
  textEl.className = heading ? 'heading' : '';
  boxEl.scrollTop = 0;
  updateHud();
  persist();
  if (S.rsvp && !heading && !instant) {
    textEl.classList.add('rsvp');
    R.words = text.split(/\s+/).filter(Boolean); R.wi = 0; R.phase = 'typing';
    if (!R.paused) rsvpTick();
    return;
  }
  build(text, heading);
  if (instant || !S.typewriter || S.rsvp) return finishTyping();
  R.phase = 'typing';
  if (!R.paused) tick();
}

function build(text, heading) {
  textEl.textContent = '';
  R.chars = []; R.shown = 0; R.nonSpace = 0;
  const frag = document.createDocumentFragment();
  for (const part of text.split(/(\s+)/)) {
    const boldN = S.bionic && !heading && /\S/.test(part) ? Math.ceil(part.length / 2) : 0;
    let i = 0;
    for (const ch of part) {
      const el = document.createElement(i++ < boldN ? 'b' : 'span');
      el.textContent = ch; el.className = 'h';
      frag.appendChild(el); R.chars.push(el);
    }
  }
  textEl.appendChild(frag);
}

function tick() {
  if (R.paused || R.phase !== 'typing') return;
  if (R.shown >= R.chars.length) return finishTyping();
  const el = R.chars[R.shown++];
  el.className = '';
  if (/\S/.test(el.textContent) && ++R.nonSpace % S.blipEvery === 0) audio.blip(S.sound);
  if (R.shown % 10 === 0) followCursor(el);
  R.timer = setTimeout(tick, 1000 / S.cps);
}

function followCursor(el) {        // long sentences: keep the line being typed visible (#21)
  const bottom = el.offsetTop + el.offsetHeight - boxEl.scrollTop;
  if (bottom > boxEl.clientHeight - 8) boxEl.scrollTop += bottom - boxEl.clientHeight + 40;
}

function rsvpTick() {
  if (R.paused || R.phase !== 'typing') return;
  if (R.wi >= R.words.length) { textEl.classList.remove('rsvp'); build(sentences()[R.idx], false); return finishTyping(); }
  const w = R.words[R.wi++];
  const p = w.length <= 1 ? 0 : Math.floor((w.length - 1) / 2.5) + (w.length > 5 ? 1 : 0);
  textEl.innerHTML = '';
  textEl.append(w.slice(0, p)); const o = document.createElement('span'); o.className = 'orp'; o.textContent = w[p] || ''; textEl.append(o, w.slice(p + 1));
  audio.blip(S.sound);
  const pause = /[.!?…:;]$/.test(w) ? 2 : /,$/.test(w) ? 1.5 : 1;
  R.timer = setTimeout(rsvpTick, 60000 / S.wpm * pause);
}

function finishTyping() {
  clear();
  if (R.phase === 'typing' && S.rsvp && R.wi < R.words.length) { R.wi = R.words.length; return rsvpTick(); }
  R.chars.forEach(c => { c.className = ''; });
  R.shown = R.chars.length;
  R.phase = 'holding';
  R.holdLeft = S.autoBase + (S.rsvp ? 0 : sentences()[R.idx].length * S.autoPerChar);
  hold();
}

function hold() {
  clear();
  if (!S.auto || R.paused || R.phase !== 'holding') return;
  R.holdStart = performance.now();
  R.timer = setTimeout(() => next(true), R.holdLeft);
}

function next(auto = false) {
  if (R.idx >= sentences().length - 1) { R.phase = 'done'; return; }
  audio.next(auto ? 'off' : S.sound);
  show(R.idx + 1);
}

function setPaused(p) {
  if (p === R.paused) return;
  if (p && R.phase === 'holding' && R.timer) R.holdLeft = Math.max(400, R.holdLeft - (performance.now() - R.holdStart));
  R.paused = p; clear();
  readerEl.classList.toggle('paused', p);
  updateWake();
  if (!p) {
    if (R.phase === 'typing') (S.rsvp && R.words.length && textEl.classList.contains('rsvp') ? rsvpTick : tick)();
    else if (R.phase === 'holding') hold();
  }
}

function updateWake() { keepAwake(!!book && S.keepAwake && (S.auto || S.rsvp) && !R.paused); }
function persist() { if (book) saveState(book.id, { ...book.state, index: R.idx, settings: S }); }

// ---------------------------------------------------------------- input
// Long-press selects a word (Android's menu then offers the french / english apps, #4). A selection must never
// turn the page: neither the long-press itself nor the tap that dismisses the selection afterwards.
let selAtDown = false;
$('#stage').addEventListener('pointerdown', () => { selAtDown = !getSelection().isCollapsed; });
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (book && !R.paused && !sel.isCollapsed && textEl.contains(sel.anchorNode)) setPaused(true);   // auto mode waits
});
$('#stage').addEventListener('click', e => {
  if (!book) return;
  if (selAtDown || !getSelection().isCollapsed) { selAtDown = false; return; }
  audio.unlock();
  const x = e.clientX / window.innerWidth;
  if (x > 0.7) { if (R.phase === 'typing') finishTyping(); else { setPaused(false); next(); } }
  else if (x < 0.3) { setPaused(false); show(R.idx - 1, { instant: true }); }
  else setPaused(!R.paused);
});
document.addEventListener('keydown', e => {
  if (!book || !$('#sheetBg').hidden) return;                // typing in a sheet (notes) must not turn pages
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); $('#stage').dispatchEvent(new MouseEvent('click', { clientX: innerWidth * 0.9 })); }
  if (e.key === 'ArrowLeft') show(R.idx - 1, { instant: true });
  if (e.key === 'p') setPaused(!R.paused);
});
$('#btnAuto').onclick = () => { audio.unlock(); set('auto', !S.auto); };
$('#btnSettings').onclick = () => { setPaused(true); openSheet('settings'); };
$('#btnChapters').onclick = () => { setPaused(true); openSheet('chapters'); };
$('#btnNotes').onclick = () => { setPaused(true); openSheet('notes'); };
$('#btnWords').onclick = () => { setPaused(true); openSheet('words'); };

// ---------------------------------------------------------------- HUD & chapters (#8 #9)
function chapterIndex(i) {
  const ch = book.parsed.chapters; let lo = 0, hi = ch.length - 1, ans = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (ch[m].start <= i) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
function chapterProgress(ci, i) {
  const ch = book.parsed.chapters, start = ch[ci].start, end = ch[ci + 1]?.start ?? sentences().length;
  return Math.min(1, (i - start + 1) / Math.max(1, end - start));
}
function updateHud() {
  const ci = chapterIndex(R.idx), cp = chapterProgress(ci, R.idx);
  $('#hudTitle').textContent = book.parsed.chapters[ci]?.title || book.parsed.meta.title;
  $('#chBar > div').style.width = (cp * 100).toFixed(1) + '%';
  $('#pct').textContent = `${Math.round(cp * 100)}% · ${Math.round((R.idx + 1) / sentences().length * 100)}%`;
  $('#btnAuto').textContent = S.auto ? '❚❚' : '▶';
  $('#btnAuto').classList.toggle('on', S.auto);
}
function renderChapters() {
  const list = $('#chapterList'), ch = book.parsed.chapters, cur = chapterIndex(R.idx);
  list.innerHTML = '';
  ch.forEach((c, i) => {
    const li = document.createElement('li');
    li.style.paddingLeft = (6 + c.depth * 14) + 'px';
    const len = (ch[i + 1]?.start ?? sentences().length) - c.start;
    li.textContent = c.title;
    const small = document.createElement('small');
    small.textContent = i === cur ? `${Math.round(chapterProgress(i, R.idx) * 100)}% · ${len} sentences` : `${len} sentences`;
    li.appendChild(small);
    if (i < cur) li.className = 'read';
    if (i === cur) { li.className = 'current'; const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = `<div style="width:${chapterProgress(i, R.idx) * 100}%"></div>`; li.appendChild(bar); }
    li.onclick = () => { closeSheets(); show(c.start, { instant: true }); };
    list.appendChild(li);
  });
  requestAnimationFrame(() => list.children[cur]?.scrollIntoView({ block: 'center' }));
}

// ---------------------------------------------------------------- settings (#19 #23 #25 #28)
const SCHEMA = [
  ['Display'],
  ['theme', 'Theme', 'select', THEMES],
  ['font', 'Font', 'select', Object.keys(FONTS)],
  ['fontSize', 'Text size', 'step', { step: 2, min: 14, max: 48, fmt: v => v + 'px' }],
  ['lineHeight', 'Line height', 'step', { step: 0.1, min: 1, max: 2.5, fmt: v => v.toFixed(1) }],
  ['align', 'Alignment', 'select', ['left', 'center', 'justify']],
  ['minimal', 'Minimal display', 'toggle'],
  ['Reading'],
  ['typewriter', 'Typewriter effect', 'toggle'],
  ['cps', 'Typing speed', 'step', { step: 5, min: 5, max: 200, fmt: v => v + ' cps' }],
  ['bionic', 'Bionic reading', 'toggle'],
  ['rsvp', 'RSVP (word by word)', 'toggle'],
  ['wpm', 'RSVP speed', 'step', { step: 25, min: 50, max: 1000, fmt: v => v + ' wpm' }],
  ['Auto mode'],
  ['auto', 'Auto mode', 'toggle'],
  ['autoBase', 'Pause after sentence', 'step', { step: 100, min: 0, max: 5000, fmt: v => (v / 1000).toFixed(1) + ' s' }],
  ['autoPerChar', 'Extra per character', 'step', { step: 5, min: 0, max: 200, fmt: v => v + ' ms' }],
  ['keepAwake', 'Keep screen on (auto/RSVP)', 'toggle'],
  ['Sound'],
  ['sound', 'Typing sound', 'select', Object.keys(SOUNDS), SOUNDS],
  ['volume', 'Volume', 'range', { min: 0, max: 100, step: 5 }],
  ['blipEvery', 'Sound every N letters', 'step', { step: 1, min: 1, max: 6, fmt: v => String(v) }],
];

function renderSettings() {
  const body = $('#settingsBody'); body.innerHTML = '';
  for (const [key, label, type, opt, names] of SCHEMA) {
    if (!label) { const h = document.createElement('h3'); h.textContent = key; body.appendChild(h); continue; }
    const row = document.createElement('div'); row.className = 'row';
    const l = document.createElement('span'); l.textContent = label; row.appendChild(l);
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    if (type === 'toggle') {
      const b = document.createElement('button'); b.className = 'switch' + (S[key] ? ' on' : ''); b.setAttribute('aria-pressed', S[key]);
      b.onclick = () => { set(key, !S[key]); b.classList.toggle('on', S[key]); };
      ctl.appendChild(b);
    } else if (type === 'select') {
      const sel = document.createElement('select');
      for (const o of opt) sel.add(new Option(names?.[o] || o, o, false, S[key] === o));
      sel.onchange = () => { set(key, sel.value); if (key === 'sound') { audio.unlock(); audio.blip(S.sound); } };
      ctl.appendChild(sel);
    } else if (type === 'step') {
      const val = document.createElement('span'); val.className = 'val'; val.textContent = opt.fmt(S[key]);
      const mk = (txt, d) => { const b = document.createElement('button'); b.textContent = txt;
        b.onclick = () => { set(key, +Math.min(opt.max, Math.max(opt.min, S[key] + d * opt.step)).toFixed(2)); val.textContent = opt.fmt(S[key]); }; return b; };
      ctl.append(mk('−', -1), val, mk('+', 1));
    } else if (type === 'range') {
      const r = document.createElement('input'); Object.assign(r, { type: 'range', min: opt.min, max: opt.max, step: opt.step, value: S[key] });
      r.oninput = () => set(key, +r.value);
      r.onchange = () => { audio.unlock(); audio.blip(S.sound); };
      ctl.appendChild(r);
    }
    row.appendChild(ctl); body.appendChild(row);
  }
  const act = document.createElement('div'); act.className = 'actions';
  const def = document.createElement('button'); def.textContent = 'Use for new books';
  def.onclick = async () => { await saveDefaults({ ...S, auto: false }); def.textContent = 'Saved ✓'; };
  const lib = document.createElement('button'); lib.textContent = '← Library';
  lib.onclick = () => { closeSheets(); onExit(); };
  const notes = document.createElement('button'); notes.textContent = '✎ Notes';     // reachable in minimal display too
  notes.onclick = () => { closeSheets(); setPaused(true); openSheet('notes'); };
  act.append(lib, notes, def); body.appendChild(act);
}

function set(key, value) {
  S[key] = value;
  applySettings();
  if (key === 'rsvp' || key === 'bionic') show(R.idx, { instant: true });
  if (key === 'auto') { if (S.auto) { audio.unlock(); setPaused(false); if (R.phase === 'holding') hold(); else if (R.phase === 'done') next(true); } else if (R.phase === 'holding') clear(); }
  persist();
}

function applySettings() {
  const st = document.documentElement.style;
  st.setProperty('--read-font', FONTS[S.font] || FONTS['Courier Prime']);
  st.setProperty('--read-size', S.fontSize + 'px');
  st.setProperty('--read-lh', S.lineHeight);
  st.setProperty('--read-align', S.align);
  document.body.dataset.theme = S.theme;
  document.body.classList.toggle('minimal', !!S.minimal);
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  audio.setVolume(S.volume);
  updateWake();
  if (book) updateHud();
}

// ---------------------------------------------------------------- sheets
const RENDER = { settings: () => renderSettings(), chapters: () => renderChapters(), notes: () => renderNotes(), words: () => renderWords() };
function openSheet(which) {
  RENDER[which]();
  $('#sheetBg').hidden = false; $(`#${which}Sheet`).hidden = false;
}
function closeSheets() {
  const wasOpen = !$('#sheetBg').hidden;
  $('#sheetBg').hidden = true;
  document.querySelectorAll('.sheet').forEach(el => { el.hidden = true; });
  document.activeElement?.blur?.();
  const sel = getSelection();
  if (!sel.isCollapsed && !textEl.contains(sel.anchorNode)) sel.removeAllRanges();   // or the next tap is swallowed
  if (wasOpen) flushAll();
  if (book && wasOpen) setPaused(false);
}
$('#sheetBg').onclick = closeSheets;
document.querySelectorAll('.sheet .close').forEach(b => { b.onclick = closeSheets; });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { persist(); flushAll(); } });
addEventListener('pagehide', () => { persist(); flushAll(); });

// ---------------------------------------------------------------- notes per book (#2)
// Free text kept in the book's state record (state.notes), which survives removing the book (#32).
const notesEl = $('#notesText'), notesStatus = $('#notesStatus');
function renderNotes() {
  notesEl.value = book.state.notes || '';
  notesStatus.textContent = '';
}
notesEl.addEventListener('input', () => {
  book.state.notes = notesEl.value;
  persist();                                    // debounced write (db.putSoon), flushed on close / page hide
  notesStatus.textContent = 'saved';
});
$('#btnQuote').onclick = () => {
  const ch = book.parsed.chapters[chapterIndex(R.idx)]?.title;
  const quote = `> ${sentences()[R.idx]}${ch && ch !== '—' ? ` (${ch})` : ''}\n`;
  const v = notesEl.value, at = notesEl.selectionStart ?? v.length;
  const before = v.slice(0, at), lead = before && !before.endsWith('\n') ? '\n' : '';
  notesEl.value = before + lead + quote + v.slice(at);
  notesEl.dispatchEvent(new Event('input'));
  notesEl.focus();
  notesEl.selectionStart = notesEl.selectionEnd = (before + lead + quote).length;
};

// ---------------------------------------------------------------- word lookup (#4)
// No dictionary plumbing: the owner's `french` / `english` apps sit in Android's text-selection menu, so the sheet
// just shows each word big and already selected. Plus Google define, Share and Copy.
const ELISION = /^(?:l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu|quoiqu)['’](.+)$/i;
const CLITIC = new Set(['t', 'il', 'ils', 'elle', 'elles', 'on', 'je', 'tu', 'nous', 'vous', 'moi', 'toi', 'lui', 'le', 'la', 'les', 'leur', 'y', 'en', 'ce']);
function wordsOf(text) {
  const seen = new Set(), out = [];
  for (let w of text.match(/[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}\p{N}]+)*/gu) || []) {
    w = w.replace(ELISION, '$1');                           // l’homme → homme, qu’il → il
    const parts = w.split('-');
    if (parts.length > 1 && parts.slice(1).some(p => CLITIC.has(p.toLowerCase()))) w = parts[0];   // demanda-t-il → demanda
    if (w.length < 2 || /^\p{N}+$/u.test(w) || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase()); out.push(w);
  }
  return out;
}
function renderWords() {
  const text = sentences()[R.idx] || '';
  $('#wordSentence').textContent = text;
  const list = $('#wordList'); list.innerHTML = '';
  for (const w of wordsOf(text)) {
    const b = document.createElement('button'); b.textContent = w;
    b.onclick = () => showWord(w);
    list.appendChild(b);
  }
  $('#wordPick').hidden = false; $('#wordDetail').hidden = true;
}
function showWord(w) {
  $('#wordPick').hidden = true; $('#wordDetail').hidden = false;
  const big = $('#wordBig'); big.textContent = w;
  $('#wordDefine').href = 'https://www.google.com/search?q=define+' + encodeURIComponent(w);
  $('#wordShare').hidden = !navigator.share;
  $('#wordCopy').textContent = 'Copy';
  const range = document.createRange(); range.selectNodeContents(big);      // pre-selected → selection menu
  const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
}
$('#wordBack').onclick = () => { getSelection().removeAllRanges(); $('#wordPick').hidden = false; $('#wordDetail').hidden = true; };
$('#wordShare').onclick = () => navigator.share?.({ text: $('#wordBig').textContent }).catch(() => {});
$('#wordCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('#wordBig').textContent); $('#wordCopy').textContent = 'Copied ✓'; }
  catch { $('#wordCopy').textContent = 'Copy failed'; }
};
