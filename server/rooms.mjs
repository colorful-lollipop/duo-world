import crypto from "node:crypto";
import { GAME_MAP, allDefaultSettings, sanitizeSettings } from "./meta.mjs";
import { games } from "./games/index.mjs";
import { inc, incTicks } from "./observability.mjs";
import {
  appendJournal,
  deleteRoom,
  findSeatByToken as storeFindSeat,
  flushStore,
  getStats,
  listJournal,
  loadRooms,
  purgeRoom as storePurgeRoom,
  saveRoom,
  saveSeat,
  saveStats,
} from "./store.mjs";

export const AVATARS = [
  "bunny",
  "bear",
  "cat",
  "dog",
  "fox",
  "penguin",
  "pig",
  "mouse",
  "elephant",
  "hippo",
  "boar",
  "donkey",
  "cow",
];
export const COLORS = ["#FF6B6B", "#4D9DFF", "#2EC4A6", "#FFC93C", "#9B7BFF", "#FF9A76"];
export const MOODS = ["normal", "joy", "wow", "sad", "sleep"];

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const ROOM_TTL = 12 * 60 * 60 * 1000;
const MAX_ROOMS = 5000;
const SAVE_DEBOUNCE = 2000;
const rooms = new Map();
const saveTimers = new Map();

export class RoomError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function makeCode() {
  let code = "";
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

export function sanitizeProfile(input) {
  if (!input || typeof input !== "object") throw new RoomError("BAD_PROFILE", "先告诉 TA 怎么称呼你吧", 400);
  let nickname = String(input.nickname || "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, 12);
  if (!nickname) throw new RoomError("BAD_PROFILE", "昵称不能空着哦", 400);
  const avatar = AVATARS.includes(input.avatar) ? input.avatar : AVATARS[0];
  const color = COLORS.includes(input.color) ? input.color : COLORS[0];
  const mood = MOODS.includes(input.mood) ? input.mood : "joy";
  return { nickname, avatar, color, mood };
}

function makeSeat(profile, token) {
  return {
    profile,
    token,
    joinedAt: Date.now(),
    ws: null,
    lastSeen: Date.now(),
  };
}

// ---------- 持久化：房间热状态防抖落盘，纪念册/座位/战绩同步写 ----------

function persistRoom(room) {
  try {
    saveRoom(room, Date.now() + ROOM_TTL);
  } catch {}
}

function saveSeatsFor(room) {
  room.seats.forEach((s, i) => {
    if (s.token && s.profile) {
      try {
        saveSeat(room.code, i, s.token, s.profile.nickname);
      } catch {}
    }
  });
}

function markDirty(room) {
  if (!room?.code) return;
  const running = saveTimers.get(room.code);
  if (running) clearTimeout(running);
  saveTimers.set(
    room.code,
    setTimeout(() => {
      saveTimers.delete(room.code);
      const live = rooms.get(room.code);
      if (live) persistRoom(live);
    }, SAVE_DEBOUNCE),
  );
}

function clearDirty(code) {
  const running = saveTimers.get(code);
  if (running) clearTimeout(running);
  saveTimers.delete(code);
}

export function createRoom(profile) {
  if (rooms.size >= MAX_ROOMS) {
    // 清掉最久没动的房间，给新房间腾位置
    const oldest = [...rooms.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (oldest) {
      clearDirty(oldest.code);
      rooms.delete(oldest.code);
      deleteRoom(oldest.code);
    }
  }
  const code = makeCode();
  const token = crypto.randomUUID();
  const now = Date.now();
  const room = {
    code,
    createdAt: now,
    updatedAt: now,
    version: 0,
    seats: [makeSeat(profile, token), { profile: null, token: null, joinedAt: 0, ws: null, lastSeen: 0 }],
    settings: allDefaultSettings(),
    gameId: "draw-guess",
    game: null,
    journal: [],
    stats: { wins: {} },
    seenCids: [],
  };
  rooms.set(code, room);
  inc("rooms_created_total");
  saveSeatsFor(room);
  persistRoom(room);
  return { room, seat: 0, token };
}

export function getRoom(code) {
  return rooms.get(String(code || "").toUpperCase()) || null;
}

export function joinRoom(code, profile) {
  const room = getRoom(code);
  if (!room) throw new RoomError("ROOM_NOT_FOUND", "房间不存在或已经过期啦", 404);
  let seat = room.seats.findIndex((s) => !s.profile);
  if (seat < 0) throw new RoomError("ROOM_FULL", "这个房间已经有两个人啦", 409);
  const token = crypto.randomUUID();
  room.seats[seat] = makeSeat(profile, token);
  touch(room);
  try {
    saveSeat(room.code, seat, token, profile.nickname);
  } catch {}
  return { room, seat, token };
}

export function findSeatByToken(room, token) {
  if (!token) return -1;
  return room.seats.findIndex((s) => s.token && s.token === token);
}

export function publicInfo(code) {
  const room = getRoom(code);
  if (!room) return null;
  return {
    code: room.code,
    full: room.seats.every((s) => s.profile),
    gameId: room.gameId,
    seats: room.seats.map((s) => ({
      nickname: s.profile?.nickname || null,
      avatar: s.profile?.avatar || null,
      color: s.profile?.color || null,
      mood: s.profile?.mood || null,
    })),
  };
}

export function touch(room) {
  room.updatedAt = Date.now();
  room.version++;
  markDirty(room);
}

export function attachSocket(room, seat, ws) {
  const old = room.seats[seat].ws;
  if (old && old !== ws && old.readyState === 1) {
    try {
      old.close(4002, "REPLACED");
    } catch {}
  }
  room.seats[seat].ws = ws;
  room.seats[seat].lastSeen = Date.now();
  touch(room);
}

export function detachSocket(room, seat, ws) {
  if (room.seats[seat]?.ws === ws) {
    room.seats[seat].ws = null;
    room.seats[seat].lastSeen = Date.now();
    touch(room);
  }
}

export function snapshot(room, { includeInk = false } = {}) {
  let game = null;
  if (room.game) {
    const data = room.game.data;
    let wireData = data;
    if (room.game.id === "draw-guess" && !includeInk) {
      const { strokes, ...rest } = data;
      wireData = { ...rest, strokeCount: strokes.length };
    }
    game = {
      id: room.game.id,
      run: room.game.run,
      startedAt: room.game.startedAt,
      endedAt: room.game.endedAt || 0,
      journaled: !!room.game.journaled,
      data: wireData,
    };
  }
  return {
    code: room.code,
    seats: room.seats.map((s) => ({
      profile: s.profile,
      connected: !!s.ws && s.ws.readyState === 1,
      joinedAt: s.joinedAt,
    })),
    gameId: room.gameId,
    game,
    settings: room.settings,
    journal: room.journal.slice(-30),
    stats: room.stats,
    now: Date.now(),
    version: room.version,
  };
}

export function broadcastState(room) {
  const payload = JSON.stringify({ type: "state", state: snapshot(room) });
  for (const s of room.seats) {
    if (s.ws && s.ws.readyState === 1) s.ws.send(payload);
  }
}

export function broadcastEvent(room, event, exceptSeat = -1) {
  const payload = JSON.stringify(event);
  room.seats.forEach((s, i) => {
    if (i !== exceptSeat && s.ws && s.ws.readyState === 1) s.ws.send(payload);
  });
}

export function sendToSeat(room, seat, event) {
  const ws = room.seats[seat]?.ws;
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(event));
}

export function setProfile(room, seat, profile) {
  room.seats[seat].profile = sanitizeProfile(profile);
  touch(room);
  try {
    saveSeat(room.code, seat, room.seats[seat].token, room.seats[seat].profile.nickname);
  } catch {}
}

export function setSettings(room, seat, patch) {
  if (room.game && room.game.data.phase !== "over") throw new RoomError("PLAYING", "游戏进行中不能改设置哦");
  room.settings[room.gameId] = sanitizeSettings(room.gameId, patch, room.settings[room.gameId] || {});
  touch(room);
}

export function selectGame(room, seat, gameId) {
  if (!GAME_MAP[gameId]) throw new RoomError("UNAVAILABLE", "这个游戏还在准备中");
  if (room.game && room.game.data.phase !== "over") throw new RoomError("PLAYING", "先结束这一局再换游戏吧");
  room.gameId = gameId;
  room.game = null;
  touch(room);
}

export function startGame(room, seat) {
  if (!room.seats[0].profile || !room.seats[1].profile) {
    throw new RoomError("NEED_PARTNER", "等 TA 进来再开始吧");
  }
  if (room.game && room.game.data.phase !== "over") throw new RoomError("PLAYING", "这一局还没结束呢");
  const id = room.gameId;
  const mod = games[id];
  if (!mod) throw new RoomError("UNAVAILABLE", "这个游戏还在准备中");
  const settings = sanitizeSettings(id, room.settings[id], room.settings[id] || {});
  room.settings[id] = settings;
  const data = mod.create(room);
  room.game = { id, run: crypto.randomUUID(), startedAt: Date.now(), data, journaled: false };
  inc("games_started_total");
  touch(room);
}

export function exitGame(room, seat) {
  if (!room.game) return;
  room.game = null;
  touch(room);
}

export function finalizeIfOver(room) {
  if (!room.game || room.game.journaled) return false;
  if (room.game.data.phase !== "over") return false;
  const mod = games[room.game.id];
  const summary = mod?.summary?.(room) || { title: GAME_MAP[room.game.id]?.name || "一起玩过", detail: "" };
  room.game.journaled = true;
  room.game.endedAt = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    gameId: room.game.id,
    title: summary.title,
    detail: summary.detail,
    data: summary.data || null,
    at: room.game.endedAt,
  };
  room.journal.push({ ...entry, code: room.code });
  if (room.journal.length > 50) room.journal.shift();
  inc("journal_entries_total");
  touch(room);
  try {
    appendJournal({ ...entry, code: room.code });
    saveStats(room.code, room.stats);
  } catch {}
  return true;
}

export function handleAction(room, seat, action) {
  if (!room.game) throw new RoomError("NO_GAME", "还没有开始游戏哦");
  const mod = games[room.game.id];
  if (!mod) throw new RoomError("UNAVAILABLE", "这个游戏还在准备中");
  if (room.game.data.phase === "over") throw new RoomError("OVER", "这一局已经结束啦，回大厅再开一局吧");
  const err = mod.action(room, seat, action, Date.now());
  if (err) throw new RoomError("INVALID", err);
  finalizeIfOver(room);
  touch(room);
}

export function tickRooms() {
  const now = Date.now();
  const changed = [];
  for (const room of rooms.values()) {
    if (!room.game) continue;
    const mod = games[room.game.id];
    if (!mod?.tick) continue;
    let did = false;
    try {
      did = mod.tick(room, now);
    } catch {}
    if (did) {
      finalizeIfOver(room);
      touch(room);
      incTicks();
      changed.push(room);
    }
  }
  return changed;
}

export function roomCount() {
  return rooms.size;
}

export function cleanupRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyOnline = room.seats.some((s) => s.ws && s.ws.readyState === 1);
    if (!anyOnline && now - room.updatedAt > ROOM_TTL) {
      clearDirty(code);
      rooms.delete(code);
      try {
        deleteRoom(code);
      } catch {}
    }
  }
}

