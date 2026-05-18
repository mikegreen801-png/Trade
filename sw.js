/* Day Trader OS — Service Worker */
const CACHE = 'dto-v2';
const STATIC = [
  '/',
  '/index.html',
  '/market_intel.html',
  '/trade_planner.html',
  '/execution_workbench.html',
  '/review_workbench.html',
  '/analytics.html',
  '/assets/app.css',
  '/assets/dto-core.js',
  '/assets/scripts/site.js',
  '/assets/icon.svg',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return Promise.allSettled(STATIC.map(function(url) { return c.add(url).catch(function(){}); }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  var url;
  try { url = new URL(e.request.url); } catch(err) { return; }

  // Skip non-GET, API calls, and cross-origin
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname !== self.location.hostname) return;

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networkFetch = fetch(e.request).then(function(response) {
        if (response.ok && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});
