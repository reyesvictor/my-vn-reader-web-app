// EPUB → { meta, sentences, headings, chapters, images, notes, footnotes } — browser only (DOMParser).
// Reads files in SPINE order (#9) and builds chapters from the real table of contents (nav.xhtml or toc.ncx),
// including chapters that start at an #anchor in the middle of a file.
import { unzip } from './zip.js';
import { splitParagraph, normalizeSpace, SPLITTER_VERSION } from './splitter.js';

export const PARSER_VERSION = 102 + SPLITTER_VERSION;   // bump to force re-parsing cached books

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article',
  'header', 'footer', 'aside', 'dt', 'dd', 'pre', 'table', 'tr', 'td', 'th', 'figure', 'figcaption', 'ul', 'ol',
  'dl', 'br', 'hr', 'body', 'nav', 'center', 'main']);
const SKIP = new Set(['script', 'style', 'head', 'title', 'svg:title', 'noscript']);
const HEADING = /^h[1-6]$/;
const MARK = '\uE000';                         // placeholder for a footnote marker while a paragraph is collected
const LABEL = /^[[(]?\d{1,3}[\])]?$/;
const isMarker = (el, txt) => (el.localName === 'a' && (el.getAttribute('href') || '').includes('#') || el.localName === 'sup') && LABEL.test(txt);

const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const html = s => {
  const d = new DOMParser().parseFromString(s, 'application/xhtml+xml');
  return d.querySelector('parsererror') ? new DOMParser().parseFromString(s, 'text/html') : d;
};
const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

export function resolvePath(base, href) {
  const [path] = href.split('#');
  const parts = (dirOf(base) + safeDecode(path)).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }
const byLocal = (root, name) => [...root.getElementsByTagNameNS('*', name)];