/**
 * 启动时把落盘的房间捞回内存（座位连接状态重置，token 保留，客户端会自己重连）。
 * 纪念册 / 座位 token / 战绩不会删，房间过期后仍然能查历史。
 */
export function rehydrate() {
  const now = Date.now();
  let restored = 0;
  for (const raw of loadRooms()) {
    try {
      if (!raw || !raw.code || !Array.isArray(raw.seats) || raw.seats.length !== 2) continue;
      if (raw.updatedAt && now - raw.updatedAt > ROOM_TTL) {
        try {
          deleteRoom(raw.code);
        } catch {}
        continue;
      }
      raw.seats = raw.seats.map((s) => ({ ...s, ws: null }));
      if (!raw.stats || typeof raw.stats !== "object") raw.stats = { wins: {} };
      if (!Array.isArray(raw.journal)) raw.journal = [];
      if (!Array.isArray(raw.seenCids)) raw.seenCids = [];
      if (!raw.settings || typeof raw.settings !== "object") raw.settings = allDefaultSettings();
      rooms.set(raw.code, raw);
      restored++;
    } catch {}
  }
  return restored;
}

/**
 * 历史战绩查询：房间还在时用内存 token 校验，房间过期后用落盘的 token 哈希校验。
 * 只有这间小屋自己的两个人能看。
 */
