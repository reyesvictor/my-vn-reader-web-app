// Files inside the open book's EPUB (images #27, footnote targets #30), read lazily from the stored .epub blob.
// Only one book is open at a time; closeAssets() revokes its blob URLs.
import { unzip } from './zip.js';
import { get } from '../store/db.js';

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
let cur = null;      // { id, zip: Promise<zip|null>, urls: Map<path, Promise<url|null>> }

export function openAssets(id) {
  if (cur?.id === id) return;
  closeAssets();
  cur = { id, zip: null, urls: new Map() };
}

export function closeAssets() {
  if (!cur) return;
  for (const p of cur.urls.values()) p.then(u => u && URL.revokeObjectURL(u));
  cur = null;
}

function zipOf(c) {
  c.zip ||= get('files', c.id).then(blob => (blob ? blob.arrayBuffer().then(unzip) : null)).catch(() => null);
  return c.zip;
}

export function assetUrl(path) {
  const c = cur;
  if (!c) return Promise.resolve(null);
  if (!c.urls.has(path)) {
    c.urls.set(path, zipOf(c).then(async zip => {
      const bytes = await zip?.bytes(path);
      if (!bytes) return null;
      const type = MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream';
      return URL.createObjectURL(new Blob([bytes], { type }));
    }).catch(() => null));
  }
  return c.urls.get(path);
}

export async function assetText(path) {
  const c = cur;
  return c ? (await zipOf(c))?.text(path) ?? null : null;
}
