import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 必须在 import rooms / store 之前设置 DATA_DIR。
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "duo-rooms-"));
process.env.DATA_DIR = dataDir;

const rooms = await import("../../server/rooms.mjs");
const store = await import("../../server/store.mjs");

afterAll(() => {
  try {
    rooms.flushPersistence();
  } catch {}
  try {
    store.closeStore();
  } catch {}
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

const P0 = { nickname: "小明", avatar: "bunny", color: "#FF6B6B", mood: "joy" };
const P1 = { nickname: "小红", avatar: "bear", color: "#4D9DFF", mood: "joy" };

describe("rooms · 创建与加入", () => {
  it("createRoom 返回 token 与 seat 0，房间进内存", () => {
    const { room, seat, token } = rooms.createRoom(P0);
    expect(seat).toBe(0);
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(10);
    expect(rooms.getRoom(room.code)).toBe(room);
    expect(room.seats[0].profile.nickname).toBe("小明");
    expect(room.seats[1].profile).toBeNull();
    expect(rooms.findSeatByToken(room, token)).toBe(0);
    expect(rooms.publicInfo(room.code).full).toBe(false);
  });

  it("joinRoom 拿到 seat 1，第三个人加入抛 ROOM_FULL", () => {
    const { room } = rooms.createRoom(P0);
    const joined = rooms.joinRoom(room.code, P1);
    expect(joined.seat).toBe(1);
    expect(joined.room.seats[1].profile.nickname).toBe("小红");
    expect(rooms.publicInfo(room.code).full).toBe(true);
    expect(rooms.findSeatByToken(room, joined.token)).toBe(1);
    expect(rooms.findSeatByToken(room, "bad-token")).toBe(-1);

    expect(() => rooms.joinRoom(room.code, { nickname: "第三者" })).toThrowError(/已经有两个人/);
    try {
      rooms.joinRoom(room.code, { nickname: "第三者" });
    } catch (err) {
      expect(err.code).toBe("ROOM_FULL");
    }
  });

  it("startGame 前必须两个人都到位", () => {
    const { room } = rooms.createRoom(P0);
    rooms.selectGame(room, 0, "gomoku");
    expect(() => rooms.startGame(room, 0)).toThrowError(/等 TA 进来/);
    try {
      rooms.startGame(room, 0);
    } catch (err) {
      expect(err.code).toBe("NEED_PARTNER");
    }
    rooms.joinRoom(room.code, P1);
    expect(() => rooms.startGame(room, 0)).not.toThrow();
    expect(room.game).toBeTruthy();
    expect(room.game.id).toBe("gomoku");
    expect(room.game.data.phase).toBe("playing");
  });
});

describe("rooms · 一局最小流程与历史", () => {
  it("认输后写入纪念册，historyFor 能查到，陌生 token 被拒", () => {
    const { room, token } = rooms.createRoom(P0);
    const { token: token1 } = rooms.joinRoom(room.code, P1);
    rooms.selectGame(room, 0, "gomoku");
    rooms.startGame(room, 0);
    expect(room.game.data.phase).toBe("playing");

    rooms.handleAction(room, 0, { type: "resign" });
    expect(room.game.data.phase).toBe("over");
    expect(room.game.data.winner).toBe(1);
    expect(room.game.journaled).toBe(true);
    expect(room.journal).toHaveLength(1);
    expect(room.stats.wins.gomoku).toEqual([0, 1]);

    const hist = rooms.historyFor(room.code, token);
    expect(hist.alive).toBe(true);
    expect(hist.entries.length).toBeGreaterThanOrEqual(1);
    expect(hist.entries[0].title).toBe("爱心五子棋");
    expect(hist.stats.wins.gomoku).toEqual([0, 1]);

    const hist1 = rooms.historyFor(room.code, token1);
    expect(hist1.entries.length).toBeGreaterThanOrEqual(1);

    expect(() => rooms.historyFor(room.code, "intruder")).toThrowError(/两个人能看到/);
  });
});

describe("rooms · 数据导出与注销", () => {
  function played() {
    const { room, token } = rooms.createRoom(P0);
    const { token: token1 } = rooms.joinRoom(room.code, P1);
    rooms.selectGame(room, 0, "gomoku");
    rooms.startGame(room, 0);
    rooms.handleAction(room, 0, { type: "resign" });
    return { room, token, token1 };
  }

  it("exportRoom 带出纪念册、战绩与座位昵称", () => {
    const { room, token } = played();
    const data = rooms.exportRoom(room.code, token);
    expect(data.code).toBe(room.code);
    expect(data.seat).toBe(0);
    expect(data.alive).toBe(true);
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
    expect(data.entries[0].gameId).toBe("gomoku");
    expect(data.stats.wins.gomoku).toEqual([0, 1]);
    expect(data.seats.map((s) => s.nickname).sort()).toEqual(["小明", "小红"]);
    expect(typeof data.exportedAt).toBe("string");
    expect(Number.isNaN(Date.parse(data.exportedAt))).toBe(false);
  });

  it("exportRoom 拒绝陌生 token", () => {
    const { room } = played();
    expect(() => rooms.exportRoom(room.code, "intruder")).toThrowError(/两个人/);
    try {
      rooms.exportRoom(room.code, "");
    } catch (err) {
      expect(err.status).toBe(403);
    }
  });

  it("purgeRoom 清掉内存与落盘数据，之后历史也查不到", () => {
    const { room, token } = played();
    const code = room.code;
    expect(rooms.getRoom(code)).toBeTruthy();

    const res = rooms.purgeRoom(code, token);
    expect(res.code).toBe(code);
    expect(rooms.getRoom(code)).toBeFalsy();
    expect(store.listJournal(code, 50)).toHaveLength(0);
    expect(store.findSeatByToken(code, token)).toBe(-1);
    expect(store.getStats(code)).toBeNull();
    expect(() => rooms.historyFor(code, token)).toThrowError(/两个人/);
  });

  it("purgeRoom 拒绝陌生 token，且不会误删", () => {
    const { room, token } = played();
    expect(() => rooms.purgeRoom(room.code, "intruder")).toThrowError(/两个人/);
    expect(rooms.getRoom(room.code)).toBeTruthy();
    expect(rooms.purgeRoom(room.code, token).removed.rooms).toBeGreaterThanOrEqual(1);
  });
});

describe("rooms · 持久化与恢复", () => {
  it("flushPersistence 后 rehydrate 不抛错并返回数字，historyFor 仍可用", () => {
    const { room, token } = rooms.createRoom(P0);
    rooms.joinRoom(room.code, P1);
    rooms.selectGame(room, 0, "gomoku");
    rooms.startGame(room, 0);
    rooms.handleAction(room, 0, { type: "resign" });

    expect(() => rooms.flushPersistence()).not.toThrow();
    let restored;
    expect(() => {
      restored = rooms.rehydrate();
    }).not.toThrow();
    expect(typeof restored).toBe("number");
    expect(restored).toBeGreaterThanOrEqual(0);

    // 恢复后房间仍在内存里，历史依旧可查
    expect(rooms.getRoom(room.code)).toBeTruthy();
    const hist = rooms.historyFor(room.code, token);
    expect(hist.entries.length).toBeGreaterThanOrEqual(1);
    expect(hist.stats.wins.gomoku).toEqual([0, 1]);
  });
});
