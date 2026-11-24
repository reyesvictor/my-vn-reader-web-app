// App entry: hash routing between the library (#/) and the reader (#/read/<id>).
import { importFile, openBook, removeBook, listBooks, defaultSettings } from './store/library.js';
import { openReader, closeReader } from './ui/reader.js';
import { get } from './store/db.js';

const $ = s => document.querySelector(s);
const status = msg => { $('#libStatus').textContent = msg || ''; };

async function route() {
  const m = location.hash.match(/^#\/read\/(\w+)/);
  if (m) {
    try {
      const book = await openBook(m[1]);
      $('#library').hidden = true; $('#reader').hidden = false;
      openReader(book, { exit: () => { location.hash = '#/'; } });
    } catch (e) { status(e.message); location.hash = '#/'; }
  } else {
    closeReader();
    $('#reader').hidden = true; $('#library').hidden = false;
    document.body.dataset.theme = (await defaultSettings()).theme;
    renderLibrary();
  }
}

async function renderLibrary() {
  const { books } = await listBooks();
  const list = $('#bookList'); list.innerHTML = '';
  const last = await get('kv', 'lastBook');
  const cont = books.find(b => b.id === last);
  $('#continue').innerHTML = '';
  if (cont) {
    const b = document.createElement('button'); b.className = 'continue';
    b.innerHTML = `<small>Continue</small>`; b.append(cont.title);
    b.onclick = () => { location.hash = '#/read/' + cont.id; };
    $('#continue').appendChild(b);
  }
  if (!books.length) { list.innerHTML = '<li class="lib-foot">No books yet. Import an EPUB.</li>'; return; }
  for (const book of books) {
    const pct = Math.round(((book.index || 0) + 1) / Math.max(1, book.total) * 100);
    const li = document.createElement('li'); li.className = 'book';
    const open = document.createElement('button'); open.className = 'open';
    const t = document.createElement('span'); t.className = 't'; t.textContent = book.title;
    const a = document.createElement('span'); a.className = 'a'; a.textContent = `${book.author ? book.author + ' · ' : ''}${book.index ? pct + '%' : 'new'}`;
    const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = `<div style="width:${book.index ? pct : 0}%"></div>`;
    open.append(t, a, bar);
    open.onclick = () => { location.hash = '#/read/' + book.id; };
    const del = document.createElement('button'); del.className = 'del'; del.textContent = '✕'; del.title = 'Remove';
    del.onclick = async () => {
      if (!confirm(`Remove “${book.title}” from the library?\n\nProgress and settings are kept: import the same file again to restore them.`)) return;
      await removeBook(book.id); renderLibrary();
    };
    li.append(open, del); list.appendChild(li);
  }
}

$('#fileInput').onchange = async e => {
  const files = [...e.target.files]; e.target.value = '';
  let lastId = null;
  for (const [i, f] of files.entries()) {
    status(`Importing ${i + 1}/${files.length}: ${f.name}…`);
    try { const r = await importFile(f); lastId = r.id; if (r.restored) status(`Restored saved progress for ${f.name}`); }
    catch (err) { status(`Failed: ${f.name} — ${err.message}`); console.error(err); return; }
  }
  if (files.length === 1 && lastId) location.hash = '#/read/' + lastId;
  else { status(`Imported ${files.length} books.`); renderLibrary(); }
};

addEventListener('hashchange', route);
route();
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
