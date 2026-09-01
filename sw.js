const CACHE_VERSION = "masar-static-v16";
const STATIC_CACHE = CACHE_VERSION;
const APP_SCOPE = new URL(self.registration.scope);
const staticUrl = (path) => new URL(path, APP_SCOPE).href;
const PRECACHE = [
  staticUrl("offline.html"),
  staticUrl("manifest.webmanifest"),
  staticUrl("src/styles/design-system.css"),
  staticUrl("icons/icon-192.png"),
  staticUrl("icons/icon-512.png"),
  staticUrl("icons/icon-maskable-512.png"),
  staticUrl("icons/apple-touch-icon.png"),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("masar-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isSafeStaticRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(APP_SCOPE.pathname)) return false;
  return /\.(?:css|js|svg|png|ico|woff2?|webmanifest)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // لا نعترض أي API أو مصدر خارجي مطلقًا؛ بيانات Supabase تبقى شبكة فقط.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(staticUrl("offline.html"))));
    return;
  }

  if (!isSafeStaticRequest(request, url)) return;
  event.respondWith(caches.open(STATIC_CACHE).then(async (cache) => {
    // JavaScript is network-first so a newly published data-access fix is not
    // hidden behind an older cached module. Other assets stay fast/offline.
    if (url.pathname.endsWith(".js")) {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone());
        return response;
      } catch {
        return cache.match(request);
      }
    }
    const cached = await cache.match(request);
    const refresh = fetch(request).then((response) => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(refresh.catch(() => {}));
      return cached;
    }
    return refresh;
  }));
});
