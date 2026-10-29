import { describe, it, expect } from "vitest";
import game, { applyDice, makeBoard } from "../../server/games/love-flight.mjs";
import {
  LAYOUTS,
  truthCards,
  taskCards,
  closingCards,
  pickCard,
} from "../../server/games/_love-flight.cards.mjs";
import { makeRoom, startGame } from "./_room.mjs";

const EVENT_KINDS = ["truth", "task", "forward", "back", "swap", "again"];

function newGame(settings = {}) {
  const room = makeRoom({
    gameId: "love-flight",
    settings: { "love-flight": { tiles: 18, ...settings } },
  });
  const d = startGame(room);
  return { room, d };
}

describe("爱情飞行棋 · 棋盘", () => {
  it("18 / 24 / 30 三种路线长度正确，首尾是起点终点", () => {
    for (const len of [18, 24, 30]) {
      const board = makeBoard(len);
      expect(board).toHaveLength(len);
      expect(board[0].kind).toBe("start");
      expect(board[len - 1].kind).toBe("finish");
      expect(board.slice(1, -1).some((c) => c.kind === "start" || c.kind === "finish")).toBe(false);
      board.forEach((cell, i) => {
        expect(cell.index).toBe(i);
        expect(typeof cell.emoji).toBe("string");
        expect(cell.label.length).toBeGreaterThan(0);
      });
    }
  });

  it("每种长度都包含全部事件格", () => {
    for (const len of [18, 24, 30]) {
      const board = makeBoard(len);
      for (const kind of EVENT_KINDS) {
        expect(board.some((c) => c.kind === kind)).toBe(true);
      }
    }
  });

  it("非法长度回退到 24", () => {
    expect(makeBoard(12)).toHaveLength(24);
    expect(makeBoard(31)).toHaveLength(24);
    expect(makeBoard("abc")).toHaveLength(24);
    expect(makeBoard(undefined)).toHaveLength(24);
    expect(makeBoard("18")).toHaveLength(18);
  });

  it("棋盘布局写死且与 LAYOUTS 一致", () => {
    for (const len of [18, 24, 30]) {
      expect(makeBoard(len).map((c) => c.kind)).toEqual(LAYOUTS[len]);
    }
  });

  it("create 读取设置里的路线长度，状态字段齐全", () => {
    const { d } = newGame({ tiles: 18 });
    expect(d.length).toBe(18);
    expect(d.phase).toBe("roll");
    expect(d.turn).toBe(0);
    expect(d.round).toBe(1);
    expect(d.pos).toEqual([0, 0]);
    expect(d.dice).toBeNull();
    expect(d.event).toBeNull();
    expect(d.winner).toBeNull();
    expect(d.closing).toBeNull();
    expect(d.rolls).toEqual([0, 0]);
    expect(d.events).toBe(0);
    expect(d.history).toEqual([]);
    expect(d.lastMove).toBeNull();
    expect(d.moveSeq).toBe(0);

    expect(newGame({ tiles: 999 }).d.length).toBe(24);
  });
});

