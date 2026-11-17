// Keeps the game playable offline. The page waits for this worker before loading the game, so every build file
// is downloaded once and stored as it streams in (Unity fetches with no-store, so the HTTP cache never has it).
// Build files are named by content hash: a cached one never goes stale, and anything not in the current build
// is dropped when a new worker takes over. The page itself is network-first, so new builds show up when online.
const CACHE = "pawberry";
const PAGE = ["./", "manifest.webmanifest"];
const FILES = [
  "Build/e27010f913ab7202aecf5431503ba12d.loader.js",
  "Build/2ea8edea29a4da6f679124413127ea11.framework.js.unityweb",
  "Build/e0664b7e775f6767473fd3dcfae49ef7.data.unityweb",
  "Build/a46e8978e9a35d1fb1fd8af531185892.wasm.unityweb",
  "TemplateData/icon-192.png",
  "TemplateData/Fredoka-Bold.ttf",
];
const KEEP = new Set([...PAGE, ...FILES].map((f) => new URL(f, self.location).href));

self.addEventListener("install", (e) => {
  const page = PAGE.map((f) => new Request(f, { cache: "no-cache" }));   // never precache a stale page
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(page)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) if (!KEEP.has(req.url.split("?")[0])) await cache.delete(req);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === "navigate") {
      try {
        const res = await fetch(req.url, { cache: "no-cache" });   // revalidate, so a new build shows up at once
        if (res.ok) cache.put("./", res.clone());
        return res;
      } catch (err) {
        return (await cache.match("./")) || Response.error();
      }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && KEEP.has(req.url.split("?")[0])) cache.put(req, res.clone());
    return res;
  })());
});
