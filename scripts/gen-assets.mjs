// scripts/gen-assets.mjs
// 生成 PWA 图标 / Apple touch icon / 分享卡 og.png，以及 manifest / robots / sitemap / sw。
// 用法：npm run assets（幂等，可重复运行）
// 思路：用 playwright-core 驱动本机 Chrome，setContent 内联 SVG/CSS，按目标尺寸精确截图。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const ICONS = path.join(PUBLIC, "icons");

const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// 品牌色
const C = {
  main: "#FF6B6B",
  accent: "#FF9A76",
  dot: "#FFC93C",
  bg: "#FFF8F1",
  ink: "#3A2618",
  monkey: "#8B5E3C",
  monkeyDeep: "#6E4B2E",
  cream: "#FDE9D8",
  heartCream: "#FFF6EA",
};

// favicon.svg 里的爱心路径（64 坐标空间），两处复用
const HEART64 =
  "M32 50C18 39 12 30 18 23C23 17 30 21 32 26C34 21 41 17 46 23C52 30 46 39 32 50Z";
// 放大到 100 坐标空间（×100/64）后的爱心，用于图标
const HEART100 =
  "M50 78.1 C28.1 60.9 18.75 46.9 28.1 35.9 C35.9 26.6 46.9 32.8 50 40.6 C53.1 32.8 64.1 26.6 71.9 35.9 C81.25 46.9 71.9 60.9 50 78.1 Z";

