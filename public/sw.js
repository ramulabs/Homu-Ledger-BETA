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
const CACHE_VERSION = "v99";
const CACHE_NAME = `homu-${CACHE_VERSION}`;
const NAV_CACHE_NAME = `homu-nav-${CACHE_VERSION}`;
const NAV_CACHE_MAX = 30;

// v1.46.15 — navigation timeouts. On an iOS home-screen PWA, a fetch started
// while the radio is waking up (or on a dead/flaky network) can HANG instead
// of rejecting. With no timeout, the app sat on the launch logo forever and
// only a force-close recovered it. Now:
//   - a cached copy exists → wait at most NAV_SOFT_TIMEOUT_MS for the
//     network, then show the cached page (marked stale so the client can
//     refresh it once the network answers);
//   - no cached copy → wait at most NAV_HARD_TIMEOUT_MS, then show a small
//     "Can't reach Homu / Try again" page instead of a frozen screen.
const NAV_SOFT_TIMEOUT_MS = 3500;
const NAV_HARD_TIMEOUT_MS = 12000;
const TIMED_OUT = "timed-out";
const NETWORK_FAILED = "network-failed";

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

  // Navigation requests: network-first with timeouts (see top of file).
  //   1. Real 200 HTML (not an auth bounce) → cache + return.
  //   2. Redirects (302/307 to /login) → returned as-is, never cached.
  //   3. Network slow or failed + cached copy → cached copy, marked stale.
  //   4. Network slow or failed + nothing cached → retry page.
  if (request.mode === "navigate") {
    const cachable = !isUncachableNavPath(url.pathname);
    const network = fetch(request).then((response) => {
      if (cachable && isCachableNavResponse(response, request)) {
        const copy = response.clone();
        caches
          .open(NAV_CACHE_NAME)
          .then((cache) => cache.put(request, copy))
          .then(trimNavCache)
          .catch(() => {});
      }
      return response;
    });
    // Keep the worker alive until the network settles, so a response that
    // arrives after we answered from cache still refreshes the cache.
    event.waitUntil(network.then(() => {}, () => {}));
    event.respondWith(answerNavigation(request, network, cachable));
    return;
  }

  // /api/*, RSC payloads, images, fonts: network-only passthrough.
  // We intentionally don't cache these in Phase 1 — they need the freshest
  // possible answer and Phase 3 will introduce the write-queue layer.
});

function sleep(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function answerNavigation(request, network, cachable) {
  const settled = network.catch(() => NETWORK_FAILED);
  const cached = cachable
    ? await caches.open(NAV_CACHE_NAME).then((c) => c.match(request)).catch(() => undefined)
    : undefined;

  const first = await Promise.race([
    settled,
    sleep(cached ? NAV_SOFT_TIMEOUT_MS : NAV_HARD_TIMEOUT_MS, TIMED_OUT),
  ]);
  if (first !== TIMED_OUT && first !== NETWORK_FAILED) return first;
  return cached ? markStale(cached) : retryPage();
}

// Flag cached HTML so the client knows to refresh it once the network is
// reachable. <html> already has suppressHydrationWarning (theme bootstrap
// writes data-theme there too), so the extra attribute is safe.
async function markStale(response) {
  const fallback = response.clone();
  try {
    const html = await response.text();
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(html.replace(/<html(\s|>)/i, '<html data-homu-stale="1"$1'), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return fallback;
  }
}

function retryPage() {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Homu</title>
<style>
  :root { --bg:#f6f1e9; --fg:#2a2520; --muted:#2a252099; }
  :root[data-theme="dark"] { --bg:#1a1814; --fg:#f5f0e8; --muted:#f5f0e899; }
  html,body { margin:0; height:100%; background:var(--bg); color:var(--fg);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  main { min-height:100%; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:12px; padding:24px; text-align:center; box-sizing:border-box; }
  img { width:72px; height:72px; border-radius:18px; }
  h1 { font-size:19px; margin:8px 0 0; }
  p { font-size:14px; margin:0; color:var(--muted); max-width:280px; line-height:1.4; }
  button { margin-top:12px; border:0; border-radius:999px; padding:12px 28px;
    font-size:15px; font-weight:600; background:#EE6452; color:#fff; }
</style>
<script>
  try { if (localStorage.getItem("homu-theme") === "dark") document.documentElement.dataset.theme = "dark"; } catch (e) {}
  var id = (navigator.language || "").toLowerCase().indexOf("id") === 0;
  window.addEventListener("online", function () { location.reload(); });
</script>
</head>
<body>
<main>
  <img src="/icons/icon-192.png" alt="">
  <h1 id="t">Can't reach Homu</h1>
  <p id="d">Your connection looks slow or offline. Check your signal and try again.</p>
  <button onclick="location.reload()" id="b">Try again</button>
</main>
<script>
  if (id) {
    document.getElementById("t").textContent = "Tidak bisa terhubung ke Homu";
    document.getElementById("d").textContent = "Koneksi sepertinya lambat atau offline. Periksa sinyal lalu coba lagi.";
    document.getElementById("b").textContent = "Coba lagi";
  }
</script>
</body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
