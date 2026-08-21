// 我的交易本 Service Worker
// 策略：本地资源网络优先（保证更新及时），失败回退缓存（离线可用）；外部数据接口不拦截不缓存
const CACHE = "tradebook-v1";
const ASSETS = ["./", "./index.html", "./manifest.json", "./icon-512.png", "./icon-192.png", "./icon-180.png"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // 仅处理本站 GET 请求；外部数据源（行情/舆情/分红）不缓存，避免脏数据
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then(m => m || caches.match("./index.html"))
      )
  );
});