// ---------- 图标（viewBox 100×100，圆角或满版） ----------
function iconSvg({ rounded = true, faceScale = 1 } = {}) {
  const bg = rounded
    ? `<rect x="0" y="0" width="100" height="100" rx="24" fill="url(#bg)"/>`
    : `<rect x="0" y="0" width="100" height="100" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.accent}"/>
      <stop offset="1" stop-color="${C.main}"/>
    </linearGradient>
  </defs>
  ${bg}
  <g transform="translate(50 52.35) scale(${faceScale}) translate(-50 -52.35)">
    <path d="${HEART100}" fill="${C.heartCream}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="39.06" cy="48.44" r="3.4" fill="${C.ink}"/>
    <circle cx="60.94" cy="48.44" r="3.4" fill="${C.ink}"/>
    <path d="M42.97 55.47 Q50 61.72 57.03 55.47" stroke="${C.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
}

function wrapSvg(svg) {
  return `<!DOCTYPE html><html style="margin:0;height:100%"><head><meta charset="utf-8"/></head><body style="margin:0;height:100%;background:transparent">${svg}</body></html>`;
}

// ---------- 分享卡 og.png（1200×630） ----------
const ogHtml = `<!DOCTYPE html>
<html style="margin:0;height:100%">
<head>
<meta charset="utf-8"/>
</head>
<body style="margin:0;height:100%;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.bg}"/>
      <stop offset="0.55" stop-color="#FFF0E4"/>
      <stop offset="1" stop-color="#FFE6D2"/>
    </linearGradient>
    <linearGradient id="hgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.accent}"/>
      <stop offset="1" stop-color="${C.main}"/>
    </linearGradient>
    <linearGradient id="badge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${C.accent}"/>
      <stop offset="1" stop-color="${C.main}"/>
    </linearGradient>
    <g id="miniHeart">
      <path d="${HEART64}" fill="url(#hgrad)" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
    </g>
  </defs>

  <rect width="1200" height="630" fill="url(#ogbg)"/>

  <!-- 装饰圆与散落的小爱心 -->
  <circle cx="1060" cy="80" r="42" fill="${C.dot}" opacity="0.3"/>
  <circle cx="70" cy="600" r="56" fill="${C.accent}" opacity="0.16"/>
  <circle cx="1180" cy="575" r="34" fill="${C.main}" opacity="0.14"/>
  <use href="#miniHeart" transform="translate(762 132) scale(0.30)" opacity="0.5"/>
  <use href="#miniHeart" transform="translate(1132 180) scale(0.30)" opacity="0.45"/>
  <use href="#miniHeart" transform="translate(648 548) scale(0.26)" opacity="0.5"/>
  <use href="#miniHeart" transform="translate(1052 556) scale(0.24)" opacity="0.45"/>
  <use href="#miniHeart" transform="translate(792 64) scale(0.20)" opacity="0.5"/>

  <!-- 左半部分：标题文案 -->
  <g font-family="'Microsoft YaHei','PingFang SC',system-ui,sans-serif">
    <rect x="70" y="56" width="60" height="60" rx="15" fill="url(#badge)" stroke="${C.ink}" stroke-width="4"/>
    <g transform="translate(68 52.5)">
      <path d="${HEART64}" fill="${C.heartCream}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
    </g>
    <text x="70" y="232" font-size="96" font-weight="700" fill="${C.ink}" letter-spacing="6">二人世界</text>
    <text x="70" y="288" font-size="34" font-weight="600" fill="${C.monkey}" letter-spacing="2">和 TA 一起玩的在线小游戏</text>
    <line x1="70" y1="318" x2="570" y2="318" stroke="#F0C09C" stroke-width="3" stroke-linecap="round"/>
    <text x="70" y="360" font-size="24" font-weight="500" fill="${C.monkeyDeep}" letter-spacing="1" data-fit-max="500">你画我猜 · 心有灵犀 · 你懂我吗 · 五子棋 · 跳棋 · 聊天卡</text>
  </g>

  <!-- 左猴（面向右，尾巴向左卷） -->
  <g>
    <path d="M610 435 Q558 452 568 492 Q578 518 610 510" stroke="${C.monkey}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="640" cy="385" rx="52" ry="68" fill="${C.monkey}"/>
    <circle cx="596" cy="282" r="15" fill="${C.monkey}"/>
    <circle cx="640" cy="295" r="46" fill="${C.monkey}"/>
    <circle cx="640" cy="246" r="9" fill="${C.monkey}"/>
    <path d="M686 340 L728 372" stroke="${C.monkey}" stroke-width="17" stroke-linecap="round"/>
    <circle cx="728" cy="372" r="12" fill="${C.cream}"/>
    <circle cx="676" cy="278" r="15" fill="${C.monkey}"/>
    <circle cx="658" cy="298" r="29" fill="${C.cream}"/>
    <circle cx="650" cy="292" r="4.6" fill="${C.ink}"/>
    <circle cx="670" cy="292" r="4.6" fill="${C.ink}"/>
    <path d="M654 308 Q663 314 672 308" stroke="${C.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="612" y="322" width="78" height="30" rx="12" fill="${C.accent}" stroke="${C.ink}" stroke-width="3"/>
    <path d="M676 348 Q690 378 674 402 L652 384 Z" fill="${C.accent}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
  </g>

  <!-- 绳子 + 中间红心 -->
  <path d="M725 372 C 795 412 858 428 900 428 C 942 428 1005 412 955 372" stroke="${C.monkeyDeep}" stroke-width="7" fill="none" stroke-linecap="round"/>
  <line x1="900" y1="430" x2="900" y2="442" stroke="${C.monkeyDeep}" stroke-width="5"/>
  <g transform="translate(900 466) scale(1.65) translate(-32 -33.5)">
    <path d="${HEART64}" fill="url(#hgrad)" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <circle cx="885" cy="452" r="6" fill="${C.bg}" opacity="0.85"/>

  <!-- 右猴（面向左，镜像） -->
  <g>
    <path d="M1070 435 Q1122 452 1112 492 Q1102 518 1070 510" stroke="${C.monkey}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="1040" cy="385" rx="52" ry="68" fill="${C.monkey}"/>
    <circle cx="1084" cy="282" r="15" fill="${C.monkey}"/>
    <circle cx="1040" cy="295" r="46" fill="${C.monkey}"/>
    <circle cx="1040" cy="246" r="9" fill="${C.monkey}"/>
    <path d="M994 340 L952 372" stroke="${C.monkey}" stroke-width="17" stroke-linecap="round"/>
    <circle cx="952" cy="372" r="12" fill="${C.cream}"/>
    <circle cx="1004" cy="278" r="15" fill="${C.monkey}"/>
    <circle cx="1022" cy="298" r="29" fill="${C.cream}"/>
    <circle cx="1010" cy="292" r="4.6" fill="${C.ink}"/>
    <circle cx="1030" cy="292" r="4.6" fill="${C.ink}"/>
    <path d="M1026 308 Q1017 314 1008 308" stroke="${C.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <rect x="590" y="322" width="78" height="30" rx="12" fill="${C.accent}" stroke="${C.ink}" stroke-width="3"/>
    <path d="M604 348 Q590 378 606 402 L628 384 Z" fill="${C.accent}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
  </g>
</svg>
<script>
function fit() {
  document.querySelectorAll("[data-fit-max]").forEach((el) => {
    const max = Number(el.getAttribute("data-fit-max"));
    let size = parseFloat(el.getAttribute("font-size"));
    let guard = 0;
    while (el.getBBox().width > max && guard < 80) {
      size -= 0.5;
      el.setAttribute("font-size", size);
      guard += 1;
    }
  });
}
window.addEventListener("load", () => {
  document.fonts.ready.then(() => {
    fit();
    window.__fitted = true;
  });
});
</script>
</body>
</html>`;

// ---------- 渲染 ----------
async function render(browser, { html, width, height, out }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "load" });
    if (html.includes("__fitted")) {
      await page.waitForFunction(() => window.__fitted === true, null, { timeout: 5000 });
      const sizes = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-fit-max]")).map((el) => ({
          text: el.textContent,
          fontSize: parseFloat(el.getAttribute("font-size")),
          bboxWidth: Math.round(el.getBBox().width),
        }))
      );
      for (const s of sizes) {
        console.log(`fit: "${s.text}" font=${s.fontSize}px width=${s.bboxWidth}px`);
      }
    }
    await page.screenshot({ path: out, omitBackground: true });
  } finally {
    await ctx.close();
  }
}

// ---------- 文本文件 ----------
function writeTextFiles() {
  const manifest = {
    name: "二人世界 · 和 TA 一起玩的小游戏",
    short_name: "二人世界",
    description:
      "给两个人做的在线小游戏小屋：你画我猜、心有灵犀、你懂我吗、五子棋、跳棋、聊天卡、哥俩好。",
    lang: "zh-CN",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FFF8F1",
    theme_color: "#FF6B6B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "创建小屋", url: "/?action=create" },
      { name: "加入 TA 的小屋", url: "/?action=join" },
    ],
  };
  fs.writeFileSync(
    path.join(PUBLIC, "manifest.webmanifest"),
    JSON.stringify(manifest, null, 2) + "\n"
  );

  fs.writeFileSync(
    path.join(PUBLIC, "robots.txt"),
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api/",
      "Disallow: /metrics",
      "Disallow: /ws",
      "",
      "Sitemap: https://love.zulogic.cn/sitemap.xml",
      "",
    ].join("\n")
  );

  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(
    path.join(PUBLIC, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://love.zulogic.cn/</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n</urlset>\n`
  );

  fs.writeFileSync(
    path.join(PUBLIC, "sw.js"),
    `// 版本号变更即可让旧缓存整体失效
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

const OFFLINE_HTML = \`<!DOCTYPE html>
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
</html>\`;

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
`
  );
}

