/**
 * Literary Lounge — Service Worker
 * Strategy:
 *   - App shell (pages, JS, CSS, fonts) → Cache-First with network fallback
 *   - API / Firebase calls → Network-First with cache fallback
 *   - Images → Stale-While-Revalidate
 *   - Book content in IndexedDB (idb-keyval) is already persistent — SW just
 *     makes sure the app shell itself loads offline so those reads can happen.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `ll-shell-${CACHE_VERSION}`;
const IMAGE_CACHE   = `ll-images-${CACHE_VERSION}`;
const API_CACHE     = `ll-api-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/explore',
  '/history',
  '/offline',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const validCaches = [SHELL_CACHE, IMAGE_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !validCaches.includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (
    request.destination === 'image' ||
    url.hostname.includes('unsplash.com') ||
    url.hostname.includes('picsum.photos') ||
    url.hostname.includes('placehold.co')
  ) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  event.respondWith(
    cacheFirst(request, SHELL_CACHE).catch(() => offlineFallback(request))
  );
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => {});
  return cached || fetchPromise;
}

async function offlineFallback(request) {
  if (request.mode === 'navigate') {
    const offlinePage = await caches.match('/offline');
    if (offlinePage) return offlinePage;
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Literary Lounge – Offline</title>
      <style>body{font-family:Georgia,serif;background:#faf8f4;color:#1a2340;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:100vh;margin:0;padding:2rem;text-align:center}
      h1{font-size:2rem;margin-bottom:.5rem}p{color:#666;max-width:360px;line-height:1.6}
      a{color:#3d5a99;font-weight:600}</style></head>
      <body><h1>📚 You're offline</h1>
      <p>Your <strong>local library</strong> is still available —
      <a href="/">go back home</a> to read books you've saved.</p></body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
  throw new Error('Network unavailable');
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