describe("爱情飞行棋 · 卡组", () => {
  it("三组卡数量达标且没有重复", () => {
    expect(truthCards.length).toBeGreaterThanOrEqual(28);
    expect(taskCards.length).toBeGreaterThanOrEqual(18);
    expect(closingCards.length).toBeGreaterThanOrEqual(12);
    for (const list of [truthCards, taskCards, closingCards]) {
      expect(new Set(list).size).toBe(list.length);
      for (const text of list) {
        expect(typeof text).toBe("string");
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("pickCard 支持固定随机数，空数组返回空串", () => {
    expect(pickCard(truthCards, () => 0)).toBe(truthCards[0]);
    expect(pickCard(closingCards, () => 0.999)).toBe(closingCards[closingCards.length - 1]);
    expect(pickCard([], () => 0)).toBe("");
    expect(pickCard(taskCards)).toBeTruthy();
  });
});

describe("爱情飞行棋 · 掷骰推进", () => {
  it("从起点掷 5 落到普通格并换人", () => {
    const { room, d } = newGame();
    expect(applyDice(d, 0, 5, 1000, room)).toBeNull();
    expect(d.pos).toEqual([5, 0]);
    expect(d.dice).toBe(5);
    expect(d.rolls).toEqual([1, 0]);
    expect(d.board[5].kind).toBe("plain");
    expect(d.phase).toBe("roll");
    expect(d.turn).toBe(1);
    expect(d.round).toBe(1);
    expect(d.history).toEqual([{ seat: 0, roll: 5, from: 0, to: 5, kind: "plain" }]);
    expect(d.lastMove).toMatchObject({
      id: 1,
      source: "roll",
      seat: 0,
      kind: "plain",
      from: [0, 0],
      to: [5, 0],
    });
  });

  it("lastMove 记录事件前进/后退/交换的实际位移，但 history 仍只记掷骰", () => {
    const { room, d } = newGame();
    d.pos = [5, 0];
    applyDice(d, 0, 2, 1000, room); // 5 -> 7 back，触发事件
    expect(d.lastMove).toMatchObject({ id: 1, source: "roll", kind: "back", from: [5, 0], to: [7, 0] });
    expect(game.action(room, 0, { type: "resolve" }, 1100)).toBeNull();
    expect(d.lastMove).toMatchObject({ id: 2, source: "event", kind: "back", from: [7, 0], to: [5, 0] });
    expect(d.history).toHaveLength(1);

    d.turn = 0;
    d.pos = [8, 3];
    applyDice(d, 0, 2, 1200, room); // 8 -> 10 swap，触发事件
    const beforeSwap = d.lastMove.id;
    expect(game.action(room, 0, { type: "resolve" }, 1300)).toBeNull();
    expect(d.lastMove).toMatchObject({
      id: beforeSwap + 1,
      source: "event",
      kind: "swap",
      from: [10, 3],
      to: [3, 10],
    });
    expect(d.history).toHaveLength(2);
  });

  it("踩到真心话进入 event，抽一张不重复的卡", () => {
    const { room, d } = newGame();
    applyDice(d, 0, 2, 1000, room); // 0 -> 2 truth
    expect(d.phase).toBe("event");
    expect(d.turn).toBe(0);
    expect(d.event.kind).toBe("truth");
    expect(d.event.title).toContain("真心话");
    expect(truthCards).toContain(d.event.text);
  });

  it("again：resolve 后回合不变、phase 回到 roll", () => {
    const { room, d } = newGame();
    d.pos[0] = 10;
    applyDice(d, 0, 3, 1000, room); // 10 -> 13 again
    expect(d.event.kind).toBe("again");
    expect(game.action(room, 0, { type: "resolve" }, 1100)).toBeNull();
    expect(d.phase).toBe("roll");
    expect(d.turn).toBe(0);
    expect(d.event).toBeNull();
    expect(d.events).toBe(1);
  });

  it("swap：交换双方位置后换人", () => {
    const { room, d } = newGame();
    d.pos = [8, 3];
    applyDice(d, 0, 2, 1000, room); // 8 -> 10 swap
    expect(d.event.kind).toBe("swap");
    expect(d.pos).toEqual([10, 3]);
    expect(game.action(room, 0, { type: "resolve" }, 1100)).toBeNull();
    expect(d.pos).toEqual([3, 10]);
    expect(d.turn).toBe(1);
    expect(d.round).toBe(1);
  });

  it("back：后退 2 格后换人", () => {
    const { room, d } = newGame();
    d.pos = [5, 0];
    applyDice(d, 0, 2, 1000, room); // 5 -> 7 back
    expect(d.event.kind).toBe("back");
    expect(game.action(room, 0, { type: "resolve" }, 1100)).toBeNull();
    expect(d.pos[0]).toBe(5);
    expect(d.turn).toBe(1);
  });

  it("forward 走到终点直接赢", () => {
    const { room, d } = newGame();
    d.pos = [13, 5];
    applyDice(d, 0, 3, 1000, room); // 13 -> 16 forward
    expect(d.event.kind).toBe("forward");
    expect(game.action(room, 0, { type: "resolve" }, 1100)).toBeNull();
    expect(d.pos[0]).toBe(17);
    expect(d.phase).toBe("over");
    expect(d.winner).toBe(0);
    expect(d.closing.forSeat).toBe(1);
    expect(d.lastMove).toMatchObject({ source: "event", kind: "forward", from: [16, 5], to: [17, 5] });
  });

  it("超过终点时夹到最后一格并获胜", () => {
    const { room, d } = newGame();
    d.pos = [16, 0];
    applyDice(d, 0, 6, 1000, room); // min(22, 17) = 17
    expect(d.pos[0]).toBe(17);
    expect(d.phase).toBe("over");
    expect(d.winner).toBe(0);
  });

  it("两人各掷一次后 round 才会增加", () => {
    const { room, d } = newGame();
    applyDice(d, 0, 1, 1000, room);
    expect(d.turn).toBe(1);
    expect(d.round).toBe(1);
    applyDice(d, 1, 1, 1100, room);
    expect(d.turn).toBe(0);
    expect(d.round).toBe(2);
  });
});

describe("爱情飞行棋 · 动作校验", () => {
  it("不是自己的回合不能掷骰子", () => {
    const { room, d } = newGame();
    expect(game.action(room, 1, { type: "roll" })).toBe("还没轮到你");
    expect(d.rolls).toEqual([0, 0]);
    expect(d.turn).toBe(0);
  });

  it("事件卡没处理完不能掷骰子，非当前玩家不能 resolve", () => {
    const { room, d } = newGame();
    applyDice(d, 0, 2, 0, room); // truth
    expect(game.action(room, 0, { type: "roll" })).toBe("先处理这张卡");
    expect(game.action(room, 1, { type: "resolve" })).toBe("等 TA 处理这张卡");
    expect(d.phase).toBe("event");
    expect(d.turn).toBe(0);
    expect(game.action(room, 0, { type: "resolve" })).toBeNull();
    expect(d.phase).toBe("roll");
    expect(d.turn).toBe(1);
  });

  it("phase 不是 event 时不能 resolve", () => {
    const { room } = newGame();
    expect(game.action(room, 0, { type: "resolve" })).toBe("现在没有要处理的卡");
  });

  it("游戏结束后拒绝所有动作，未知动作也被拒绝", () => {
    const { room, d } = newGame();
    d.pos[0] = 16;
    applyDice(d, 0, 2, 0, room);
    expect(d.phase).toBe("over");
    expect(game.action(room, 0, { type: "roll" })).toBe("这一局已经结束啦");
    expect(game.action(room, 0, { type: "resolve" })).toBe("这一局已经结束啦");
    expect(game.action(room, 1, { type: "nope" })).toBe("这一局已经结束啦");
  });

  it("未知动作返回中文提示", () => {
    const { room } = newGame();
    expect(game.action(room, 0, { type: "nope" })).toBe("这个操作暂时不可以");
  });
});

describe("爱情飞行棋 · 结算", () => {
  it("赢家写撒娇卡、累加胜场", () => {
    const { room, d } = newGame();
    d.pos = [16, 0];
    applyDice(d, 0, 3, 5000, room);
    expect(d.phase).toBe("over");
    expect(d.winner).toBe(0);
    expect(d.endedAt).toBe(5000);
    expect(d.closing.forSeat).toBe(1);
    expect(typeof d.closing.text).toBe("string");
    expect(d.closing.text.length).toBeGreaterThan(0);
    expect(room.stats.wins["love-flight"]).toEqual([1, 0]);
    expect(d.wins).toEqual([1, 0]);
  });

  it("summary 包含赢家昵称、掷骰次数和事件数", () => {
    const { room, d } = newGame();
    d.pos = [16, 0];
    applyDice(d, 0, 2, 0, room);
    d.events = 3;
    const s = game.summary(room);
    expect(s.title).toBe("爱情飞行棋");
    expect(s.detail).toContain("小明");
    expect(s.detail).toContain("1 次骰子");
    expect(s.detail).toContain("3 个心动事件");
    expect(s.detail.length).toBeGreaterThan(0);
    expect(s.data.winner).toBe(0);
    expect(s.data.events).toBe(3);
    expect(s.data.rolls).toEqual(d.rolls);
    expect(s.data.closing).toEqual(d.closing);
  });
});