export function historyFor(code, token) {
  const c = String(code || "").toUpperCase();
  const room = rooms.get(c);
  let seat = room ? findSeatByToken(room, token) : -1;
  if (seat < 0) {
    try {
      seat = storeFindSeat(c, token);
    } catch {
      seat = -1;
    }
  }
  if (seat < 0) throw new RoomError("FORBIDDEN", "这些回忆只有小屋里的两个人能看到哦", 403);

  const entries = listJournal(c, 500);
  if (room) {
    // 兜底：把还没落盘的内存条目也带上
    const byId = new Map(entries.map((e) => [e.id, e]));
    for (const e of room.journal) {
      if (!byId.has(e.id)) byId.set(e.id, { id: e.id, gameId: e.gameId, title: e.title, detail: e.detail, data: e.data || null, at: e.at });
    }
    entries.splice(0, entries.length, ...[...byId.values()].sort((a, b) => b.at - a.at));
  }
  let wins = room?.stats?.wins;
  if (!wins) {
    try {
      wins = getStats(c)?.wins;
    } catch {
      wins = null;
    }
  }
  return { code: c, alive: !!room, entries, stats: { wins: wins || {} } };
}

/** 进程退出前把所有脏房间写盘。 */
export function flushPersistence() {
  for (const [code, timer] of saveTimers) {
    clearTimeout(timer);
    const room = rooms.get(code);
    if (room) persistRoom(room);
  }
  saveTimers.clear();
  for (const room of rooms.values()) {
    try {
      saveStats(room.code, room.stats);
    } catch {}
  }
  try {
    flushStore();
  } catch {}
}

