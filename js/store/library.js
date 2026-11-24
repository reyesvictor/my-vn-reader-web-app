// Library operations: import, open (with parse cache), delete (keeps per-book state).
import * as db from './db.js';
import { parseEpub, PARSER_VERSION } from '../core/epub.js';
import { DEFAULTS } from '../settings.js';

export async function importFile(file) {
  const buffer = await file.arrayBuffer();
  const id = await db.bookId(buffer);
  const parsed = await parseEpub(buffer);
  await db.put('files', id, new Blob([buffer], { type: 'application/epub+zip' }));
  await db.put('parsed', id, parsed);
  const old = await db.get('meta', id);
  await db.put('meta', id, { id, title: parsed.meta.title, author: parsed.meta.author, total: parsed.sentences.length,
    addedAt: old?.addedAt || Date.now(), openedAt: old?.openedAt || 0 });
  const state = await db.get('state', id);
  if (!state) await db.put('state', id, { index: 0, settings: await defaultSettings(), notes: '', updatedAt: Date.now() });
  navigator.storage?.persist?.();
  return { id, restored: !!state };
}

export async function openBook(id) {
  let parsed = await db.get('parsed', id);
  if (!parsed || parsed.parserVersion !== PARSER_VERSION) {
    const blob = await db.get('files', id);
    if (!blob) throw new Error('Book file missing — import it again.');
    parsed = await parseEpub(await blob.arrayBuffer());
    await db.put('parsed', id, parsed);
  }
  const state = (await db.get('state', id)) || { index: 0, settings: await defaultSettings(), notes: '' };
  state.settings = { ...DEFAULTS, ...state.settings };
  const meta = await db.get('meta', id);
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
