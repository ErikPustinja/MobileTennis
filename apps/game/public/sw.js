// Mobitenis service worker: keeps the game and controller usable offline
// after the first visit. Network first (always fresh when online), cache as
// fallback. Pairing a phone still needs the internet; the game says so.
const CACHE = 'mobitenis-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Pages send the URLs they already loaded (before the worker existed).
self.addEventListener('message', (e) => {
  const urls = Array.isArray(e.data?.cache) ? e.data.cache : [];
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(urls.filter((u) => new URL(u).origin === self.location.origin).map((u) => c.add(u).catch(() => {}))),
    ),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate', ignoreVary: true });
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