export async function parseEpub(buffer) {
  const zip = await unzip(buffer);
  const container = xml(await zip.text('META-INF/container.xml'));
  const opfPath = byLocal(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: no content.opf');
  const opf = xml(await zip.text(opfPath));

  const meta = {
    title: byLocal(opf, 'title')[0]?.textContent.trim() || 'Untitled',
    author: byLocal(opf, 'creator')[0]?.textContent.trim() || '',
  };
  const manifest = new Map();
  for (const it of byLocal(opf, 'item')) {
    manifest.set(it.getAttribute('id'), {
      path: resolvePath(opfPath, it.getAttribute('href') || ''),
      type: it.getAttribute('media-type') || '',
      props: it.getAttribute('properties') || '',
    });
  }
  const spineEl = byLocal(opf, 'spine')[0];
  const spine = byLocal(opf, 'itemref').map(r => manifest.get(r.getAttribute('idref'))?.path).filter(Boolean);

  // ---- text ----
  const sentences = [], headings = [], images = [], notes = {}, footnotes = {};
  const noteTargets = new Set();      // 'path#id' of every footnote marker seen so far (notes come after their refs)
  const fileStart = {}, anchorAt = {};
  for (const path of spine) {
    const src = await zip.text(path);
    if (src == null) continue;
    fileStart[path] = sentences.length;
    const doc = html(src);
    const body = doc.body || byLocal(doc, 'body')[0];
    if (!body) continue;
    let buf = '';
    let pending = [];
    let marks = [];                   // footnote markers of the paragraph being collected, in order of MARK
    const flush = (tag) => {
      // Take the MARKs out and remember where they were (offset in the clean text) → marker position (#30).
      const offs = [];
      let text = '';
      for (const ch of normalizeSpace(buf)) {
        if (ch === MARK) offs.push(text.length);
        else if (!(ch === ' ' && (!text || text.endsWith(' ')))) text += ch;
      }
      text = text.trimEnd();
      const ms = marks;
      buf = ''; marks = [];
      if (!text) {                    // a marker alone in its block: attach it to the previous sentence
        if (sentences.length) for (const m of ms) (notes[sentences.length - 1] ||= []).push({ ...m, pos: sentences[sentences.length - 1].length });
        return;
      }
      for (const id of pending) anchorAt[path + '#' + id] = sentences.length;
      pending = [];
      const base = sentences.length;
      const parts = tag && HEADING.test(tag) ? [text] : splitParagraph(text);
      if (parts.length === 1 && tag && HEADING.test(tag)) headings.push(base);
      let cursor = 0;
      const starts = parts.map(p => { const i = text.indexOf(p, cursor); const st = i < 0 ? cursor : i; cursor = st + p.length; return st; });
      ms.forEach((m, k) => {
        const o = Math.min(offs[k] ?? text.length, text.length);
        let j = 0; while (j + 1 < parts.length && starts[j + 1] <= o) j++;
        (notes[base + j] ||= []).push({ ...m, pos: Math.max(0, Math.min(o - starts[j], parts[j].length)) });
      });
      sentences.push(...parts);
    };
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) { buf += child.data; continue; }
        if (child.nodeType !== 1) continue;
        const tag = child.localName.toLowerCase();
        if (SKIP.has(tag)) continue;
        const id = child.getAttribute('id');
        // Footnote bodies (the targets of markers met earlier) leave the reading flow; their text goes to
        // `footnotes` for the pop-up (#30). Never headings, never long blocks (a chapter <section id> stays).
        const noteKey = noteBodyKey(child, tag, path, noteTargets);
        if (noteKey) { footnotes[noteKey] = noteText(doc.getElementById?.(noteKey.split('#')[1]) || child); continue; }
        if (id) pending.push(id);
        if (tag === 'img' || tag === 'image') {
          const href = child.getAttribute('src') || child.getAttribute('href') || child.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          if (href) { flush(); images.push({ at: sentences.length, path: resolvePath(path, href), alt: child.getAttribute('alt') || '' }); }
          continue;
        }
        // Footnote markers like <a href="notes.html#no1">1</a> or <sup>[7]</sup>: out of the sentence text, a MARK
        // keeps their place so the reader can draw a clickable marker there (#30).
        const txt = child.textContent.trim();
        if (isMarker(child, txt)) {
          const target = tag === 'a' ? child.getAttribute('href') : child.querySelector('a')?.getAttribute('href');
          if (target) {
            const key = resolvePath(path, target) + '#' + (target.split('#')[1] || '');
            noteTargets.add(key);
            buf += MARK; marks.push({ label: txt.replace(/[[\]()]/g, ''), target: key });
          }
          continue;
        }
        if (BLOCK.has(tag)) { flush(); walk(child); flush(tag); }
        else walk(child);
      }
    };
    walk(body);
    flush();
    for (const id of pending) anchorAt[path + '#' + id] = sentences.length;
  }

  // ---- table of contents ----
  const toc = await readToc(zip, manifest, spineEl);
  let chapters = [];
  for (const e of toc) {
    const at = e.anchor ? anchorAt[e.path + '#' + e.anchor] ?? fileStart[e.path] : fileStart[e.path];
    if (at == null || at >= sentences.length) continue;
    chapters.push({ title: e.title || 'Untitled', start: at, depth: e.depth });
  }
  chapters.sort((a, b) => a.start - b.start);
  chapters = chapters.filter((c, i, a) => !(i && a[i - 1].start === c.start && a[i - 1].title === c.title));
  if (!chapters.length) {            // no usable TOC: one chapter per spine file
    spine.forEach((p, i) => {
      if (fileStart[p] == null || fileStart[p] >= sentences.length) return;
      const next = spine.slice(i + 1).map(q => fileStart[q]).find(v => v != null) ?? sentences.length;
      if (next === fileStart[p]) return;
      const h = headings.find(x => x >= fileStart[p] && x < next);
      chapters.push({ title: h != null ? sentences[h] : `Section ${chapters.length + 1}`, start: fileStart[p], depth: 0 });
    });
  }
  // Chapter openers that aren't <h1-6> in the HTML ("2", "Chapitre 3", "PROLOGUE"): style them as headings.
  const isHeading = new Set(headings);
  for (const c of chapters) {
    const t = sentences[c.start];
    if (!isHeading.has(c.start) && t.length <= 80 && !/[.!?…»”:,;]$/.test(t)) { headings.push(c.start); isHeading.add(c.start); }
  }
  headings.sort((a, b) => a - b);
  if (chapters.length && chapters[0].start > 0) chapters.unshift({ title: '—', start: 0, depth: 0 });
  if (!chapters.length) chapters.push({ title: meta.title, start: 0, depth: 0 });

  return { meta, sentences, headings, chapters, images, notes, footnotes, parserVersion: PARSER_VERSION };
}

