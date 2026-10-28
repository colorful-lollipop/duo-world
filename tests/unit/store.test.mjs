import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 用临时目录，必须在 import store 之前设置 DATA_DIR（store 在模块顶层读取它）。
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "duo-test-"));
process.env.DATA_DIR = dataDir;

const store = await import("../../server/store.mjs");

afterAll(() => {
  try {
    store.closeStore();
  } catch {}
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

function sampleRoom(code) {
  return {
    code,
    createdAt: 1,
    updatedAt: 2,
    version: 3,
    seats: [
      { profile: { nickname: "小明" }, token: "t0", ws: { readyState: 1 }, joinedAt: 0, lastSeen: 0 },
      { profile: { nickname: "小红" }, token: "t1", ws: null, joinedAt: 0, lastSeen: 0 },
    ],
    settings: {},
    gameId: "gomoku",
    game: null,
    journal: [],
    stats: { wins: {} },
    seenCids: [],
  };
}

describe("store · 房间", () => {
  it("saveRoom 后 loadRooms 能读回，且不带 ws 字段", () => {
    store.saveRoom(sampleRoom("ROOM01"), Date.now() + 60000);
    const loaded = store.loadRooms().find((r) => r.code === "ROOM01");
    expect(loaded).toBeTruthy();
    expect(loaded.gameId).toBe("gomoku");
    expect(loaded.seats).toHaveLength(2);
    expect(loaded.seats.every((s) => !("ws" in s))).toBe(true);
    expect(loaded.seats[0].profile.nickname).toBe("小明");
  });

  it("deleteRoom 后读不到", () => {
    store.saveRoom(sampleRoom("ROOM02"), Date.now() + 60000);
    expect(store.loadRooms().some((r) => r.code === "ROOM02")).toBe(true);
    store.deleteRoom("ROOM02");
    expect(store.loadRooms().some((r) => r.code === "ROOM02")).toBe(false);
  });
});

describe("store · 纪念册", () => {
  it("按时间倒序返回，且只返回该房间的条目", () => {
    store.appendJournal({ id: "j-a", code: "JOUR1", gameId: "gomoku", title: "A", detail: "d", data: null, at: 100 });
    store.appendJournal({ id: "j-b", code: "JOUR1", gameId: "gomoku", title: "B", detail: "d", data: { x: 1 }, at: 300 });
    store.appendJournal({ id: "j-c", code: "JOUR1", gameId: "gomoku", title: "C", detail: "d", data: null, at: 200 });
    store.appendJournal({ id: "j-x", code: "JOUR2", gameId: "checkers", title: "X", detail: "d", data: null, at: 999 });

    const list = store.listJournal("JOUR1", 10);
    expect(list.map((e) => e.id)).toEqual(["j-b", "j-c", "j-a"]); // 按 at 倒序
    expect(list[0].data).toEqual({ x: 1 });
    expect(list.every((e) => e.title !== "X")).toBe(true); // 不串房间
    expect(store.listJournal("JOUR1", 2).map((e) => e.id)).toEqual(["j-b", "j-c"]); // limit 生效
    expect(store.listJournal("JOUR2", 10).map((e) => e.id)).toEqual(["j-x"]);
  });

  it("重复 id 不会重复插入（sqlite 后端）", () => {
    store.appendJournal({ id: "dup-1", code: "JOUR3", gameId: "g", title: "T", detail: "d", data: null, at: 10 });
    const first = store.listJournal("JOUR3", 50).filter((e) => e.id === "dup-1").length;
    store.appendJournal({ id: "dup-1", code: "JOUR3", gameId: "g", title: "T", detail: "d", data: null, at: 10 });
    const second = store.listJournal("JOUR3", 50).filter((e) => e.id === "dup-1").length;
    expect(first).toBe(1);
    if (store.storeInfo().kind === "sqlite") {
      expect(second).toBe(1);
    } else {
      // JSON 回退后端没做去重，只保证至少有一条（已知差异见报告）
      expect(second).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("store · 座位 token", () => {
  it("按 token 能查到座位，错 token 返回 -1", () => {
    store.saveSeat("SEAT1", 0, "tok-zero", "小明");
    store.saveSeat("SEAT1", 1, "tok-one", "小红");
    expect(store.findSeatByToken("SEAT1", "tok-zero")).toBe(0);
    expect(store.findSeatByToken("SEAT1", "tok-one")).toBe(1);
    expect(store.findSeatByToken("SEAT1", "nope")).toBe(-1);
    expect(store.findSeatByToken("SEAT1", "")).toBe(-1);
    expect(store.findSeatByToken("OTHER", "tok-zero")).toBe(-1);
  });
});

describe("store · 战绩", () => {
  it("saveStats / getStats 往返一致", () => {
    const stats = { wins: { gomoku: [3, 1], checkers: [0, 2] } };
    store.saveStats("STAT1", stats);
    expect(store.getStats("STAT1")).toEqual(stats);
    expect(store.getStats("MISSING")).toBeNull();
  });
});

describe("store · 注销 purgeRoom / clearJournal", () => {
  it("purgeRoom 删掉房间、纪念册、座位、战绩", () => {
    store.saveRoom(sampleRoom("PURGE1"), Date.now() + 60000);
    store.saveSeat("PURGE1", 0, "tok-p", "小明");
    store.saveStats("PURGE1", { wins: { gomoku: [1, 0] } });
    store.appendJournal({ id: "p-1", code: "PURGE1", gameId: "gomoku", title: "P", detail: "d", data: null, at: 1 });

    const counts = store.purgeRoom("PURGE1");
    expect(counts.rooms).toBeGreaterThanOrEqual(1);
    expect(counts.journal).toBeGreaterThanOrEqual(1);
    expect(counts.seats).toBeGreaterThanOrEqual(1);
    expect(counts.stats).toBeGreaterThanOrEqual(1);
    expect(store.loadRooms().some((r) => r.code === "PURGE1")).toBe(false);
    expect(store.listJournal("PURGE1", 50)).toHaveLength(0);
    expect(store.findSeatByToken("PURGE1", "tok-p")).toBe(-1);
    expect(store.getStats("PURGE1")).toBeNull();
  });

  it("clearJournal 只删纪念册，不影响座位", () => {
    store.saveSeat("CLRJ1", 0, "tok-c", "小明");
    store.appendJournal({ id: "c-1", code: "CLRJ1", gameId: "gomoku", title: "C", detail: "d", data: null, at: 1 });
    const n = store.clearJournal("CLRJ1");
    expect(n).toBeGreaterThanOrEqual(1);
    expect(store.listJournal("CLRJ1", 50)).toHaveLength(0);
    expect(store.findSeatByToken("CLRJ1", "tok-c")).toBe(0);
  });
});

describe("store · 收尾", () => {
  it("flushStore 不抛错，且后端类型合法", () => {
    expect(() => store.flushStore()).not.toThrow();
    expect(["sqlite", "json"]).toContain(store.storeInfo().kind);
  });
});
