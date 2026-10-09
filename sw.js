const CACHE = 'kelimeedin-v21';
const ASSETS = [
  './',
  './index.html',
  './data/words.dat',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Skip cross-origin (fonts, dictionary API)
  if (url.origin !== location.origin) return;
  e.respondWith(
    // ignoreSearch: "./?source=pwa" or a link with tracking params must still open offline
    caches.match(e.request, { ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() =>
        // Offline cache miss: a page load falls back to the app shell. This used to
        // resolve to undefined, which respondWith() turns into a network error.
        e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()
      );
    })
  );
});
