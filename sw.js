// Offline cache for the app shell. Network first, so a new deploy shows up on the next load.
const CACHE = 'vn-reader-v7';
const SHELL = ['./', 'index.html', 'css/app.css', 'manifest.webmanifest', 'js/main.js', 'js/settings.js', 'js/dim.js', 'js/audio.js', 'js/wake.js',
  'js/core/zip.js', 'js/core/splitter.js', 'js/core/epub.js', 'js/core/assets.js', 'js/store/db.js', 'js/store/library.js', 'js/ui/reader.js',
  'sfx/blip_high.ogg', 'icons/icon-192.png', 'fonts/CourierPrime-Regular.ttf', 'fonts/CourierPrime-Bold.ttf',
  'fonts/CourierPrime-Italic.ttf', 'fonts/Monocraft.ttf', 'fonts/VT323-Regular.ttf', 'fonts/Monocraft-Bold.ttf',
  'fonts/PressStart2P-Regular.ttf', 'fonts/Creepster-Regular.ttf'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request)
    .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
