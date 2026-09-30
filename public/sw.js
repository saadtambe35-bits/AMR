// SwarmEdge service worker: precache shell, cache-first for assets, network-first for navigation.
const V = "swarmedge-v1";
const SHELL = ["/", "/index.html", "/manifest.json", "/icons/icon.svg"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !FONT_HOSTS.includes(url.host)) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { caches.open(V).then((c) => c.put("/index.html", r.clone())); return r; })
      .catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(V).then((c) => c.put(req, copy)); }
    return r;
  }).catch(() => hit)));
});
