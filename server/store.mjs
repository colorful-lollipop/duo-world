// server/store.mjs
// 极简持久化层：优先 node:sqlite（Node >= 22.13 无需 flag），不可用时回退 JSON 文件。
// 负责：房间热状态、纪念册、座位 token（用于房间过期后仍可查看历史）、战绩。
// 数据目录默认 <repo>/data，可用 DATA_DIR / DB_FILE 环境变量覆盖。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { log } from "./observability.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "duo.db");
const JSON_FILE = path.join(DATA_DIR, "store.json");

let sqlite = null;
let jsonData = null;
let backendKind = "none";
let jsonWriteTimer = null;

function ensure() {
  if (backendKind !== "none") return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const mod = require("node:sqlite");
    sqlite = new mod.DatabaseSync(DB_FILE);
    sqlite.exec("PRAGMA journal_mode = WAL;");
    sqlite.exec("PRAGMA busy_timeout = 3000;");
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        room_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS journal (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        game_id TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        data_json TEXT,
        played_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS journal_code_time ON journal(code, played_at DESC);
      CREATE TABLE IF NOT EXISTS room_seats (
        code TEXT NOT NULL,
        seat INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        nickname TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (code, seat)
      );
      CREATE TABLE IF NOT EXISTS room_stats (
        code TEXT PRIMARY KEY,
        stats_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    backendKind = "sqlite";
  } catch (err) {
    backendKind = "json";
    jsonData = { rooms: {}, journal: [], seats: {}, stats: {} };
    if (fs.existsSync(JSON_FILE)) {
      try {
        jsonData = JSON.parse(fs.readFileSync(JSON_FILE, "utf8")) || jsonData;
      } catch {
        log("warn", "store_json_corrupt", { file: JSON_FILE });
      }
    }
  }
  log("info", "store_open", { kind: backendKind, dir: DATA_DIR });
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function stripWs(room) {
  const seats = room.seats.map((s) => {
    const copy = { ...s };
    delete copy.ws;
    return copy;
  });
  return { ...room, seats };
}

function writeJsonSoon() {
  if (backendKind !== "json") return;
  if (jsonWriteTimer) clearTimeout(jsonWriteTimer);
  jsonWriteTimer = setTimeout(writeJsonNow, 60);
}

function writeJsonNow() {
  if (backendKind !== "json") return;
  jsonWriteTimer = null;
  const tmp = JSON_FILE + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(jsonData));
    fs.renameSync(tmp, JSON_FILE);
  } catch (err) {
    log("warn", "store_json_write_failed", { error: String(err?.message || err) });
  }
}

// ---------- rooms ----------

export function saveRoom(room, expiresAt) {
  ensure();
  const row = JSON.stringify(stripWs(room));
  const now = Date.now();
  if (backendKind === "sqlite") {
    sqlite
      .prepare(
        `INSERT INTO rooms(code, room_json, created_at, updated_at, expires_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(code) DO UPDATE SET room_json=excluded.room_json, updated_at=excluded.updated_at, expires_at=excluded.expires_at`,
      )
      .run(room.code, row, room.createdAt || now, now, expiresAt || now);
  } else {
    jsonData.rooms[room.code] = { room_json: row, created_at: room.createdAt || now, updated_at: now };
    writeJsonSoon();
  }
}

export function deleteRoom(code) {
  ensure();
  if (backendKind === "sqlite") {
    sqlite.prepare("DELETE FROM rooms WHERE code=?").run(code);
  } else {
    delete jsonData.rooms[code];
    writeJsonSoon();
  }
}

