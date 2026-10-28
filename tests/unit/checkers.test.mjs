import { describe, it, expect } from "vitest";
import checkers from "../../server/games/checkers.mjs";
import { makeRoom, startGame } from "./_room.mjs";

const id = (r, c) => r * 8 + c;

function newGame(settings = {}) {
  const room = makeRoom({
    gameId: "checkers",
    settings: { checkers: { first: "房主", mandatory: "必须吃子", ...settings } },
  });
  const d = startGame(room);
  return { room, d };
}

function move(room, seat, from, to, now = 0) {
  return checkers.action(room, seat, { type: "move", from, to }, now);
}

describe("爱心跳棋 · 初始状态", () => {
  it("8×8 棋盘，双方各 12 子，房主先走", () => {
    const { room, d } = newGame();
    expect(d.board).toHaveLength(64);
    const count = (v) => d.board.filter((p) => p >= 0 && (p & 1) === v).length;
    expect(count(0)).toBe(12);
    expect(count(1)).toBe(12);
    expect(d.board[id(0, 1)]).toBe(1);
    expect(d.board[id(5, 0)]).toBe(0);
    // 中间两行是空的
    expect(d.board[id(3, 1)]).toBe(-1);
    expect(d.board[id(4, 0)]).toBe(-1);
    expect(d.turn).toBe(0);
    expect(d.phase).toBe("playing");
    expect(d.winner).toBeNull();
    expect(d.mandatory).toBe(true);
    expect(d.wager).toBe("请对方喝一杯奶茶");
    expect(d.wins).toEqual([0, 0]);
    expect(Object.keys(d.legal).length).toBeGreaterThan(0);
  });
});

describe("爱心跳棋 · 走子", () => {
  it("斜走一格成功，吃掉回合", () => {
    const { room, d } = newGame();
    expect(move(room, 0, id(5, 2), id(4, 1))).toBeNull();
    expect(d.board[id(5, 2)]).toBe(-1);
    expect(d.board[id(4, 1)]).toBe(0);
    expect(d.turn).toBe(1);
    expect(d.moveCount).toBe(1);
    expect(d.quietMoves).toBe(1);
    expect(d.last).toEqual({ from: id(5, 2), to: id(4, 1), captures: [] });
  });

  it("越权 / 越界 / 非法目标都被拒绝且棋盘不变", () => {
    const { room, d } = newGame();
    const before = JSON.stringify(d.board);
    // 轮到对方却动手
    expect(move(room, 1, id(2, 1), id(3, 0))).toBe("轮到 TA 走了");
    // 越界坐标
    expect(move(room, 0, 100, 200)).toBe("这里不能走");
    // 选了一个空格
    expect(move(room, 0, id(3, 0), id(2, 1))).toBe("先选一个自己的棋子");
    // 一步走两格（非跳吃）
    expect(move(room, 0, id(5, 0), id(4, 3))).toBe("这一步走不到");
    expect(JSON.stringify(d.board)).toBe(before);
    expect(d.turn).toBe(0);
    expect(d.moveCount).toBe(0);
  });

  it("必须吃子：有吃子时普通步被拒绝，跳吃生效", () => {
    const { room, d } = newGame(); // mandatory = 必须吃子
    expect(move(room, 0, id(5, 2), id(4, 1))).toBeNull(); // 42 -> 33
    expect(move(room, 1, id(2, 3), id(3, 2))).toBeNull(); // 19 -> 26
    const before = JSON.stringify(d.board);
    // (4,1) 明明能走 (3,0)，但因为有子可吃，必须先吃
    expect(move(room, 0, id(4, 1), id(3, 0))).toBe("这一步走不到");
    expect(JSON.stringify(d.board)).toBe(before);
    // 真正的跳吃：(4,1) 跳过 (3,2) 落到 (2,3)，对方棋子被吃掉
    expect(move(room, 0, id(4, 1), id(2, 3))).toBeNull();
    expect(d.board[id(4, 1)]).toBe(-1);
    expect(d.board[id(3, 2)]).toBe(-1);
    expect(d.board[id(2, 3)]).toBe(0);
    expect(d.last.captures).toEqual([id(3, 2)]);
    expect(d.moveCount).toBe(3); // 前面两次普通走子 + 这次跳吃
    expect(d.turn).toBe(1);
  });

  it("自由吃子模式下可以选择不吃", () => {
    const { room, d } = newGame({ mandatory: "自由吃子" });
    expect(move(room, 0, id(5, 2), id(4, 1))).toBeNull();
    expect(move(room, 1, id(2, 3), id(3, 2))).toBeNull();
    expect(move(room, 0, id(4, 1), id(3, 0))).toBeNull();
    expect(d.board[id(3, 0)]).toBe(0);
    expect(d.board[id(3, 2)]).toBe(1); // 对方棋子还在
  });
});

