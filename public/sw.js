// 版本号变更即可让旧缓存整体失效
const VERSION = "duo-v1";
const SHELL_CACHE = VERSION + "-shell";
const RUNTIME_CACHE = VERSION + "-runtime";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png", "/icons/icon-512.png"];

// install：预缓存 SHELL（逐个 addAll，失败不要整体崩溃），然后 skipWaiting()
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch((err) => console.warn("[sw] 预缓存失败:", url, err))
        )
      );
      await self.skipWaiting();
    })()
  );
});

// activate：删除名字不是 VERSION 开头的 cache，然后 clients.claim()
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>二人世界</title>
  <style>
    body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#FFF8F1;color:#3A2618;font-family:"Microsoft YaHei",system-ui,sans-serif;}
    p{font-size:18px;}
  </style>
</head>
<body><p>网络断开了，稍后再试</p></body>
</html>`;

// fetch：只处理 GET 且同源；跳过 /api、/ws、/metrics、/sw.js；任何异常都回落到缓存或响应，绝不让 fetch reject 冒泡
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (
    path.startsWith("/api") ||
    path === "/ws" ||
    path.startsWith("/metrics") ||
    path === "/sw.js"
  ) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put("/", res.clone());
      return res;
    }
    throw new Error("HTTP " + res.status);
  } catch (err) {
    console.warn("[sw] 网络优先失败，尝试缓存:", err.message);
  }
  try {
    const cached = await caches.match("/");
    if (cached) return cached;
  } catch (err) {
    console.warn("[sw] 读缓存失败:", err.message);
  }
  return new Response(OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function cacheFirst(req) {
  try {
    const fromCache = await caches.match(req);
    if (fromCache) return fromCache;
  } catch (err) {
    console.warn("[sw] 缓存匹配失败:", err.message);
  }
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      try {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, res.clone());
      } catch (err) {
        console.warn("[sw] 写入运行缓存失败:", err.message);
      }
    }
    return res;
  } catch (err) {
    console.warn("[sw] 网络请求失败:", err.message);
    try {
      const fromCache = await caches.match(req);
      if (fromCache) return fromCache;
    } catch {}
    return new Response("", { status: 504, statusText: "Offline" });
  }
}