// ---- footnotes (#30) ----
// Is `el` the body of a footnote whose marker we already met? Returns its 'path#id' key.
//  <div id="no1"><p>1. Text</p></div>   → the element itself is the target
//  <p><a id="no1" href="#re1">1</a> Text</p> → a block starting with its target back-link
function noteBodyKey(el, tag, path, targets) {
  if (!targets.size || HEADING.test(tag)) return null;
  const id = el.getAttribute('id');
  const len = el.textContent.length;
  if (id && targets.has(path + '#' + id) && !isMarker(el, el.textContent.trim()) && len < 3000) return path + '#' + id;
  if (BLOCK.has(tag) && len < 1500) {
    const first = el.querySelector('[id]');
    const fid = first?.getAttribute('id');
    if (fid && targets.has(path + '#' + fid) && isMarker(first, first.textContent.trim())
        && normalizeSpace(el.textContent).startsWith(first.textContent.trim())) return path + '#' + fid;
  }
  const type = el.getAttribute('epub:type') || el.getAttributeNS?.('http://www.idpf.org/2007/ops', 'type') || '';
  if (id && /\b(foot|end|rear)?note\b/.test(type) && len < 3000) return path + '#' + id;
  return null;
}

// Text of a footnote: the target's block (if the target is an inline back-link), without the leading "1." label.
export function noteText(el) {
  let block = el;
  while (block.parentNode && block.parentNode.nodeType === 1 && !BLOCK.has(block.localName.toLowerCase())) block = block.parentNode;
  let text = normalizeSpace(block.textContent).replace(/^[[(]?\d{1,3}[\])]?\.?\s*/, '');
  if (!text && block.nextElementSibling) text = normalizeSpace(block.nextElementSibling.textContent);
  return text;
}

// Lazy fallback for a target that wasn't collected while parsing (e.g. a notes file outside the spine).
export function findNote(src, id) {
  const doc = html(src);
  const el = doc.getElementById?.(id) || [...doc.getElementsByTagName('*')].find(e => e.getAttribute('id') === id);
  return el ? noteText(el) : null;
}

async function readToc(zip, manifest, spineEl) {
  const items = [...manifest.values()];
  const nav = items.find(i => i.props.split(/\s+/).includes('nav'));
  if (nav) {
    const doc = html(await zip.text(nav.path) || '');
    const navs = byLocal(doc, 'nav');
    const tocNav = navs.find(n => (n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '').includes('toc')) || navs[0];
    const out = [];
    if (tocNav) for (const a of byLocal(tocNav, 'a')) {
      const href = a.getAttribute('href'); if (!href) continue;
      let depth = 0; for (let p = a.parentNode; p && p !== tocNav; p = p.parentNode) if (p.localName === 'ol') depth++;
      out.push({ title: normalizeSpace(a.textContent), path: resolvePath(nav.path, href), anchor: href.split('#')[1], depth: Math.max(0, depth - 1) });
    }
    if (out.length) return out;
  }
  const ncxId = spineEl?.getAttribute('toc');
  const ncx = (ncxId && manifest.get(ncxId)) || items.find(i => i.type === 'application/x-dtbncx+xml');
  if (!ncx) return [];
  const doc = xml(await zip.text(ncx.path) || '<x/>');
  const out = [];
  const visit = (el, depth) => {
    for (const np of el.children) {
      if (np.localName !== 'navPoint') continue;
      const label = byLocal(np, 'text')[0]?.textContent || '';
      const src = [...np.children].find(c => c.localName === 'content')?.getAttribute('src');
      if (src) out.push({ title: normalizeSpace(label), path: resolvePath(ncx.path, src), anchor: src.split('#')[1], depth });
      visit(np, depth + 1);
    }
  };
  const navMap = byLocal(doc, 'navMap')[0];
  if (navMap) visit(navMap, 0);
  return out;
}
