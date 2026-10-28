// 冒烟测试共用工具。游戏模块 scripts/smoke/<id>.mjs 只 import 这里的工具 + 自己一个文件里的流程，
// 不碰任何别的游戏，也不碰 scripts/smoke.mjs。
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";

export const PORT = Number(process.env.SMOKE_PORT) || 18790;
export const BASE = `http://127.0.0.1:${PORT}`;
export const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "duo-smoke-"));

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitUntil(fn, label = "", timeout = 8000) {
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

export async function api(path, options = {}) {
  const res = await fetch(BASE + "/api/" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

export function connect(ticket) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?code=${ticket.code}`);
  const client = {
    ws,
    seat: null,
    state: null,
    errors: [],
    ink: [],
    inkSyncs: [],
    reactions: [],
  };
  ws.on("open", () => {
    ws.send(JSON.stringify({ type: "auth", token: ticket.token }));
  });
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

export function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

/** 起一台测试服务器，返回 kill 函数。 */
export async function startServer() {
  const server = spawn(process.execPath, ["server/index.mjs"], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR },
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
  return server;
}

export function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || server.exitCode !== null) {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
      resolve();
      return;
    }
    server.on("exit", () => {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
      resolve();
    });
    server.kill();
    setTimeout(resolve, 1500);
  });
}

/** 两个客户端：选游戏、开始、等开局。模块里直接用它，省得每个文件重复。 */
export async function enterGame({ A, B, waitUntil, gameId, settings, ready, startLabel = "start" }) {
  A.send({ type: "exit" });
  await waitUntil(() => !A.state.game, "exit previous game");
  A.send({ type: "select", gameId });
  await waitUntil(() => A.state.gameId === gameId && B.state.gameId === gameId, `select ${gameId}`);
  if (settings) {
    A.send({ type: "settings", settings });
    await waitUntil(() => settingsKeyReady(A, gameId, settings), `settings ${gameId}`);
  }
  A.send({ type: "start" });
  if (ready) {
    await waitUntil(() => ready(), startLabel || `${gameId} start`);
  } else {
    await waitUntil(() => A.game()?.phase, `${gameId} start`);
  }
}

function settingsKeyReady(A, gameId, settings) {
  const current = A.state.settings?.[gameId] || {};
  return Object.keys(settings).every((k) => {
    const want = settings[k];
    const have = current[k];
    if (Array.isArray(want)) {
      return Array.isArray(have) && JSON.stringify(have) === JSON.stringify(want);
    }
    return have === want;
  });
}

/** 在纪念册里找到这一局的记录（模块里用，避免依赖别的游戏先跑）。 */
export function findJournal(client, gameId) {
  return (client.state?.journal || []).find((j) => j.gameId === gameId) || null;
}
