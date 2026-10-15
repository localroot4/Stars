// Offline support. Network first, so a new deploy shows up on the next load; the cache is only the offline fallback.
const CACHE = 'yildizlar-v2'; // bump to drop the old cache-first copies
const SHELL = ['./', './index.html', './css/app.css', './js/app.js', './js/sky.js', './js/astro.js', './js/data.js', './js/catalog.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request)
    .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
