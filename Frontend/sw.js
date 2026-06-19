const CACHE_NAME = 'oc-quan4-cache-v5';
const ASSETS_TO_CACHE = [
  './index.html',
  './style.css',
  './app.js?v=5',
  './db.js',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Exclude API calls from service worker caching (they always go to backend)
  if (url.pathname.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        // Cache Leaflet images, OpenStreetMap tiles, and downloaded MP3 audio files
        if (
          event.request.method === 'GET' &&
          (url.hostname.includes('tile.openstreetmap.org') || 
           url.pathname.includes('/tile/') ||
           url.pathname.endsWith('.mp3') ||
           url.pathname.includes('/images/'))
        ) {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        }
        return networkResponse;
      }).catch(err => {
        console.warn('Network request failed, resource not cached offline:', url.href);
      });
    })
  );
});
