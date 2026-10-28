// 端到端冒烟测试入口。
//
// 每个游戏一个模块：scripts/smoke/<id>.mjs，默认导出 async function run(ctx)。
// 只跑一款游戏：npm run smoke:game -- brothers
// 全量：npm run smoke
//
// 模块之间互不依赖（每个模块自己 exit / select / settings / start），
// 所以单独跑和全量跑的顺序不会影响结果。
import { GAMES } from "../server/meta.mjs";
import { WebSocket } from "ws";
import {
  BASE,
  PORT,
  api,
  assert,
  connect,
  sleep,
  startServer,
  stopServer,
  waitUntil,
} from "./smoke/_harness.mjs";

const args = process.argv.slice(2);
const onlyIndex = args.findIndex((a) => a === "--game" || a === "-g");
const positional = args.find((a) => !a.startsWith("-") && args.indexOf(a) !== onlyIndex + 1);
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : positional || null;
if (onlyIndex >= 0 && !only) {
  console.error("用法：npm run smoke:game -- <game-id>");
  process.exit(1);
}

const ids = GAMES.map((g) => g.id);
if (only && !ids.includes(only)) {
  console.error(`✗ 没有这个游戏：${only}\n  可选：${ids.join(", ")}`);
  process.exit(1);
}
const selected = only ? [only] : ids;

const modules = new Map();
for (const id of selected) {
  const mod = await import(`./smoke/${id}.mjs`);
  if (typeof mod.default !== "function") throw new Error(`scripts/smoke/${id}.mjs 需要默认导出 run 函数`);
  modules.set(id, mod.default);
}

let server;
try {
  console.log(`▶ 冒烟测试：${selected.join(" → ")}（端口 ${PORT}）`);
  server = await startServer();
  console.log("done: server started");

  const profileA = { nickname: "A", avatar: "bunny", color: "#FF6B6B" };
  const profileB = { nickname: "B", avatar: "bear", color: "#4D9DFF" };

  const cfg = await api("config");
  assert(cfg.status === 200 && Array.isArray(cfg.data.lanUrls), "config endpoint");

  const created = await api("rooms", { method: "POST", body: JSON.stringify({ profile: profileA }) });
  assert(created.status === 200, "create room");
  const ticketA = created.data;
  assert(ticketA.code?.length === 6, "room code");
  console.log("done: room created", ticketA.code);

  const info = await api("rooms/" + ticketA.code);
  assert(info.status === 200 && info.data.seats[0].nickname === "A", "public info");

  const joined = await api("rooms/" + ticketA.code + "/join", {
    method: "POST",
    body: JSON.stringify({ profile: profileB }),
  });
  assert(joined.status === 200, "join room");
  const ticketB = joined.data;
  assert(ticketB.seat === 1, "second seat");
  console.log("done: second player joined");

  const third = await api("rooms/" + ticketA.code + "/join", {
    method: "POST",
    body: JSON.stringify({ profile: { nickname: "C" } }),
  });
  assert(third.status === 409 && third.data.code === "ROOM_FULL", "room full");
  console.log("done: room full rejected");

  const A = connect(ticketA);
  const B = connect(ticketB);
  await waitUntil(() => A.state && B.state, "initial states");
  assert(A.seat === 0 && B.seat === 1, "seats");
  assert(A.state.seats[0].connected && A.state.seats[1].connected, "presence");
  console.log("done: websocket welcome + presence");

  const ctx = { A, B, assert, sleep, waitUntil, api, BASE, ticketA, ticketB };
  for (const id of selected) {
    await modules.get(id)(ctx);
  }

  if (!only) {
    // ---------- 全局：反应、重连、历史、导出、注销 ----------
    A.send({ type: "reaction", emoji: "🫶" });
    await waitUntil(() => B.reactions.length === 1 && B.reactions[0] === "🫶", "reaction");
    console.log("done: reactions");

    A.ws.close();
    await waitUntil(() => B.state.seats[0].connected === false, "presence offline");
    const A2 = connect(ticketA);
    await waitUntil(() => A2.state && A2.seat === 0, "reconnect welcome");
    assert(A2.state.seats[0].connected === true, "reconnected presence");
    assert(A2.state.journal.length >= 5, "journal survived reconnect");
    console.log("done: reconnect with token");

    const hist = await fetch(`${BASE}/api/rooms/${ticketA.code}/history`, {
      headers: { Authorization: "Bearer " + ticketA.token },
    });
    const histData = await hist.json();
    assert(hist.status === 200, "history endpoint status");
    assert(Array.isArray(histData.entries) && histData.entries.length >= 5, "history entries");
    assert(histData.entries.some((e) => e.gameId === "brothers"), "history keeps brothers entry");
    assert(histData.entries[0].at >= histData.entries[histData.entries.length - 1].at, "history newest first");
    assert(typeof histData.alive === "boolean", "history alive flag");
    const badHist = await fetch(`${BASE}/api/rooms/${ticketA.code}/history`, {
      headers: { Authorization: "Bearer nope" },
    });
    assert(badHist.status === 403, "history needs own token");
    console.log("done: history api + token guard");

    const exp = await fetch(`${BASE}/api/rooms/${ticketA.code}/export`, {
      headers: { Authorization: "Bearer " + ticketA.token },
    });
    const expData = await exp.json();
    assert(exp.status === 200, "export status");
    assert(expData.code === ticketA.code, "export code");
    assert(expData.entries.length >= 5, "export entries");
    assert(Array.isArray(expData.seats) && expData.seats.some((s) => s.nickname === "A"), "export seats");
    assert(expData.stats.wins && typeof expData.stats.wins === "object", "export stats");
    const badExp = await fetch(`${BASE}/api/rooms/${ticketA.code}/export`, {
      headers: { Authorization: "Bearer nope" },
    });
    assert(badExp.status === 403, "export needs own token");
    console.log("done: export api + token guard");

    const badCode = await new Promise((resolve) => {
      const bad = new WebSocket(`ws://127.0.0.1:${PORT}/ws?code=${ticketA.code}`);
      bad.on("open", () => bad.send(JSON.stringify({ type: "auth", token: "nope" })));
      bad.on("close", (code) => resolve(code));
      setTimeout(() => resolve(0), 3000);
    });
    assert(badCode === 4001, "bad token rejected");
    console.log("done: bad token rejected");

    const del = await fetch(`${BASE}/api/rooms/${ticketA.code}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + ticketA.token },
    });
    const delData = await del.json();
    assert(del.status === 200 && delData.ok === true, "delete status");
    assert(delData.removed && delData.removed.rooms >= 1, "delete removed rows");
    const goneHist = await fetch(`${BASE}/api/rooms/${ticketA.code}/history`, {
      headers: { Authorization: "Bearer " + ticketA.token },
    });
    assert(goneHist.status === 403, "history gone after purge");
    const goneInfo = await fetch(`${BASE}/api/rooms/${ticketA.code}`);
    assert(goneInfo.status === 404, "room gone after purge");
    console.log("done: purge room + guards");

    A2.ws.close();
  }

  B.ws.close();
  await sleep(100);
  console.log(`\nALL SMOKE TESTS PASSED${only ? ` (${only})` : ""}`);
} catch (err) {
  console.error("\nSMOKE TEST FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await stopServer(server);
}
