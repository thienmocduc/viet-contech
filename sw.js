// VIET CONTECH — Service Worker (offline-first cho landing + dashboard)
const VERSION = 'vct-v1.0.0';
const CORE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/logo-emblem-nav.png',
  '/logo-emblem-hero.png'
];

// INSTALL: prefetch core
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(CORE).catch(err => console.warn('[SW] precache partial:', err)))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE: cleanup old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// FETCH strategy:
//  - Navigation (HTML): network-first, fallback cache
//  - Same-origin static (img, css, js): cache-first, refresh background
//  - Cross-origin (fonts.googleapis, fonts.gstatic): stale-while-revalidate
//  - API calls (/api/*): network-only (no cache để tránh stale data)
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API: bypass cache
  if (url.pathname.startsWith('/api/')) return;

  // Navigation
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Cross-origin (fonts)
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(VERSION).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Same-origin static: cache-first
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // Refresh in background
        fetch(req).then(res => {
          if (res && res.status === 200) {
            caches.open(VERSION).then(c => c.put(req, res));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});

// Skip waiting on demand (cho phép update không reload)
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
