// EPUB → { meta, sentences, headings, chapters, images, notes } — browser only (DOMParser).
// Reads files in SPINE order (#9) and builds chapters from the real table of contents (nav.xhtml or toc.ncx),
// including chapters that start at an #anchor in the middle of a file.
import { unzip } from './zip.js';
import { splitParagraph, normalizeSpace, SPLITTER_VERSION } from './splitter.js';

export const PARSER_VERSION = 101 + SPLITTER_VERSION;   // bump to force re-parsing cached books

const BLOCK = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article',
  'header', 'footer', 'aside', 'dt', 'dd', 'pre', 'table', 'tr', 'td', 'th', 'figure', 'figcaption', 'ul', 'ol',
  'dl', 'br', 'hr', 'body', 'nav', 'center', 'main']);
const SKIP = new Set(['script', 'style', 'head', 'title', 'svg:title', 'noscript']);
const HEADING = /^h[1-6]$/;

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
  const sentences = [], headings = [], images = [], notes = {};
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
    const flush = (tag) => {
      const text = normalizeSpace(buf);
      buf = '';
      if (!text) return;
      for (const id of pending) anchorAt[path + '#' + id] = sentences.length;
      pending = [];
      if (tag && HEADING.test(tag)) { headings.push(sentences.length); sentences.push(text); return; }
      for (const s of splitParagraph(text)) sentences.push(s);
    };
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) { buf += child.data; continue; }
        if (child.nodeType !== 1) continue;
        const tag = child.localName.toLowerCase();
        if (SKIP.has(tag)) continue;
        const id = child.getAttribute('id');
        if (id) pending.push(id);
        if (tag === 'img' || tag === 'image') {
          const href = child.getAttribute('src') || child.getAttribute('href') || child.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          if (href) { flush(); images.push({ at: sentences.length, path: resolvePath(path, href), alt: child.getAttribute('alt') || '' }); }
          continue;
        }
        // Footnote markers like <a href="notes.html#no1">1</a> or <sup>[7]</sup>: keep them out of the sentence text
        // for now (#30 will make them clickable).
        const txt = child.textContent.trim();
        if ((tag === 'a' && (child.getAttribute('href') || '').includes('#') || tag === 'sup') && /^[[(]?\d{1,3}[\])]?$/.test(txt)) {
          const target = tag === 'a' ? child.getAttribute('href') : child.querySelector('a')?.getAttribute('href');
          if (target) (notes[sentences.length] ||= []).push({ label: txt, target: resolvePath(path, target) + '#' + (target.split('#')[1] || '') });
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

  return { meta, sentences, headings, chapters, images, notes, parserVersion: PARSER_VERSION };
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
