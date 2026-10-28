// 线上巡检：用真实浏览器打开生产站点，验证 PWA / CSP / WebSocket / 历史战绩。
// 用法：node scripts/prod-check.mjs   （需要本机 Chrome；CHROME_PATH 可覆盖）
// 直连 IP 时用 --host-resolver-rules 绕过本地 DNS（企业 DNS 常把 *.zulogic.cn 指到 198.18.x）。
import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HOST = process.env.CHECK_HOST || "love.zulogic.cn";
const IP = process.env.CHECK_IP || "154.89.148.238";
const BASE = `https://${HOST}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const problems = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [`--host-resolver-rules=MAP ${HOST} ${IP}`],
  });

  const ctxA = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const A = await ctxA.newPage();
  A.on("pageerror", (e) => problems.push("A pageerror: " + e.message));
  A.on("console", (m) => {
    if (m.type() === "error") problems.push("A console: " + m.text());
  });
  A.on("requestfailed", (r) => problems.push("A requestfailed: " + r.url()));

  await A.goto(BASE + "/", { waitUntil: "networkidle" });
  await A.waitForSelector(".home-screen");
  console.log("title:", await A.title());

  const meta = await A.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.getAttribute("href") || null,
    ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null,
    appleIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") || null,
  }));
  console.log("meta:", meta);
  if (!meta.manifest || !meta.ogImage) problems.push("缺少 manifest 或 og:image");

  const sw = await A.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? "registered:" + (reg.active ? "active" : "pending") : "not-registered";
  });
  console.log("service worker:", sw);

  // 建小屋 → 第二个人加入 → 开局
  await A.getByRole("button", { name: "创建我们的小屋" }).click();
  await A.waitForSelector(".modal .profile-form");
  await A.getByLabel("昵称").fill("巡检A");
  const consent = A.locator(".consent-row input");
  if (await consent.count()) {
    await consent.check();
    console.log("consent checkbox present");
  } else {
    problems.push("首次进入没有看到协议同意勾选");
  }
  await A.locator(".modal .profile-form .primary").click();
  await A.waitForURL(/\/r\/[A-Z0-9]+/, { timeout: 20000 });
  await A.waitForSelector(".pair-banner");
  const code = A.url().split("/r/")[1];
  console.log("room:", code);

  const ctxB = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const B = await ctxB.newPage();
  B.on("pageerror", (e) => problems.push("B pageerror: " + e.message));
  await B.goto(`${BASE}/r/${code}`, { waitUntil: "networkidle" });
  await B.waitForSelector(".join-host");
  await B.getByLabel("昵称").fill("巡检B");
  const consentB = B.locator(".consent-row input");
  if (await consentB.count()) await consentB.check();
  await B.getByRole("button", { name: "加入 TA 的小屋" }).click();
  await B.waitForSelector(".pair-banner");
  await sleep(600);
  console.log("both in the room");

  // 哥俩好
  await A.locator(".picker-card", { hasText: "哥俩好" }).click();
  await sleep(300);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".brothers-world");
  await B.waitForSelector(".brothers-world");
  await sleep(500);
  const box = await A.locator(".brothers-world").boundingBox();
  if (box) {
    await A.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    await A.mouse.down();
    await sleep(260);
    await A.mouse.up();
    await sleep(900);
  }
  await A.screenshot({ path: "prod-brothers.png", fullPage: true });
  console.log("brothers stage ok");

  // 历史战绩（用本人 token）
  const token = await A.evaluate((c) => localStorage.getItem("duo.token." + c), code);
  const hist = await A.evaluate(
    async ({ c, t }) => {
      const r = await fetch(`/api/rooms/${c}/history`, { headers: { Authorization: "Bearer " + t } });
      const body = await r.json().catch(() => null);
      return { status: r.status, keys: body ? Object.keys(body) : null };
    },
    { c: code, t: token },
  );
  console.log("history:", hist);
  if (hist.status !== 200) problems.push("history 接口异常: " + hist.status);

  await ctxA.close();
  await ctxB.close();
} catch (err) {
  problems.push("FAILED: " + err.message);
} finally {
  await browser?.close();
}

if (problems.length) {
  console.error("\nPROBLEMS:\n- " + problems.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("\nPROD CHECK PASSED");
  fs.rmSync("prod-brothers.png", { force: true });
}