export function loadRooms() {
  ensure();
  if (backendKind === "sqlite") {
    const rows = sqlite.prepare("SELECT code, room_json FROM rooms").all();
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.room_json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
  return Object.values(jsonData.rooms)
    .map((r) => {
      try {
        return JSON.parse(r.room_json);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// ---------- journal（纪念册） ----------

export function appendJournal(entry) {
  ensure();
  if (backendKind === "sqlite") {
    sqlite
      .prepare(
        `INSERT OR IGNORE INTO journal(id, code, game_id, title, detail, data_json, played_at)
         VALUES(?,?,?,?,?,?,?)`,
      )
      .run(entry.id, entry.code, entry.gameId, entry.title, entry.detail, entry.data ? JSON.stringify(entry.data) : null, entry.at);
  } else {
    // 和 sqlite 的 INSERT OR IGNORE 保持一致：同 id 只留第一条
    if (!jsonData.journal.some((j) => j.id === entry.id)) {
      jsonData.journal.push({ ...entry, data_json: entry.data ? JSON.stringify(entry.data) : null });
    }
    if (jsonData.journal.length > 5000) jsonData.journal = jsonData.journal.slice(-5000);
    writeJsonSoon();
  }
}

export function listJournal(code, limit = 200) {
  ensure();
  if (backendKind === "sqlite") {
    const rows = sqlite
      .prepare("SELECT id, game_id, title, detail, data_json, played_at FROM journal WHERE code=? ORDER BY played_at DESC LIMIT ?")
      .all(code, limit);
    return rows.map((r) => ({
      id: r.id,
      gameId: r.game_id,
      title: r.title,
      detail: r.detail,
      data: r.data_json ? JSON.parse(r.data_json) : null,
      at: r.played_at,
    }));
  }
  return jsonData.journal
    .filter((j) => j.code === code)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((j) => ({
      id: j.id,
      gameId: j.gameId,
      title: j.title,
      detail: j.detail,
      data: j.data ?? (j.data_json ? JSON.parse(j.data_json) : null),
      at: j.at,
    }));
}

// ---------- 座位 token（房间过期后仍能验证身份看历史） ----------

export function saveSeat(code, seat, token, nickname) {
  ensure();
  const hash = sha256(token);
  const now = Date.now();
  if (backendKind === "sqlite") {
    sqlite
      .prepare(
        `INSERT INTO room_seats(code, seat, token_hash, nickname, updated_at)
         VALUES(?,?,?,?,?)
         ON CONFLICT(code, seat) DO UPDATE SET token_hash=excluded.token_hash, nickname=excluded.nickname, updated_at=excluded.updated_at`,
      )
      .run(code, seat, hash, nickname || "", now);
  } else {
    if (!jsonData.seats[code]) jsonData.seats[code] = {};
    jsonData.seats[code][seat] = { token_hash: hash, nickname: nickname || "", updated_at: now };
    writeJsonSoon();
  }
}

export function findSeatByToken(code, token) {
  ensure();
  if (!token) return -1;
  const hash = sha256(token);
  if (backendKind === "sqlite") {
    const row = sqlite.prepare("SELECT seat FROM room_seats WHERE code=? AND token_hash=?").get(code, hash);
    return row ? row.seat : -1;
  }
  const seats = jsonData.seats[code];
  if (!seats) return -1;
  for (const [seat, info] of Object.entries(seats)) {
    if (info.token_hash === hash) return Number(seat);
  }
  return -1;
}

// ---------- 战绩 ----------

export function saveStats(code, stats) {
  ensure();
  if (backendKind === "sqlite") {
    sqlite
      .prepare(
        `INSERT INTO room_stats(code, stats_json, updated_at) VALUES(?,?,?)
         ON CONFLICT(code) DO UPDATE SET stats_json=excluded.stats_json, updated_at=excluded.updated_at`,
      )
      .run(code, JSON.stringify(stats || {}), Date.now());
  } else {
    jsonData.stats[code] = { stats_json: JSON.stringify(stats || {}), updated_at: Date.now() };
    writeJsonSoon();
  }
}

export function getStats(code) {
  ensure();
  if (backendKind === "sqlite") {
    const row = sqlite.prepare("SELECT stats_json FROM room_stats WHERE code=?").get(code);
    if (!row) return null;
    try {
      return JSON.parse(row.stats_json);
    } catch {
      return null;
    }
  }
  const s = jsonData.stats[code];
  return s ? JSON.parse(s.stats_json) : null;
}

// ---------- 收尾 ----------

export function flushStore() {
  if (backendKind === "sqlite" && sqlite) {
    try {
      sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {}
  }
  if (backendKind === "json") writeJsonNow();
}

export function closeStore() {
  flushStore();
  if (sqlite) {
    try {
      sqlite.close();
    } catch {}
  }
  sqlite = null;
}

export function storeInfo() {
  return { kind: backendKind, file: backendKind === "sqlite" ? DB_FILE : JSON_FILE };
}
