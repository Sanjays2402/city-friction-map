// City Friction Map service worker.
// App shell: cache-first. API: network-first with cache fallback.
const VERSION = "cfm-1.5.0";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function cachePut(request, response) {
  const copy = response.clone();
  caches.open(VERSION).then((cache) => cache.put(request, copy));
  return response;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (url.pathname.startsWith("/api/")) {
    // Network-first: live data wins, cached responses cover outages.
    event.respondWith(
      fetch(event.request)
        .then((response) => cachePut(event.request, response))
        .catch(() => caches.match(event.request)),
    );
    return;
  }
  // Cache-first: the app shell and bundled assets load instantly offline.
  event.respondWith(
    caches
      .match(event.request)
      .then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) =>
            cachePut(event.request, response),
          ),
      ),
  );
});
