/*
 * Résido's service worker (registered by components/ui/AppRuntime.tsx, in
 * production only). It keeps the installed app quick and honest offline:
 * - pages and data always come from the network — they are private and
 *   change all the time, so none is ever stored here;
 * - a page that cannot load (no connection) shows /offline.html instead of
 *   the browser's error;
 * - the app's code, styles and fonts (/_next/static, named after their
 *   content so they never change) and the icons load from the device once
 *   fetched.
 * Change VERSION to drop everything stored by a previous version.
 */
const VERSION = "v1";
const SHELL = `resido-shell-${VERSION}`;
const STATIC = `resido-static-${VERSION}`;
const STATIC_LIMIT = 300;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(fromCacheFirst(request));
  }
});

async function fromCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC);
    await cache.put(request, response.clone());
    trim(cache);
  }
  return response;
}

/** Old builds' files pile up with each deploy: keep the newest STATIC_LIMIT. */
async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT)).map((k) => cache.delete(k)));
}
