import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { GAMES } from "./meta.mjs";
import {
  RoomError,
  attachSocket,
  broadcastEvent,
  broadcastState,
  cleanupRooms,
  createRoom,
  detachSocket,
  exitGame,
  findSeatByToken,
  getRoom,
  handleAction,
  joinRoom,
  publicInfo,
  sanitizeProfile,
  selectGame,
  setProfile,
  setSettings,
  snapshot,
  startGame,
  tickRooms,
} from "./rooms.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8790;
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
app.use(express.json({ limit: "512kb" }));
app.disable("x-powered-by");

app.get("/api/health", (req, res) => {
  res.json({ ok: true, games: GAMES.length, uptime: Math.round(process.uptime()) });
});

function lanUrls() {
  const urls = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VMware|VirtualBox|Docker|Loopback|WSL/i.test(name)) continue;
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) urls.push(`http://${net.address}:${PORT}`);
    }
  }
  const rank = (u) => {
    if (/\/\/192\.168\./.test(u)) return 0;
    if (/\/\/10\./.test(u)) return 1;
    if (/\/\/172\.(1[6-9]|2\d|3[01])\./.test(u)) return 2;
    return 3;
  };
  return urls.sort((a, b) => rank(a) - rank(b));
}

app.get("/api/config", (req, res) => {
  res.json({
    publicUrl: process.env.PUBLIC_URL || null,
    lanUrls: lanUrls(),
  });
});

app.get("/api/games", (req, res) => {
  res.json({ games: GAMES });
});

app.post("/api/rooms", (req, res, next) => {
  try {
    const profile = sanitizeProfile(req.body?.profile);
    const { room, seat, token } = createRoom(profile);
    res.json({ code: room.code, seat, token, state: snapshot(room) });
  } catch (err) {
    next(err);
  }
});

app.post("/api/rooms/:code/join", (req, res, next) => {
  try {
    const profile = sanitizeProfile(req.body?.profile);
    const { room, seat, token } = joinRoom(req.params.code, profile);
    broadcastState(room);
    res.json({ code: room.code, seat, token, state: snapshot(room) });
  } catch (err) {
    next(err);
  }
});

app.get("/api/rooms/:code", (req, res, next) => {
  try {
    const info = publicInfo(req.params.code);
    if (!info) throw new RoomError("ROOM_NOT_FOUND", "房间不存在或已经过期啦", 404);
    res.json(info);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof RoomError) {
    res.status(err.status).json({ code: err.code, message: err.message });
  } else if (err?.type === "entity.parse.failed") {
    res.status(400).json({ code: "BAD_JSON", message: "请求格式不太对，再试一次吧" });
  } else {
    console.error(err);
    res.status(500).json({ code: "INTERNAL", message: "服务开小差了，稍后再试一次吧" });
  }
});

const server = http.createServer(app);

// ---------- 静态文件（生产模式：vite build 之后的 dist） ----------
const dist = path.join(__dirname, "..", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/api") return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

// ---------- 实时房间 ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

server.on("upgrade", (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const code = String(url.searchParams.get("code") || "").toUpperCase();
  const token = String(url.searchParams.get("token") || "");
  const room = getRoom(code);
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (!room) {
      ws.close(4004, "ROOM_NOT_FOUND");
      return;
    }
    const seat = findSeatByToken(room, token);
    if (seat < 0) {
      ws.close(4001, "BAD_TOKEN");
      return;
    }
    wss.emit("connection", ws, req, { room, seat });
  });
});

