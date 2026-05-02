// VIET CONTECH — KILL SWITCH SW
// Tu unregister + clear cache cho TAT CA user da cai phien ban cu.
// User chi can mo site 1 lan -> auto xoa cache -> reload HTML moi nhat.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url);
  })());
});
self.addEventListener('fetch', (e) => {
  // Bypass cache hoan toan, luon di network
  e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })));
});