/** 导出某间小屋的全部数据（用户自助导出用，含纪念册、战绩与座位昵称）。 */
export function exportRoom(code, token) {
  const c = String(code || "").toUpperCase();
  const room = rooms.get(c);
  let seat = room ? findSeatByToken(room, token) : -1;
  if (seat < 0) {
    try {
      seat = storeFindSeat(c, token);
    } catch {
      seat = -1;
    }
  }
  if (seat < 0) throw new RoomError("FORBIDDEN", "只有小屋里的两个人能导出这些数据", 403);
  const hist = historyFor(c, token);
  const seats = [];
  if (room) {
    room.seats.forEach((s, i) => {
      if (s.profile) seats.push({ seat: i, nickname: s.profile.nickname, avatar: s.profile.avatar, mood: s.profile.mood });
    });
  }
  return {
    exportedAt: new Date().toISOString(),
    code: c,
    seat,
    seats,
    alive: hist.alive,
    stats: hist.stats,
    entries: hist.entries,
  };
}

/** 注销：删掉这间小屋的房间、纪念册、战绩、座位。只允许小屋里的人调用。 */
export function purgeRoom(code, token) {
  const c = String(code || "").toUpperCase();
  const room = rooms.get(c);
  let seat = room ? findSeatByToken(room, token) : -1;
  if (seat < 0) {
    try {
      seat = storeFindSeat(c, token);
    } catch {
      seat = -1;
    }
  }
  if (seat < 0) throw new RoomError("FORBIDDEN", "只有小屋里的两个人能删除这间小屋", 403);
  const timer = saveTimers.get(c);
  if (timer) {
    clearTimeout(timer);
    saveTimers.delete(c);
  }
  rooms.delete(c);
  let counts = { rooms: 0, journal: 0, seats: 0, stats: 0 };
  try {
    counts = storePurgeRoom(c);
  } catch {}
  return { code: c, removed: counts };
}

export function inkStats(room) {
  const d = room.game?.data;
  if (!d) return 0;
  return d.strokes?.reduce((n, s) => n + (s.points?.length || 0) / 2, 0) || 0;
}
