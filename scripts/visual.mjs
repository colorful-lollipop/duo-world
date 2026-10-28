import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 18791;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = "_shots";
fs.mkdirSync(shots, { recursive: true });

const dims = async (page, label) => {
  const d = await page.evaluate(() => ({
    ih: window.innerHeight,
    dh: document.documentElement.scrollHeight,
    bh: document.body.scrollHeight,
  }));
  console.log(`DIMS ${label}: inner=${d.ih} doc=${d.dh} body=${d.bh}`);
};

const server = spawn(process.execPath, ["server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write("[server] " + d));

async function up() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE + "/api/health");
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error("server not up");
}

let browser;
try {
  await up();
  browser = await chromium.launch({ executablePath: CHROME, headless: true });

  // 首页桌面
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const home = await desktop.newPage();
  await home.goto(BASE, { waitUntil: "networkidle" });
  await sleep(500);
  await dims(home, "home-desktop");
  await home.screenshot({ path: `${shots}/home-desktop.png`, fullPage: true });
  await home.getByRole("button", { name: "玩法一览" }).click();
  await home.waitForSelector(".modal");
  await sleep(400);
  await home.screenshot({ path: `${shots}/home-games-modal.png`, fullPage: true });
  await home.getByRole("button", { name: "关闭", exact: true }).click();
  await home.getByRole("button", { name: "创建我们的小屋" }).click();
  await home.waitForSelector(".modal .profile-form");
  await sleep(400);
  await home.screenshot({ path: `${shots}/home-create-modal.png`, fullPage: true });
  await desktop.close();

  // 首页手机
  const mobileHomeCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mhome = await mobileHomeCtx.newPage();
  await mhome.goto(BASE, { waitUntil: "networkidle" });
  await sleep(400);
  await dims(mhome, "home-mobile");
  await mhome.screenshot({ path: `${shots}/home-mobile.png`, fullPage: true });
  await mobileHomeCtx.close();

  // A 创建房间
  const ctxA = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const A = await ctxA.newPage();
  A.on("pageerror", (e) => console.log("A PAGE ERROR:", e.message));
  await A.goto(BASE, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "创建我们的小屋" }).click();
  await A.waitForSelector(".modal .profile-form");
  await A.getByLabel("昵称").fill("阿满");
  await A.locator(".modal .profile-form .primary").click();
  await A.waitForURL(/\/r\/[A-Z0-9]+/);
  await A.waitForSelector(".pair-banner");
  const code = A.url().split("/r/")[1];
  console.log("room", code);
  await sleep(600);
  await dims(A, "lobby-waiting");
  await A.screenshot({ path: `${shots}/lobby-waiting.png`, fullPage: true });

  // B 加入
  const ctxB = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const B = await ctxB.newPage();
  B.on("pageerror", (e) => console.log("B PAGE ERROR:", e.message));
  await B.goto(`${BASE}/r/${code}`, { waitUntil: "networkidle" });
  await B.waitForSelector(".join-host");
  await sleep(400);
  await B.screenshot({ path: `${shots}/join.png`, fullPage: true });
  await B.getByRole("button", { name: "小熊" }).click();
  await B.locator(".color-dot").nth(1).click();
  await B.getByLabel("昵称").fill("小树");
  await B.getByRole("button", { name: "加入 TA 的小屋" }).click();
  await B.waitForSelector(".pair-banner");
  await sleep(900);
  await A.screenshot({ path: `${shots}/lobby.png`, fullPage: true });
  await B.screenshot({ path: `${shots}/lobby-b.png`, fullPage: true });
  await A.setViewportSize({ width: 375, height: 667 });
  await sleep(300);
  await dims(A, "lobby-small");
  await A.screenshot({ path: `${shots}/lobby-small.png`, fullPage: true });
  await A.setViewportSize({ width: 420, height: 900 });
  await sleep(200);
  await A.getByRole("button", { name: "分享小屋" }).click();
  await A.waitForSelector(".modal");
  await sleep(600);
  await A.screenshot({ path: `${shots}/share.png`, fullPage: true });
  await A.getByRole("button", { name: "关闭", exact: true }).click();
  await A.setViewportSize({ width: 1280, height: 1000 });
  await sleep(500);
  await A.screenshot({ path: `${shots}/lobby-desktop.png`, fullPage: true });
  await A.setViewportSize({ width: 420, height: 900 });
  await sleep(300);

  // 心有灵犀
  await A.locator(".picker-card", { hasText: "心有灵犀" }).click();
  await sleep(400);
  await A.screenshot({ path: `${shots}/lobby-minded-selected.png`, fullPage: true });
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await B.waitForSelector(".mind-stage");
  await A.waitForSelector(".mind-stage");
  await sleep(400);
  await A.screenshot({ path: `${shots}/mind-start.png`, fullPage: true });
  await A.getByPlaceholder("写下第一个想到的词").fill("海");
  await A.getByRole("button", { name: "写好了，一起揭晓" }).click();
  await sleep(300);
  await A.screenshot({ path: `${shots}/mind-submitted.png`, fullPage: true });
  await B.getByPlaceholder("写下第一个想到的词").fill("猫");
  await B.getByRole("button", { name: "写好了，一起揭晓" }).click();
  await sleep(1200);
  await A.screenshot({ path: `${shots}/mind-reveal.png`, fullPage: true });

  // 你画我猜
  await A.getByRole("button", { name: /回大厅/ }).click();
  await A.getByRole("button", { name: "回大厅" }).last().click();
  await A.waitForSelector(".pair-banner");
  await sleep(400);
  await A.locator(".picker-card", { hasText: "你画我猜" }).click();
  await sleep(300);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".word-choices");
  await sleep(400);
  await A.screenshot({ path: `${shots}/draw-choose.png`, fullPage: true });
  await A.locator(".word-choice").first().click();
  await B.waitForSelector(".drawing-canvas");
  await sleep(300);
  const box = await A.locator(".drawing-canvas").boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await A.mouse.move(cx - 80, cy - 60);
    await A.mouse.down();
    for (let i = 0; i < 24; i++) {
      await A.mouse.move(cx - 80 + i * 7, cy - 60 + Math.sin(i / 3) * 40, { steps: 2 });
      await sleep(12);
    }
    await A.mouse.up();
  }
  await sleep(500);
  await A.screenshot({ path: `${shots}/draw-canvas.png`, fullPage: true });
  await B.screenshot({ path: `${shots}/draw-guesser.png`, fullPage: true });

  // 五子棋
  await A.getByRole("button", { name: /回大厅/ }).click();
  await A.getByRole("button", { name: "回大厅" }).last().click();
  await A.waitForSelector(".pair-banner");
  await sleep(300);
  await A.locator(".picker-card", { hasText: "爱心五子棋" }).click();
  await sleep(250);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".gomoku-board");
  const cells = A.locator(".gomoku-cell");
  await cells.nth(112).click();
  await B.waitForSelector(".gomoku-board");
  await sleep(200);
  await B.locator(".gomoku-cell").nth(113).click();
  await sleep(300);
  await A.screenshot({ path: `${shots}/gomoku.png`, fullPage: true });
  const finishMoves = [
    [A, 111],
    [B, 0],
    [A, 110],
    [B, 15],
    [A, 109],
    [B, 30],
    [A, 108],
  ];
  for (const [p, i] of finishMoves) {
    await p.locator(".gomoku-cell").nth(i).click();
    await sleep(260);
  }
  await A.waitForSelector(".result-screen");
  await sleep(500);
  await A.screenshot({ path: `${shots}/gomoku-result.png`, fullPage: true });
  await A.getByRole("button", { name: "回我们的小屋" }).click();
  await A.waitForSelector(".pair-banner");
  await sleep(300);

  // 聊天卡（上一局结算后已经在大厅）
  await A.locator(".picker-card", { hasText: "深夜聊天卡" }).click();
  await sleep(250);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".talk-card");
  const turnText = await A.locator(".turn-pill").innerText();
  const actor = turnText.includes("轮到你") ? A : B;
  await actor.locator(".talk-card").click();
  await sleep(1200);
  await A.screenshot({ path: `${shots}/talk-card.png`, fullPage: true });
  await A.getByRole("button", { name: "今天就聊到这儿" }).click();
  await A.getByRole("button", { name: "收好今天的话" }).click();
  await A.waitForSelector(".result-screen");
  await sleep(400);
  await A.screenshot({ path: `${shots}/talk-result.png`, fullPage: true });
  await A.getByRole("button", { name: "回我们的小屋" }).click();
  await A.waitForSelector(".pair-banner");

  // 你懂我吗
  await sleep(300);
  await A.locator(".picker-card", { hasText: "你懂我吗" }).click();
  await sleep(250);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".know-stage");
  await sleep(400);
  await A.screenshot({ path: `${shots}/know.png`, fullPage: true });
  const helper = await A.locator(".question-board .muted").innerText();
  const heroP = helper.includes("答你自己") ? A : B;
  const guessP = heroP === A ? B : A;
  const submitKnow = async (p, text) => {
    if (await p.locator(".choice-grid").count()) {
      await p.locator(".choice-grid .choice").first().click();
    } else if (await p.locator(".know-form textarea").count()) {
      await p.locator(".know-form textarea").fill(text);
    }
    await p.getByRole("button", { name: "锁定我的答案" }).click();
  };
  await submitKnow(heroP, "真实答案");
  await sleep(250);
  await submitKnow(guessP, "猜猜的答案");
  await A.waitForSelector(".answer-pair");
  await sleep(1000);
  await A.screenshot({ path: `${shots}/know-reveal.png`, fullPage: true });
  await heroP.getByRole("button", { name: /完全懂我/ }).click();
  await A.waitForSelector(".know-score");
  await sleep(300);
  await A.screenshot({ path: `${shots}/know-graded.png`, fullPage: true });

  // 爱心跳棋（插件化 + 按需加载）
  await A.getByRole("button", { name: /回大厅/ }).click();
  await A.getByRole("button", { name: "回大厅" }).last().click();
  await A.waitForSelector(".pair-banner");
  await sleep(300);
  await A.locator(".picker-card", { hasText: "爱心跳棋" }).click();
  await sleep(250);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".checkers-board");
  await sleep(500);
  await dims(A, "checkers");
  await A.screenshot({ path: `${shots}/checkers.png`, fullPage: true });
  await A.locator(".checker-cell").nth(40).click();
  await sleep(250);
  await A.screenshot({ path: `${shots}/checkers-select.png`, fullPage: true });
  await A.locator(".checker-cell").nth(33).click();
  await sleep(500);
  await A.screenshot({ path: `${shots}/checkers-moved.png`, fullPage: true });
  await A.setViewportSize({ width: 375, height: 667 });
  await sleep(300);
  await dims(A, "checkers-small");
  await A.screenshot({ path: `${shots}/checkers-small.png`, fullPage: true });
  await A.setViewportSize({ width: 420, height: 900 });
  await sleep(200);

  await ctxA.close();
  await ctxB.close();
  console.log("screenshots done");
} catch (err) {
  console.error("VISUAL FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  await sleep(300);
}