wss.on("connection", (ws, req, { room, seat }) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  attachSocket(room, seat, ws);
  ws.send(JSON.stringify({ type: "welcome", seat, state: snapshot(room, { includeInk: true }) }));
  broadcastState(room);

  const limiter = { start: Date.now(), count: 0 };
  const allow = () => {
    const now = Date.now();
    if (now - limiter.start > 5000) {
      limiter.start = now;
      limiter.count = 0;
    }
    limiter.count++;
    return limiter.count <= 320;
  };

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== "string") return;
    try {
      switch (msg.type) {
        case "ping": {
          ws.send(JSON.stringify({ type: "pong", t: msg.t, now: Date.now() }));
          return;
        }
        case "refresh": {
          ws.send(JSON.stringify({ type: "state", state: snapshot(room, { includeInk: true }) }));
          return;
        }
        case "profile": {
          if (!allow()) return;
          setProfile(room, seat, msg.profile);
          broadcastState(room);
          return;
        }
        case "select": {
          if (!allow()) return;
          selectGame(room, seat, msg.gameId);
          broadcastState(room);
          return;
        }
        case "settings": {
          if (!allow()) return;
          setSettings(room, seat, msg.settings || {});
          broadcastState(room);
          return;
        }
        case "start": {
          if (!allow()) return;
          startGame(room, seat);
          broadcastState(room);
          return;
        }
        case "exit": {
          if (!allow()) return;
          exitGame(room, seat);
          broadcastState(room);
          return;
        }
        case "action": {
          if (!allow()) return;
          const gameId = room.game?.id;
          const actionType = msg.action?.type;
          handleAction(room, seat, msg.action || {});
          broadcastState(room);
          if (gameId === "draw-guess" && ["choose", "undo", "clear", "next"].includes(actionType)) {
            sendInkSync(room);
          }
          return;
        }
        case "ink": {
          if (!allow()) return;
          const data = msg.data;
          if (!acceptInk(room, seat, msg.run, data)) return;
          broadcastEvent(room, { type: "ink", seat, run: msg.run, data }, seat);
          return;
        }
        case "reaction": {
          if (!allow()) return;
          const emoji = String(msg.emoji || "").slice(0, 8);
          if (!emoji) return;
          broadcastEvent(room, { type: "reaction", seat, emoji, at: Date.now() });
          return;
        }
        default:
          return;
      }
    } catch (err) {
      if (err instanceof RoomError) {
        ws.send(JSON.stringify({ type: "error", code: err.code, message: err.message }));
      } else {
        console.error("ws message error", err);
        ws.send(JSON.stringify({ type: "error", code: "INTERNAL", message: "刚才那一步没成功，再试一次吧" }));
      }
    }
  });

  ws.on("close", () => {
    detachSocket(room, seat, ws);
    broadcastState(room);
  });
  ws.on("error", () => {});
});

function acceptInk(room, seat, run, data) {
  const game = room.game;
  if (!game || game.id !== "draw-guess" || game.run !== run) return false;
  const d = game.data;
  if (d.phase !== "drawing" || d.drawer !== seat) return false;
  if (!data || typeof data !== "object") return false;
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(data.color || "") ? data.color : "#292B3D";
  const safeSize = Math.max(1, Math.min(40, Number(data.size) || 8));
  if (data.op === "start") {
    if (typeof data.id !== "string" || data.id.length > 64) return false;
    if (d.strokes.length >= 900) return false;
    d.strokes.push({ id: data.id, color: safeColor, size: safeSize, points: [] });
    return true;
  }
  if (data.op === "points") {
    const stroke = d.strokes.find((s) => s.id === data.id);
    if (!stroke || !Array.isArray(data.points)) return false;
    if (data.points.length > 400) return false;
    let total = 0;
    for (const s of d.strokes) total += s.points.length;
    if (total > 60000) return false;
    for (let i = 0; i < data.points.length; i += 2) {
      const x = Math.max(0, Math.min(1000, Math.round(Number(data.points[i]))));
      const y = Math.max(0, Math.min(1000, Math.round(Number(data.points[i + 1]))));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      stroke.points.push(x, y);
    }
    return true;
  }
  if (data.op === "end") return true;
  return false;
}

function sendInkSync(room) {
  if (room.game?.id !== "draw-guess") return;
  const strokes = room.game.data.strokes || [];
  const payload = JSON.stringify({ type: "ink-sync", run: room.game.run, strokes });
  for (const s of room.seats) {
    if (s.ws && s.ws.readyState === 1) s.ws.send(payload);
  }
}

// 定时推进有倒计时的游戏
const tickTimer = setInterval(() => {
  const changed = tickRooms();
  for (const room of changed) {
    broadcastState(room);
    if (room.game?.id === "draw-guess") sendInkSync(room);
  }
}, 400);

// 心跳
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, 30000);

const cleaner = setInterval(cleanupRooms, 10 * 60 * 1000);

server.listen(PORT, HOST, () => {
  console.log("\n  二人世界 · 服务已启动");
  console.log(`  ➜  本机:   http://localhost:${PORT}`);
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|VMware|VirtualBox|Docker|Loopback|WSL/i.test(name)) continue;
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`  ➜  同一 WiFi (${name}): http://${net.address}:${PORT}`);
      }
    }
  }
  if (!fs.existsSync(dist)) {
    console.log("  ➜  开发模式请另开一个终端运行 npm run dev:client (Vite 5173)");
  }
  console.log("");
});

function shutdown() {
  clearInterval(tickTimer);
  clearInterval(heartbeat);
  clearInterval(cleaner);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);