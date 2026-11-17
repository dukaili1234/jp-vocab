// 离线缓存：先用缓存秒开。
// 页面本身会在后台拉新版本，下次打开生效；词库（2MB）和图标只在 VERSION 变化时重新下载，省流量。
// 改了 words.js 或图标，就把 VERSION 加一。
const VERSION = "v1";
const CACHE = "vocab-" + VERSION;
const FILES = [
  "./", "index.html", "words.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const isPage = e.request.mode === "navigate" || /\.(html|webmanifest)$|\/$/.test(new URL(e.request.url).pathname);
    if (cached && !isPage) return cached;
    const fresh = fetch(e.request).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
