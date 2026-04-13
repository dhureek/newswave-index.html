// ============================================================
// NEWS WAVE — Service Worker
// Offline support + Fast loading + Background sync
// ============================================================

var CACHE_NAME = 'newswave-v1';
var OFFLINE_URL = '/';

// Files to cache for offline use
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/posts.json'
];

// Install: cache core files
self.addEventListener('install', function(e) {
  console.log('SW: Installing...');
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS).catch(function(err) {
        console.log('SW: Cache partial fail', err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  console.log('SW: Activating...');
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: Network first, cache fallback
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // posts.json: always try network (latest news)
  if (url.pathname === '/posts.json') {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // External resources (fonts, CDN): cache first
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
          }
          return res;
        }).catch(function() {
          return new Response('', { status: 408 });
        });
      })
    );
    return;
  }

  // Everything else: network first, cache fallback
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res.ok) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request).then(function(cached) {
        return cached || caches.match('/index.html');
      });
    })
  );
});