// ---------- 校验 ----------
function pngInfo(file) {
  const buf = fs.readFileSync(file);
  const sig = "89504e470d0a1a0a";
  if (buf.length < 24 || buf.subarray(0, 8).toString("hex") !== sig) {
    throw new Error(file + " 不是合法 PNG");
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bytes: buf.length,
  };
}

// ---------- 主流程 ----------
fs.mkdirSync(ICONS, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });

  await render(browser, {
    html: wrapSvg(iconSvg({ rounded: true })),
    width: 192,
    height: 192,
    out: path.join(ICONS, "icon-192.png"),
  });
  await render(browser, {
    html: wrapSvg(iconSvg({ rounded: true })),
    width: 512,
    height: 512,
    out: path.join(ICONS, "icon-512.png"),
  });
  await render(browser, {
    html: wrapSvg(iconSvg({ rounded: false, faceScale: 0.86 })),
    width: 512,
    height: 512,
    out: path.join(ICONS, "icon-maskable-512.png"),
  });
  await render(browser, {
    html: wrapSvg(iconSvg({ rounded: false })),
    width: 180,
    height: 180,
    out: path.join(ICONS, "apple-touch-icon.png"),
  });
  await render(browser, {
    html: ogHtml,
    width: 1200,
    height: 630,
    out: path.join(PUBLIC, "og.png"),
  });
} catch (err) {
  console.error("ASSETS FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
}

if (process.exitCode === 1) process.exit(1);

writeTextFiles();

const EXPECT = [
  ["icons/icon-192.png", 192, 192],
  ["icons/icon-512.png", 512, 512],
  ["icons/icon-maskable-512.png", 512, 512],
  ["icons/apple-touch-icon.png", 180, 180],
  ["og.png", 1200, 630],
];
let ok = true;
for (const [rel, w, h] of EXPECT) {
  const file = path.join(PUBLIC, rel);
  const info = pngInfo(file);
  const good = info.width === w && info.height === h;
  ok = ok && good;
  console.log(`${rel}: ${info.width}x${info.height} ${info.bytes} bytes ${good ? "OK" : "MISMATCH!"}`);
}

for (const rel of ["manifest.webmanifest", "robots.txt", "sitemap.xml", "sw.js"]) {
  const file = path.join(PUBLIC, rel);
  if (!fs.existsSync(file)) {
    console.log(rel + ": MISSING!");
    ok = false;
  } else {
    console.log(`${rel}: ${fs.statSync(file).size} bytes`);
  }
}

if (!ok) {
  console.error("SOME FILES ARE WRONG");
  process.exit(1);
}
console.log("ALL ASSETS OK");
