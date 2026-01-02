const CACHE_NAME = "us-calc-pwa-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app.min.js"
  // Add icons later if you create them:
  // "./icon-192.png",
  // "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request)
          .then((resp) => {
            // Cache successful GET requests
            if (event.request.method === "GET" && resp && resp.status === 200) {
              const copy = resp.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return resp;
          })
          .catch(() => cached)
      );
    })
  );
});
