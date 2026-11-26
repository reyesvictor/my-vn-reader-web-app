// Library operations: import, open (with parse cache), delete (keeps per-book state).
import * as db from './db.js';
import { parseEpub, PARSER_VERSION } from '../core/epub.js';
import { DEFAULTS } from '../settings.js';
import { initStats } from '../stats.js';

export async function importFile(file) {
  const buffer = await file.arrayBuffer();
  const id = await db.bookId(buffer);
  const parsed = await parseEpub(buffer);
  await db.put('files', id, new Blob([buffer], { type: 'application/epub+zip' }));
  await db.put('parsed', id, parsed);
  const old = await db.get('meta', id);
  const meta = { id, title: parsed.meta.title, author: parsed.meta.author, total: parsed.sentences.length,
    addedAt: old?.addedAt || Date.now(), openedAt: old?.openedAt || 0 };
  await db.put('meta', id, meta);
  const state = await db.get('state', id);
  if (!state) {
    const fresh = { index: 0, settings: await defaultSettings(), notes: '', updatedAt: Date.now() };
    initStats(fresh, meta);
    await db.put('state', id, fresh);
  }
  navigator.storage?.persist?.();
  return { id, restored: !!state };
}

export async function openBook(id) {
  let parsed = await db.get('parsed', id);
  const state = (await db.get('state', id)) || { index: 0, settings: await defaultSettings(), notes: '' };
  if (!parsed || parsed.parserVersion !== PARSER_VERSION) {
    const blob = await db.get('files', id);
    if (!blob) throw new Error('Book file missing — import it again.');
    const old = parsed;
    parsed = await parseEpub(await blob.arrayBuffer());
    await db.put('parsed', id, parsed);
    if (old?.sentences && state.index) {          // new parser = shifted indexes: keep the reader on the same sentence
      state.index = remapIndex(old.sentences, parsed.sentences, state.index);
      await db.put('state', id, { ...state, updatedAt: Date.now() });
    }
  }
  state.settings = { ...DEFAULTS, ...state.settings };
  const meta = await db.get('meta', id);
  initStats(state, meta);                       // books from before #40: "started before tracking" if in progress
  await db.put('meta', id, { ...meta, openedAt: Date.now(), total: parsed.sentences.length });
  await db.put('kv', 'lastBook', id);
  return { id, parsed, state };
}

export async function removeBook(id) {          // state (progress, settings, notes) is kept on purpose (#32)
  await Promise.all([db.del('meta', id), db.del('parsed', id), db.del('files', id)]);
}

export async function listBooks() {
  const [metas, states] = await Promise.all([db.all('meta'), db.all('state')]);
  const books = await Promise.all(metas.map(async m => ({ ...m, index: (await db.get('state', m.id))?.index || 0 })));
  return { books: books.sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt)), savedStates: states.length };
}

export async function defaultSettings() { return { ...DEFAULTS, ...((await db.get('kv', 'defaults')) || {}) }; }
export const saveDefaults = settings => db.put('kv', 'defaults', settings);
export const saveState = (id, state) => db.putSoon('state', id, { ...state, updatedAt: Date.now() });

// Same sentence text, nearest to the old index (the parse changed around it). Falls back to the old index.
export function remapIndex(oldSentences, newSentences, idx) {
  const text = oldSentences[idx];
  const last = newSentences.length - 1;
  if (text == null || newSentences[idx] === text) return Math.min(idx, last);
  for (let d = 1; d <= 5000; d++) {
    if (newSentences[idx - d] === text) return idx - d;
    if (newSentences[idx + d] === text) return idx + d;
  }
  return Math.min(idx, last);
}
