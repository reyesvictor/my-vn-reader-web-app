// IndexedDB storage.
//  meta   id → { id, title, author, total, addedAt, openedAt }          (library list)
//  parsed id → parseEpub() result                                       (cache, re-parsed when PARSER_VERSION changes)
//  files  id → Blob (original .epub)
//  state  id → { index, settings, notes, updatedAt }                    (NEVER deleted with the book — #32)
//  kv     key → value (global defaults, last book…)
// Book id = SHA-256 of the file bytes → re-importing the same file restores its progress/settings/notes.

const STORES = ['meta', 'parsed', 'files', 'state', 'kv'];
let dbp = null;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('vn-reader', 1);
    r.onupgradeneeded = () => STORES.forEach(s => r.result.objectStoreNames.contains(s) || r.result.createObjectStore(s));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
export const get = (store, key) => run(store, 'readonly', s => s.get(key));
export const put = (store, key, value) => run(store, 'readwrite', s => s.put(value, key));
export const del = (store, key) => run(store, 'readwrite', s => s.delete(key));
export const all = store => run(store, 'readonly', s => s.getAll());

export async function bookId(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Debounced progress writes (a sentence change every second must not hammer the disk).
const timers = {};
export function putSoon(store, key, value, ms = 800) {
  clearTimeout(timers[store + key]);
  timers[store + key] = setTimeout(() => put(store, key, value), ms);
}
