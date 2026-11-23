// 离线缓存。
// 页面、app.js、主题样式：有网先拉最新版（3 秒拉不到或断网才用缓存），保证更新后打开就是新版。
// 词库、图标：先用缓存，只在 VERSION 变化时重新下载，省流量。
// 改了 words.js / words-open.js 或图标，就把 VERSION 加一。发音缓存（audio-cache）由页面自己管理，这里不删。
const VERSION = "v3";
const CACHE = "vocab-" + VERSION;
const FILES = [
  "./", "index.html", "app.js", "theme-techou.css", "theme-night.css", "words.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  // cache: "reload" 绕过浏览器 HTTP 缓存，确保存进来的是服务器上的新文件
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("vocab-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // 发音文件由页面自己存进 audio-cache，这里不重复缓存
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/audio/")) return;
  const isPage = e.request.mode === "navigate" || /\.(html|webmanifest)$|\/$|\/app\.js$|\.css$/.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    // 页面每次都跟服务器核对（没变化只回 304）；其他文件第一次下载时也绕过 HTTP 缓存
    const fromNet = () => fetch(url.href, { cache: isPage ? "no-cache" : "reload" }).then(res => {
      if (res.ok) cache.put(url.origin + url.pathname, res.clone());   // 去掉 ?db= 之类参数，同一个文件只存一份
      return res;
    });
    if (!isPage) return cached || fromNet();
    const net = fromNet();
    if (!cached) return net;
    const timeout = new Promise(resolve => setTimeout(() => resolve(cached), 3000));
    return Promise.race([net.catch(() => cached), timeout]);
  }));
});
