'use strict';

const CACHE_VERSION = 'v5';
const SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const CONTENT_CACHE = `content-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/bandwidth-monitor.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== CONTENT_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cache-first for the pre-cached application shell (static assets).
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Only GET requests are cacheable per the Cache API spec — cache.put()
  // throws for POST/PUT/etc. Every non-GET /api/ call (login, register,
  // enroll, diagnostic/assessment submission) must go straight to the
  // network and never be cached.
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-first with stale-while-revalidate for dynamic API content.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(CONTENT_CACHE).then(async (cache) => {
        try {
          const networkResponse = await fetch(event.request);
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        } catch (err) {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          throw err;
        }
      })
    );
  }
});
