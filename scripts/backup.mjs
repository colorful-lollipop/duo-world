// 数据备份：把当前的持久化文件快照到 data/backups/，并做保留策略。
//
// 用法：
//   node scripts/backup.mjs            # 备份一次
//   node scripts/backup.mjs --verify   # 备份后打开副本，数一下行数
//   DATA_DIR=/opt/duo-world/data BACKUP_KEEP=30 node scripts/backup.mjs
//
// 设计要点：
// - SQLite 走 WAL，直接拷 .db 可能漏掉还没 checkpoint 的事务，所以先 wal_checkpoint(TRUNCATE) 再拷。
// - 副本用 copyFileSync（不压缩）：出问题时能直接用 sqlite3 / 任意 SQLite 工具打开。
// - 保留最近 BACKUP_KEEP 份（默认 14），旧的自动删。
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, "duo.db");
const JSON_FILE = path.join(DATA_DIR, "store.json");
const OUT_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, "backups");
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14);
const VERIFY = process.argv.includes("--verify");

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function loadSqlite() {
  try {
    return require("node:sqlite");
  } catch {
    return null;
  }
}

function checkpointSqlite(file) {
  const sqlite = loadSqlite();
  if (!sqlite) return "skipped (no node:sqlite)";
  const db = new sqlite.DatabaseSync(file);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    return "ok";
  } finally {
    db.close();
  }
}

function countRows(file) {
  const sqlite = loadSqlite();
  if (!sqlite) return null;
  const db = new sqlite.DatabaseSync(file);
  const count = (table) => {
    try {
      return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    } catch {
      return -1;
    }
  };
  const out = {
    rooms: count("rooms"),
    journal: count("journal"),
    seats: count("room_seats"),
    stats: count("room_stats"),
  };
  db.close();
  return out;
}

function prune(dir, prefix) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const dead = files.slice(KEEP);
  for (const d of dead) fs.rmSync(path.join(dir, d.f), { force: true });
  return { kept: Math.min(files.length, KEEP), removed: dead.length };
}

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const hasDb = fs.existsSync(DB_FILE);
  const hasJson = fs.existsSync(JSON_FILE);
  if (!hasDb && !hasJson) {
    console.error(`没有找到数据文件（${DB_FILE} 或 ${JSON_FILE}），是不是还没跑过服务？`);
    process.exit(1);
  }

  const result = { at: new Date().toISOString(), dataDir: DATA_DIR, outDir: OUT_DIR, files: [] };

  if (hasDb) {
    result.checkpoint = checkpointSqlite(DB_FILE);
    const target = path.join(OUT_DIR, `duo-${stamp()}.db`);
    fs.copyFileSync(DB_FILE, target);
    // WAL 侧车文件一起带上，恢复时更保险
    for (const ext of ["-wal", "-shm"]) {
      if (fs.existsSync(DB_FILE + ext)) fs.copyFileSync(DB_FILE + ext, target + ext);
    }
    const size = fs.statSync(target).size;
    result.files.push({ file: path.basename(target), bytes: size, kind: "sqlite" });
    if (VERIFY) result.verify = countRows(target);
  }

  if (hasJson) {
    const target = path.join(OUT_DIR, `store-${stamp()}.json`);
    fs.copyFileSync(JSON_FILE, target);
    result.files.push({ file: path.basename(target), bytes: fs.statSync(target).size, kind: "json" });
    if (VERIFY) {
      const data = JSON.parse(fs.readFileSync(target, "utf8"));
      result.verify = {
        rooms: Object.keys(data.rooms || {}).length,
        journal: (data.journal || []).length,
        seats: Object.keys(data.seats || {}).length,
      };
    }
  }

  const a = prune(OUT_DIR, "duo-");
  const b = prune(OUT_DIR, "store-");
  result.retention = { kept: a.kept + b.kept, removed: a.removed + b.removed };
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error("备份失败：" + (err?.message || err));
  process.exit(1);
}
