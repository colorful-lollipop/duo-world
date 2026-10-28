import { describe, it, expect } from "vitest";
import gomoku from "../../server/games/gomoku.mjs";
import { makeRoom, startGame } from "./_room.mjs";

const SIZE = 15;
const idx = (x, y) => y * SIZE + x;

function newGame(settings = {}) {
  const room = makeRoom({ gameId: "gomoku", settings: { gomoku: { first: "房主", ...settings } } });
  const d = startGame(room);
  return { room, d };
}

function place(room, seat, x, y, now = 0) {
  return gomoku.action(room, seat, { type: "place", x, y }, now);
}

/** 让房主（seat 0）在 y=0 横向连成五子获胜，顺便记录每一步都成功。 */
function playWinForSeat0(room) {
  const s0 = [[0, 0], [1, 0], [2, 0], [3, 0]];
  const s1 = [[14, 14], [14, 13], [14, 12], [14, 11]];
  for (let i = 0; i < 4; i++) {
    expect(place(room, 0, s0[i][0], s0[i][1])).toBeNull();
    expect(place(room, 1, s1[i][0], s1[i][1])).toBeNull();
  }
  return place(room, 0, 4, 0);
}

describe("爱心五子棋 · 初始状态", () => {
  it("15×15 空棋盘，房主先手", () => {
    const { d } = newGame();
    expect(d.board).toHaveLength(SIZE * SIZE);
    expect(d.board.every((v) => v === -1)).toBe(true);
    expect(d.turn).toBe(0);
    expect(d.move).toBe(0);
    expect(d.phase).toBe("playing");
    expect(d.winner).toBeNull();
    expect(d.draw).toBe(false);
    expect(d.moves).toEqual([]);
    expect(d.wager).toBe("请对方喝一杯奶茶");
    expect(d.wins).toEqual([0, 0]);
  });

  it("设置改成 TA 先手时从 seat 1 开始", () => {
    const { d } = newGame({ first: "TA" });
    expect(d.turn).toBe(1);
  });
});

describe("爱心五子棋 · 落子与判胜", () => {
  it("正常落子成功并切换到对方", () => {
    const { room, d } = newGame();
    expect(place(room, 0, 7, 7)).toBeNull();
    expect(d.board[idx(7, 7)]).toBe(0);
    expect(d.move).toBe(1);
    expect(d.turn).toBe(1);
    expect(d.last).toEqual({ x: 7, y: 7, seat: 0 });
    expect(d.moves).toHaveLength(1);
  });

  it("越权 / 越界 / 重复落子都被拒绝且棋盘不变", () => {
    const { room, d } = newGame();
    expect(place(room, 0, 3, 3)).toBeNull();
    // 轮到对方时自己动手
    expect(place(room, 0, 4, 4)).toBe("轮到 TA 落子啦");
    // 越界与非整数
    expect(place(room, 1, 15, 0)).toBe("这里不能落子");
    expect(place(room, 1, -1, 2)).toBe("这里不能落子");
    expect(place(room, 1, 3.5, 2)).toBe("这里不能落子");
    // 重复落在已有棋子的位置
    expect(place(room, 1, 3, 3)).toBe("这里已经有棋子啦");
    expect(d.move).toBe(1);
    expect(d.turn).toBe(1);
    expect(d.board.filter((v) => v !== -1)).toHaveLength(1);
  });

  it("五子连珠判胜并累加战绩", () => {
    const { room, d } = newGame();
    expect(playWinForSeat0(room)).toBeNull();
    expect(d.winner).toBe(0);
    expect(d.phase).toBe("over");
    expect(d.reason).toBe("five");
    expect(d.line).toEqual([0, 1, 2, 3, 4]);
    expect(d.wins).toEqual([1, 0]);
    expect(room.stats.wins.gomoku).toEqual([1, 0]);
    // 结束后不能落子
    expect(place(room, 1, 2, 2)).toBe("这一局已经结束啦");
  });

  it("没有棋子时不能悔棋", () => {
    const { room } = newGame();
    expect(gomoku.action(room, 0, { type: "undo" })).toBe("还没有可以悔的棋");
  });

  it("悔棋需要对方同意，拒绝后棋盘不变", () => {
    const { room, d } = newGame();
    expect(place(room, 0, 5, 5)).toBeNull();
    // 不能替对方悔棋
    expect(gomoku.action(room, 1, { type: "undo" })).toBe("只能悔自己刚下的一步哦");
    expect(gomoku.action(room, 0, { type: "undo" })).toBeNull();
    expect(d.pending).toEqual({ kind: "undo", by: 0 });
    // 重复发起
    expect(gomoku.action(room, 0, { type: "undo" })).toBe("已经有一个请求啦");
    // 发起人不能自己同意
    expect(gomoku.action(room, 0, { type: "accept" })).toBe("等 TA 来处理吧");
    // 对方拒绝
    expect(gomoku.action(room, 1, { type: "decline" })).toBeNull();
    expect(d.pending).toBeNull();
    expect(d.board[idx(5, 5)]).toBe(0);
    expect(d.move).toBe(1);
    // 重新发起并被同意 → 撤回这一步
    expect(gomoku.action(room, 0, { type: "undo" })).toBeNull();
    expect(gomoku.action(room, 1, { type: "accept" })).toBeNull();
    expect(d.board[idx(5, 5)]).toBe(-1);
    expect(d.move).toBe(0);
    expect(d.turn).toBe(0);
    expect(d.moves).toHaveLength(0);
    expect(d.pending).toBeNull();
  });

  it("求和只有对方同意才判平局", () => {
    const { room, d } = newGame();
    expect(place(room, 0, 6, 6)).toBeNull();
    expect(gomoku.action(room, 1, { type: "draw" })).toBeNull();
    expect(d.pending).toEqual({ kind: "draw", by: 1 });
    expect(gomoku.action(room, 0, { type: "cancel" })).toBe("这不是你的请求");
    expect(gomoku.action(room, 1, { type: "accept" })).toBe("等 TA 来处理吧");
    expect(gomoku.action(room, 0, { type: "accept" })).toBeNull();
    expect(d.phase).toBe("over");
    expect(d.draw).toBe(true);
    expect(d.reason).toBe("agree-draw");
    expect(d.pending).toBeNull();
    expect(gomoku.summary(room).detail).toContain("握手言和");
  });

  it("认输判负并累加对方胜场", () => {
    const { room, d } = newGame();
    expect(place(room, 0, 6, 6)).toBeNull();
    expect(gomoku.action(room, 0, { type: "resign" })).toBeNull();
    expect(d.phase).toBe("over");
    expect(d.winner).toBe(1);
    expect(d.reason).toBe("resign");
    expect(room.stats.wins.gomoku).toEqual([0, 1]);
    expect(gomoku.action(room, 1, { type: "undo" })).toBe("这一局已经结束啦");
  });
});

describe("爱心五子棋 · 结算", () => {
  it("summary 返回中文标题和非空说明", () => {
    const { room } = newGame();
    // 让房主赢一局
    expect(playWinForSeat0(room)).toBeNull();
    const s = gomoku.summary(room);
    expect(s.title).toBe("爱心五子棋");
    expect(typeof s.detail).toBe("string");
    expect(s.detail.length).toBeGreaterThan(0);
    expect(s.detail).toContain("小明");
    expect(s.data.winner).toBe(0);
  });
});
