// Bump CACHE_VERSION on every release. It versions BOTH caches below, so
// stale page HTML and stale JS chunks are always evicted together.
//
// Why this matters (v1.46.3 fix): NAV_CACHE_NAME used to be a fixed
// "homu-nav-v1" that never changed across releases, while CACHE_NAME was
// bumped every release. So `activate` deleted the old build's static
// chunks — but the old page HTML in the un-versioned nav cache SURVIVED.
// A later offline / flaky-network load then served that stale HTML, whose
// referenced JS chunks had already been evicted → the chunk fetch failed
// → React never hydrated → the page rendered but every button was dead,
// including the "+" Add Transaction button. Versioning both caches in
// lockstep guarantees a page's HTML and its chunks live and die together:
// offline-after-deploy now shows the browser's offline page (honest)
// instead of a zombie, un-hydratable page.
const CACHE_VERSION = "v89";
const CACHE_NAME = `homu-${CACHE_VERSION}`;
const NAV_CACHE_NAME = `homu-nav-${CACHE_VERSION}`;
const NAV_CACHE_MAX = 30;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, NAV_CACHE_NAME]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// LRU trim: cache.keys() returns insertion order, so drop the oldest.
async function trimNavCache() {
  const cache = await caches.open(NAV_CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length <= NAV_CACHE_MAX) return;
  await Promise.all(keys.slice(0, keys.length - NAV_CACHE_MAX).map((k) => cache.delete(k)));
}

// Pages that auth-redirect or are themselves auth screens — never cache.
// Caching /login would freeze a stale form state for offline users; the
// auth callback must always hit network.
function isUncachableNavPath(pathname) {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/privacy")
  );
}

// Only cache real HTML responses. If middleware bounced us to /login the
// Response has `redirected: true` — caching that under /transactions would
// freeze the user on the login page forever. RSC payloads (Next 16 sends a
// custom content-type on prefetch) are network-only too.
function isCachableNavResponse(response, request) {
  if (!response || !response.ok) return false;
  if (response.redirected) return false;
  if (response.type === "opaqueredirect") return false;
  if (response.status !== 200) return false;
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return false;
  if (request.headers.get("rsc")) return false;
  if (request.headers.get("next-router-prefetch")) return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // _next/static is content-addressed (hash in filename) so cache-first is
  // always safe: a new build = a new URL = a fresh fetch.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests: network-first, fall back to cached HTML when offline.
  // Strategy:
  //   1. Try network. If we get a real 200 HTML (not an auth bounce), cache + return.
  //   2. If network returns a redirect (302/307 to /login) we DON'T cache — return as-is.
  //   3. On network failure, serve the last good cached HTML for this path if we have one.
  //   4. If we have nothing cached, let the browser show its offline error.
  if (request.mode === "navigate") {
    if (isUncachableNavPath(url.pathname)) {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith(
      (async () => {
        const cache = await caches.open(NAV_CACHE_NAME);
        try {
          const response = await fetch(request);
          if (isCachableNavResponse(response, request)) {
            cache.put(request, response.clone()).then(trimNavCache).catch(() => {});
          }
          return response;
        } catch (networkErr) {
          const cached = await cache.match(request, { ignoreSearch: false });
          if (cached) return cached;
          // No cache → re-throw so the browser renders its native offline page.
          throw networkErr;
        }
      })()
    );
    return;
  }

  // /api/*, RSC payloads, images, fonts: network-only passthrough.
  // We intentionally don't cache these in Phase 1 — they need the freshest
  // possible answer and Phase 3 will introduce the write-queue layer.
});
