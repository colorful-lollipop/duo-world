import { spawn } from "node:child_process";
import { WebSocket } from "ws";

const PORT = 18790;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(fn, label = "", timeout = 8000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch {}
    await sleep(25);
  }
  throw new Error(`timeout: ${label}${last ? "" : ""}`);
}

async function api(path, options = {}) {
  const res = await fetch(BASE + "/api/" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function connect(ticket) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?code=${ticket.code}&token=${ticket.token}`);
  const client = {
    ws,
    seat: null,
    state: null,
    errors: [],
    ink: [],
    inkSyncs: [],
    reactions: [],
  };
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === "welcome") {
      client.seat = msg.seat;
      client.state = msg.state;
    } else if (msg.type === "state") {
      client.state = msg.state;
    } else if (msg.type === "error") {
      client.errors.push(msg.message);
    } else if (msg.type === "ink") {
      client.ink.push(msg.data);
    } else if (msg.type === "ink-sync") {
      client.inkSyncs.push(msg.strokes);
      if (client.state?.game) client.state.game.data.strokes = msg.strokes;
    } else if (msg.type === "reaction") {
      client.reactions.push(msg.emoji);
    }
  });
  client.send = (msg) => ws.send(JSON.stringify(msg));
  client.act = (action) => client.send({ type: "action", action });
  client.game = () => client.state?.game?.data;
  return client;
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

let server;
try {
  server = spawn(process.execPath, ["server/index.mjs"], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write("[server] " + d));

  await waitUntil(async () => {
    try {
      const r = await fetch(BASE + "/api/health");
      return r.ok;
    } catch {
      return false;
    }
  }, "server up", 10000);
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

  // ---------- mind-meld ----------
  A.send({ type: "select", gameId: "mind-meld" });
  await waitUntil(() => A.state.gameId === "mind-meld" && B.state.gameId === "mind-meld", "select mind");
  A.send({ type: "settings", settings: { rounds: 6 } });
  await waitUntil(() => A.state.settings["mind-meld"].rounds === 6, "mind settings");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "submit" && B.game()?.phase === "submit", "mind start");

  A.act({ type: "submit", word: "sea" });
  await sleep(100);
  assert(A.game().submitted[0] === "sea", "first word stored");
  B.act({ type: "submit", word: "cat" });
  await waitUntil(() => A.game().phase === "reveal", "mind reveal");
  assert(A.game().history.length === 1 && A.game().history[0].matched === false, "different words");
  A.act({ type: "agree" });
  B.act({ type: "agree" });
  await waitUntil(() => A.game().roundMatched === true && A.game().matched === 1, "mind agreement");
  A.act({ type: "next" });
  await waitUntil(() => A.game().round === 1 && A.game().phase === "submit", "mind round 2");
  A.act({ type: "submit", word: "fish" });
  B.act({ type: "submit", word: "fish" });
  await waitUntil(() => A.game().history[1]?.matched === true && A.game().matched === 2, "mind exact match");
  for (let r = 2; r < 6; r++) {
    A.act({ type: "next" });
    await waitUntil(() => A.game().round === r && A.game().phase === "submit", "mind round " + (r + 1));
    A.act({ type: "submit", word: "w" + r });
    B.act({ type: "submit", word: "x" + r });
    await waitUntil(() => A.game().phase === "reveal", "mind reveal " + r);
  }
  A.act({ type: "next" });
  await waitUntil(() => A.game().phase === "over", "mind over");
  await waitUntil(() => A.state.journal.length === 1, "mind journal");
  assert(A.state.journal[0].gameId === "mind-meld" && A.state.journal[0].data.matched === 2, "mind journal data");
  console.log("done: mind-meld flow + journal");

  // ---------- know-me ----------
  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit mind");
  A.send({ type: "select", gameId: "know-me" });
  await waitUntil(() => A.state.gameId === "know-me", "select know");
  A.send({ type: "settings", settings: { count: 8, categories: ["food", "habit"] } });
  await waitUntil(() => A.state.settings["know-me"].count === 8, "know settings");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "answer", "know start");
  const knowTotal = A.game().total;
  for (let round = 0; round < knowTotal; round++) {
    const q = A.game().question;
    const answerFor = (offset) => {
      if (q.type === "choice") return (offset + round) % q.options.length;
      if (q.type === "scale") return 30 + offset * 20;
      return offset ? "guess" : "truth";
    };
    const hero = A.game().hero;
    const heroClient = hero === 0 ? A : B;
    const guessClient = hero === 0 ? B : A;
    heroClient.act({ type: "submit", answer: answerFor(1) });
    await sleep(70);
    assert(guessClient.game().submitted[hero], "hero submitted");
    guessClient.act({ type: "submit", answer: answerFor(2) });
    await waitUntil(() => heroClient.game().phase === "reveal", "know reveal");
    await sleep(950);
    heroClient.act({ type: "grade", score: 10 });
    await waitUntil(() => heroClient.game().phase === "revealed", "know graded");
    assert(heroClient.game().lastScore === 10, "know score");
    heroClient.act({ type: "next" });
    await waitUntil(
      () => (round + 1 >= knowTotal ? heroClient.game().phase === "over" : heroClient.game().idx === round + 1),
      "know next",
    );
  }
  await waitUntil(() => A.state.journal.length === 2, "know journal");
  assert(A.state.journal[1].data.pct === 100, "know pct");
  console.log("done: know-me flow + grading + journal");

  // ---------- draw-guess ----------
  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit know");
  A.send({ type: "select", gameId: "draw-guess" });
  await waitUntil(() => A.state.gameId === "draw-guess", "select draw");
  A.send({ type: "settings", settings: { rounds: 4, seconds: 60, libraries: ["daily"] } });
  await waitUntil(() => A.state.settings["draw-guess"].seconds === 60, "draw settings");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "choose", "draw choose");
  assert(A.game().choices.length === 3, "three words");
  A.act({ type: "choose", index: 0 });
  await waitUntil(() => A.game().phase === "drawing" && B.game().phase === "drawing", "drawing started");
  const answer = A.game().answer;
  const strokeId = "test-stroke-1";
  A.send({ type: "ink", run: A.state.game.run, data: { op: "start", id: strokeId, color: "#F05267", size: 10 } });
  A.send({
    type: "ink",
    run: A.state.game.run,
    data: { op: "points", id: strokeId, points: [100, 100, 200, 200, 300, 150] },
  });
  A.send({ type: "ink", run: A.state.game.run, data: { op: "end", id: strokeId } });
  await waitUntil(() => B.ink.some((d) => d.op === "points" && d.points.length === 6), "ink streamed");
  B.act({ type: "guess", text: "nope" });
  await waitUntil(() => B.game().guesses.length === 1, "wrong guess");
  B.act({ type: "guess", text: answer });
  await waitUntil(() => A.game().phase === "reveal", "draw reveal");
  assert(A.game().score > 0 && A.game().correct === true, "draw score");
  assert(A.game().guesses.some((g) => g.correct), "correct guess recorded");
  A.act({ type: "next" });
  await waitUntil(() => A.game().round === 1 && A.game().phase === "choose", "draw round 2");
  assert(A.game().drawer === 1, "drawer alternates");
  console.log("done: draw-guess choose / ink / guess / score");

  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit draw");

  // ---------- gomoku ----------
  A.send({ type: "select", gameId: "gomoku" });
  await waitUntil(() => A.state.gameId === "gomoku", "select gomoku");
  A.send({ type: "settings", settings: { first: "owner", wager: "milk tea" } });
  await sleep(120);
  const gomokuSettings = A.state.settings.gomoku;
  assert(gomokuSettings.first === "房主", "gomoku settings sanitized to default");
  A.send({ type: "settings", settings: { first: "房主", wager: "milk tea" } });
  await waitUntil(() => A.state.settings.gomoku.wager === "milk tea", "gomoku wager");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing", "gomoku start");
  assert(A.game().turn === 0, "gomoku first player");
  const seq = [
    [A, 0, 0],
    [B, 1, 0],
    [A, 0, 1],
    [B, 1, 1],
    [A, 0, 2],
    [B, 1, 2],
    [A, 0, 3],
    [B, 1, 3],
    [A, 0, 4],
  ];
  for (const [client, x, y] of seq) {
    client.act({ type: "place", x, y });
    await sleep(80);
  }
  await waitUntil(() => A.game().phase === "over", "gomoku over");
  assert(A.game().winner === 0 && A.game().line.length >= 5, "gomoku win + line");
  await waitUntil(() => A.state.journal.some((j) => j.gameId === "gomoku"), "gomoku journal");
  assert(A.state.stats.wins.gomoku[0] === 1, "gomoku stats");
  console.log("done: gomoku win / line / journal / stats");

  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing" && A.game().move === 0, "gomoku restart");
  A.act({ type: "place", x: 7, y: 7 });
  await waitUntil(() => B.game().turn === 1, "gomoku move");
  A.act({ type: "undo" });
  await waitUntil(() => B.game().pending?.kind === "undo", "undo request");
  B.act({ type: "accept" });
  await waitUntil(() => A.game().move === 0 && A.game().turn === 0 && !A.game().pending, "undo accepted");
  A.act({ type: "resign" });
  await waitUntil(() => A.game().phase === "over" && A.game().winner === 1, "resign");
  console.log("done: gomoku undo / resign");

  // ---------- talk cards ----------
  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit gomoku");
  A.send({ type: "select", gameId: "talk-cards" });
  await waitUntil(() => A.state.gameId === "talk-cards", "select talk");
  A.send({ type: "settings", settings: { deck: "轻松" } });
  await waitUntil(() => A.state.settings["talk-cards"].deck === "轻松", "talk settings");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "draw", "talk start");
  const turn = A.game().turn;
  const turnClient = turn === 0 ? A : B;
  const otherClient = turn === 0 ? B : A;
  otherClient.act({ type: "draw" });
  await sleep(150);
  assert(turnClient.game().phase === "draw", "wrong turn rejected");
  turnClient.act({ type: "draw" });
  await waitUntil(() => turnClient.game().phase === "shown" && turnClient.game().card, "talk drawn");
  assert(turnClient.game().flipAt > Date.now() - 1000, "flip timestamp");
  turnClient.act({ type: "fav" });
  await waitUntil(() => turnClient.game().favorites[turn].length === 1, "talk favorite");
  const firstCardId = turnClient.game().card.id;
  turnClient.act({ type: "reroll" });
  await waitUntil(
    () => turnClient.game().card.id !== firstCardId && turnClient.game().phase === "shown",
    "talk reroll",
  );
  const idxAfterReroll = turnClient.game().idx;
  turnClient.act({ type: "next" });
  await waitUntil(
    () => turnClient.game().idx === idxAfterReroll + 1 && turnClient.game().phase === "draw",
    "talk next",
  );
  const nextTurnClient = turn === 0 ? B : A;
  nextTurnClient.act({ type: "draw" });
  await waitUntil(() => nextTurnClient.game().phase === "shown", "talk second draw");
  nextTurnClient.act({ type: "finish" });
  await waitUntil(() => nextTurnClient.game().phase === "over", "talk over");
  await waitUntil(() => A.state.journal.some((j) => j.gameId === "talk-cards"), "talk journal");
  console.log("done: talk-cards draw / favorite / turn guard / finish");

  // ---------- 爱心跳棋 ----------
  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit talk");
  A.send({ type: "select", gameId: "checkers" });
  await waitUntil(() => A.state.gameId === "checkers", "select checkers");
  A.send({ type: "settings", settings: { first: "房主", mandatory: "必须吃子", wager: "milk tea" } });
  await waitUntil(() => A.state.settings.checkers.wager === "milk tea", "checkers settings");
  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing", "checkers start");
  assert(A.game().board.length === 64, "checkers board size");
  assert(A.game().board.filter((p) => p === 0).length === 12, "red pieces");
  assert(A.game().board.filter((p) => p === 1).length === 12, "blue pieces");
  assert(A.game().turn === 0, "checkers first player");
  assert(Object.keys(A.game().legal).length > 0, "checkers legal moves");

  const firstFrom = Number(Object.keys(A.game().legal)[0]);
  const firstMove = A.game().legal[firstFrom][0];
  A.act({ type: "move", from: firstFrom, to: firstMove.to });
  await waitUntil(() => A.game().turn === 1 && A.game().moveCount === 1, "checkers move");
  assert(A.game().board[firstMove.to] === 0, "checkers piece moved");

  const bFrom = Number(Object.keys(B.game().legal)[0]);
  const bMove = B.game().legal[bFrom][0];
  B.act({ type: "move", from: bFrom, to: bMove.to });
  await waitUntil(() => A.game().turn === 0 && A.game().moveCount === 2, "checkers counter move");

  B.act({ type: "draw" });
  await waitUntil(() => A.game().pending?.kind === "draw", "checkers draw request");
  A.act({ type: "accept" });
  await waitUntil(() => A.game().phase === "over" && A.game().draw === true, "checkers draw accepted");
  await waitUntil(() => A.state.journal.some((j) => j.gameId === "checkers"), "checkers journal");

  A.send({ type: "start" });
  await waitUntil(() => A.game()?.phase === "playing" && A.game().moveCount === 0, "checkers restart");
  A.act({ type: "resign" });
  await waitUntil(() => A.game().phase === "over" && A.game().winner === 1, "checkers resign");
  assert(A.state.stats.wins.checkers[1] === 1, "checkers stats");
  console.log("done: checkers move / draw / resign / stats");

  // ---------- reaction ----------
  A.send({ type: "reaction", emoji: "🫶" });
  await waitUntil(() => B.reactions.length === 1 && B.reactions[0] === "🫶", "reaction");
  console.log("done: reactions");

  // 断线重连：用同一个 token 回来，座位和纪念册都还在
  A.ws.close();
  await waitUntil(() => B.state.seats[0].connected === false, "presence offline");
  const A2 = connect(ticketA);
  await waitUntil(() => A2.state && A2.seat === 0, "reconnect welcome");
  assert(A2.state.seats[0].connected === true, "reconnected presence");
  assert(A2.state.journal.length >= 5, "journal survived reconnect");
  console.log("done: reconnect with token");

  // 错误的 token 会被拒绝
  const badCode = await new Promise((resolve) => {
    const bad = new WebSocket(`ws://127.0.0.1:${PORT}/ws?code=${ticketA.code}&token=nope`);
    bad.on("close", (code) => resolve(code));
    setTimeout(() => resolve(0), 3000);
  });
  assert(badCode === 4001, "bad token rejected");
  console.log("done: bad token rejected");

  A2.ws.close();
  B.ws.close();
  await sleep(100);
  console.log("\nALL SMOKE TESTS PASSED");
} catch (err) {
  console.error("\nSMOKE TEST FAILED:", err.message);
  process.exitCode = 1;
} finally {
  if (server) {
    server.kill();
    await sleep(300);
  }
}