describe("爱心跳棋 · 升王与王棋走法", () => {
  it("走到对方底线升王（p+2），王可以往回走", () => {
    const { room, d } = newGame({ mandatory: "自由吃子" });
    // 一路把房主的一个子推进到 (0,1)
    const seq = [
      [0, id(5, 2), id(4, 1)],
      [1, id(2, 1), id(3, 2)],
      [0, id(4, 1), id(3, 0)],
      [1, id(2, 3), id(3, 4)],
      [0, id(3, 0), id(2, 1)],
      [1, id(1, 2), id(2, 3)],
      [0, id(2, 1), id(1, 2)],
      [1, id(1, 0), id(2, 1)],
      [0, id(5, 0), id(4, 1)],
      [1, id(0, 1), id(1, 0)],
      [0, id(1, 2), id(0, 1)], // 到底线 → 升王
    ];
    for (const [seat, from, to] of seq) {
      expect(move(room, seat, from, to)).toBeNull();
    }
    expect(d.board[id(0, 1)]).toBe(2); // 普通子 0 -> 王 2
    expect(d.moveCount).toBe(11);
    expect(d.turn).toBe(1);
    // 王能往“后”（朝自己半场方向）走
    expect(move(room, 1, id(3, 4), id(4, 3))).toBeNull();
    expect(move(room, 0, id(0, 1), id(1, 2))).toBeNull();
    expect(d.board[id(1, 2)]).toBe(2);
    expect(d.board[id(0, 1)]).toBe(-1);
  });
});

describe("爱心跳棋 · 认输与求和", () => {
  it("认输判负并累加对方胜场", () => {
    const { room, d } = newGame();
    expect(checkers.action(room, 0, { type: "resign" })).toBeNull();
    expect(d.phase).toBe("over");
    expect(d.winner).toBe(1);
    expect(d.reason).toBe("resign");
    expect(room.stats.wins.checkers).toEqual([0, 1]);
    expect(move(room, 1, id(5, 0), id(4, 1))).toBe("这一局已经结束啦");
  });

  it("求和需要对方同意，且待处理请求时不能走棋", () => {
    const { room, d } = newGame();
    expect(checkers.action(room, 1, { type: "draw" })).toBeNull();
    expect(d.pending).toEqual({ kind: "draw", by: 1 });
    expect(checkers.action(room, 1, { type: "draw" })).toBe("已经有一个请求啦");
    expect(move(room, 1, id(2, 1), id(3, 0))).toBe("先处理一下 TA 的请求吧");
    expect(checkers.action(room, 0, { type: "accept" })).toBeNull();
    expect(d.phase).toBe("over");
    expect(d.draw).toBe(true);
    expect(d.winner).toBeNull();
    expect(checkers.summary(room).detail).toContain("握手言和");
  });
});

describe("爱心跳棋 · 结算", () => {
  it("summary 返回中文标题和非空说明", () => {
    const { room } = newGame();
    expect(checkers.action(room, 0, { type: "resign" })).toBeNull();
    const s = checkers.summary(room);
    expect(s.title).toBe("爱心跳棋");
    expect(typeof s.detail).toBe("string");
    expect(s.detail.length).toBeGreaterThan(0);
    expect(s.detail).toContain("小红");
    expect(s.data.winner).toBe(1);
  });
});
