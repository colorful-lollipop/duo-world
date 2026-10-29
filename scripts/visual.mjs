import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 18791;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "duo-visual-"));
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

// 首次进入要先勾选《用户协议》《隐私政策》，否则提交按钮是禁用的
const agree = async (page) => {
  const box = page.locator(".consent-row input");
  if (await box.count()) await box.check();
};

const server = spawn(process.execPath, ["server/index.mjs"], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR },
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

  // 用户协议 / 隐私政策（页内滚动，不出现页面级滚动条）
  await home.goto(`${BASE}/terms`, { waitUntil: "networkidle" });
  await sleep(400);
  await dims(home, "terms-desktop");
  await home.screenshot({ path: `${shots}/terms.png`, fullPage: true });
  await home.goto(`${BASE}/privacy`, { waitUntil: "networkidle" });
  await sleep(400);
  await dims(home, "privacy-desktop");
  await home.screenshot({ path: `${shots}/privacy.png`, fullPage: true });
  await desktop.close();
  // 老用户回到首页（有历史小屋 → 多出「回到上次的小屋 / 我们的回忆 / 我的数据」三行链接）
  // 这是最容易把标题区顶长的状态，1366×700 这类矮屏必须不重叠、不出现页面滚动条
  const backCtx = await browser.newContext({ viewport: { width: 1366, height: 700 } });
  const back = await backCtx.newPage();
  await back.addInitScript(() => {
    localStorage.setItem(
      "duo.profile",
      JSON.stringify({ nickname: "阿满", avatar: "bunny", color: "#FF6B6B", mood: "joy" }),
    );
    localStorage.setItem(
      "duo.rooms",
      JSON.stringify([
        { code: "VH859J", at: Date.now() },
        { code: "8KQ2M4", at: Date.now() - 86400000 },
      ]),
    );
    localStorage.setItem("duo.token.VH859J", "seed-token-a");
    localStorage.setItem("duo.token.8KQ2M4", "seed-token-b");
    localStorage.setItem("duo.lastRoom", "VH859J");
    localStorage.setItem("duo.consent", JSON.stringify({ version: "2026-10-28", at: 1 }));
  });
  await back.goto(BASE, { waitUntil: "networkidle" });
  await sleep(600);
  await dims(back, "home-returning");
  const layout = await back.evaluate(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const copy = r(".title-copy");
    const art = r(".title-art");
    const strip = r(".home-game-strip");
    const links = r(".title-links");
    return {
      copyBottom: copy ? Math.round(copy.bottom) : null,
      artBottom: art ? Math.round(art.bottom) : null,
      stripTop: strip ? Math.round(strip.top) : null,
      linksBottom: links ? Math.round(links.bottom) : null,
      copyScrolls: document.querySelector(".title-copy")
        ? document.querySelector(".title-copy").scrollHeight >
          document.querySelector(".title-copy").clientHeight + 1
        : false,
    };
  });
  console.log("LAYOUT home-returning:", JSON.stringify(layout));
  if (layout.stripTop !== null && layout.copyBottom > layout.stripTop) {
    console.log("LAYOUT PROBLEM: 标题区压到了玩法条");
    process.exitCode = 1;
  }
  if (layout.stripTop !== null && layout.artBottom > layout.stripTop) {
    console.log("LAYOUT PROBLEM: 插画压到了玩法条");
    process.exitCode = 1;
  }
  await back.screenshot({ path: `${shots}/home-returning.png`, fullPage: true });
  await back.setViewportSize({ width: 375, height: 667 });
  await sleep(400);
  await dims(back, "home-returning-small");
  await back.screenshot({ path: `${shots}/home-returning-small.png`, fullPage: true });
  await backCtx.close();

  // 首页手机
  const mobileHomeCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mhome = await mobileHomeCtx.newPage();
  await mhome.goto(BASE, { waitUntil: "networkidle" });
  await sleep(400);
  await dims(mhome, "home-mobile");
  await mhome.screenshot({ path: `${shots}/home-mobile.png`, fullPage: true });
  await mhome.goto(`${BASE}/terms`, { waitUntil: "networkidle" });
  await sleep(400);
  await dims(mhome, "terms-mobile");
  await mhome.screenshot({ path: `${shots}/terms-mobile.png`, fullPage: true });
  await mobileHomeCtx.close();

  // A 创建房间
  const ctxA = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const A = await ctxA.newPage();
  A.on("pageerror", (e) => console.log("A PAGE ERROR:", e.message));
  await A.goto(BASE, { waitUntil: "networkidle" });
  await A.getByRole("button", { name: "创建我们的小屋" }).click();
  await A.waitForSelector(".modal .profile-form");
  await A.getByLabel("昵称").fill("阿满");
  await agree(A);
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
  await agree(B);
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

  // 哥俩好（协作跳桥）
  await A.getByRole("button", { name: /回大厅/ }).click();
  await A.getByRole("button", { name: "回大厅" }).last().click();
  await A.waitForSelector(".pair-banner");
  await sleep(300);
  await A.locator(".picker-card", { hasText: "哥俩好" }).click();
  await sleep(250);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".brothers-world");
  await sleep(600);
  await dims(A, "brothers");
  await A.screenshot({ path: `${shots}/brothers.png`, fullPage: true });
  const doHold = async (p, ms) => {
    const world = p.locator(".brothers-world");
    if (!(await world.count())) return false;
    const box = await world.boundingBox();
    if (!box) return false;
    await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6);
    await p.mouse.down();
    await sleep(ms);
    await p.mouse.up();
    await sleep(950);
    return true;
  };
  // 前两跳用小蓄力，稳稳落在起点平台
  await doHold(A, 240);
  await doHold(B, 240);
  await A.setViewportSize({ width: 375, height: 667 });
  await sleep(400);
  await dims(A, "brothers-small");
  await A.screenshot({ path: `${shots}/brothers-small.png`, fullPage: true });
  await A.setViewportSize({ width: 420, height: 900 });
  await sleep(200);
  // 再来两跳大蓄力：很可能掉进坑里挂着、再被同伴拉上来
  await doHold(A, 1300);
  await A.screenshot({ path: `${shots}/brothers-hang.png`, fullPage: true });
  await doHold(B, 1300);
  await A.screenshot({ path: `${shots}/brothers-jump.png`, fullPage: true });
  await B.screenshot({ path: `${shots}/brothers-b.png`, fullPage: true });

  // 一起拆弹（信息不对称：A 拆弹员 / B 专家）
  await A.getByRole("button", { name: /回大厅/ }).click();
  await A.getByRole("button", { name: "回大厅" }).last().click();
  await A.waitForSelector(".pair-banner");
  await sleep(300);
  await A.locator(".picker-card", { hasText: "一起拆弹" }).click();
  await sleep(250);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".bomb-stage");
  await sleep(500);
  await dims(A, "bomb-defuser");
  await A.screenshot({ path: `${shots}/bomb-defuser.png`, fullPage: true });
  await B.waitForSelector(".bomb-manual");
  await B.screenshot({ path: `${shots}/bomb-expert.png`, fullPage: true });
  await A.setViewportSize({ width: 1280, height: 800 });
  await B.setViewportSize({ width: 1280, height: 800 });
  await sleep(350);
  await dims(A, "bomb-desktop");
  await A.screenshot({ path: `${shots}/bomb-desktop.png`, fullPage: true });
  await B.screenshot({ path: `${shots}/bomb-expert-desktop.png`, fullPage: true });
  await B.setViewportSize({ width: 420, height: 900 });
  await A.setViewportSize({ width: 375, height: 667 });
  await sleep(350);
  await dims(A, "bomb-small");
  await A.screenshot({ path: `${shots}/bomb-small.png`, fullPage: true });
  await A.setViewportSize({ width: 420, height: 900 });
  await sleep(200);

  // 爱情飞行棋（掷骰 + 事件卡）
  await A.getByRole("button", { name: /回大厅/ }).click();
  await A.getByRole("button", { name: "回大厅" }).last().click();
  await A.waitForSelector(".pair-banner");
  await sleep(300);
  await A.locator(".picker-card", { hasText: "爱情飞行棋" }).click();
  await sleep(250);
  await A.getByRole("button", { name: /开始游戏/ }).click();
  await A.waitForSelector(".lf-map");
  await sleep(500);
  await dims(A, "love-flight");
  await A.screenshot({ path: `${shots}/love-flight.png`, fullPage: true });
  await A.locator(".lf-roll").click();
  await sleep(1650);
  await A.screenshot({ path: `${shots}/love-flight-rolled.png`, fullPage: true });
  if (await A.locator(".lf-event-card").count()) {
    await A.screenshot({ path: `${shots}/love-flight-event.png`, fullPage: true });
    await A.locator(".lf-event-button").click();
    await sleep(500);
  }
  await A.setViewportSize({ width: 1280, height: 800 });
  await sleep(350);
  await dims(A, "love-flight-desktop");
  await A.screenshot({ path: `${shots}/love-flight-desktop.png`, fullPage: true });
  await A.setViewportSize({ width: 375, height: 667 });
  await sleep(350);
  await dims(A, "love-flight-small");
  await A.screenshot({ path: `${shots}/love-flight-small.png`, fullPage: true });
  await A.setViewportSize({ width: 420, height: 900 });
  await sleep(200);

  // 纪念册（历史战绩弹窗）
  await A.getByRole("button", { name: /回大厅/ }).click();
  await A.getByRole("button", { name: "回大厅" }).last().click();
  await A.waitForSelector(".pair-banner");
  await sleep(300);
  await A.locator(".pair-actions .text-button", { hasText: "纪念册" }).click();
  await A.waitForSelector(".journal-view, .journal-empty");
  await sleep(500);
  await A.screenshot({ path: `${shots}/journal.png`, fullPage: true });
  await A.getByRole("button", { name: "关闭", exact: true }).click();
  await sleep(200);

  // 我的数据（导出 / 删除）
  await A.goto(BASE, { waitUntil: "networkidle" });
  await sleep(400);
  await A.locator(".home-legal-links .text-button", { hasText: "我的数据" }).click();
  await A.waitForSelector(".my-data, .journal-empty");
  await sleep(400);
  await dims(A, "my-data");
  await A.screenshot({ path: `${shots}/my-data.png`, fullPage: true });
  await A.getByRole("button", { name: "关闭", exact: true }).click();
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
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}