import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import talkCards from "../../server/games/talk-cards.mjs";
import { makeRoom, startGame } from "./_room.mjs";

// 把 Math.random 固定成 0：先手固定为 seat 0，抽卡固定取剩余卡池里的第一张。
beforeAll(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterAll(() => {
  vi.restoreAllMocks();
});

function newGame(settings = {}) {
  const room = makeRoom({ gameId: "talk-cards", settings: { "talk-cards": { deck: "走心", ...settings } } });
  const d = startGame(room);
  return { room, d };
}

const act = (room, seat, action, now = 1000) => talkCards.action(room, seat, action, now);

describe("深夜聊天卡 · 初始状态", () => {
  it("开局抽卡阶段，卡组和收藏初始为空", () => {
    const { d } = newGame();
    expect(d.deck).toBe("走心");
    expect(d.phase).toBe("draw");
    expect(d.turn).toBe(0); // Math.random 固定为 0
    expect(d.card).toBeNull();
    expect(d.idx).toBe(0);
    expect(d.shownCount).toBe(0);
    expect(d.favorites).toEqual([[], []]);
  });
});

describe("深夜聊天卡 · 抽卡与翻卡", () => {
  it("轮到谁谁抽卡，抽完进入 shown", () => {
    const { room, d } = newGame();
    expect(act(room, 1, { type: "draw" })).toBe("轮到 TA 抽卡啦");
    expect(act(room, 0, { type: "draw" })).toBeNull();
    expect(d.phase).toBe("shown");
    expect(d.card.id).toBe("z1"); // 走心第一张
    expect(d.used).toEqual(["z1"]);
    expect(d.shownCount).toBe(1);
    expect(d.flipAt).toBe(1000 + 900);
    expect(act(room, 0, { type: "draw" })).toBe("这张卡已经翻开啦");
  });

  it("翻卡换下一张不重复的卡，且只有当前抽卡人能翻", () => {
    const { room, d } = newGame();
    act(room, 0, { type: "draw" });
    expect(act(room, 1, { type: "reroll" })).toBe("轮到 TA 啦");
    expect(act(room, 0, { type: "reroll" })).toBeNull();
    expect(d.card.id).toBe("z2"); // 跳过已经出现的 z1
    expect(d.used).toEqual(["z1", "z2"]);
    expect(d.shownCount).toBe(2);
    expect(d.idx).toBe(1);
    expect(d.flipAt).toBe(1000 + 900);
  });

  it("还没抽卡时不能翻卡也不能 next", () => {
    const { room } = newGame();
    expect(act(room, 0, { type: "reroll" })).toBe("先抽一张卡吧");
    expect(act(room, 0, { type: "next" })).toBe("先抽一张卡吧");
  });

  it("聊完点下一张，换成对方抽", () => {
    const { room, d } = newGame();
    act(room, 0, { type: "draw" });
    expect(act(room, 0, { type: "next" })).toBeNull();
    expect(d.turn).toBe(1);
    expect(d.phase).toBe("draw");
    expect(d.card).toBeNull();
    expect(d.idx).toBe(1);
    expect(d.flipAt).toBe(0);
  });
});

describe("深夜聊天卡 · 收藏与结束", () => {
  it("收藏可以来回切换，两人互不影响", () => {
    const { room, d } = newGame();
    expect(act(room, 0, { type: "fav" })).toBe("还没有可以收藏的卡");
    act(room, 0, { type: "draw" });
    expect(act(room, 0, { type: "fav" })).toBeNull();
    expect(d.favorites[0]).toHaveLength(1);
    expect(d.favorites[0][0].id).toBe("z1");
    // 再点一次取消收藏
    expect(act(room, 0, { type: "fav" })).toBeNull();
    expect(d.favorites[0]).toHaveLength(0);
    // 另一个人收藏不影响第一个人的列表
    expect(act(room, 1, { type: "fav" })).toBeNull();
    expect(d.favorites[1]).toHaveLength(1);
    expect(d.favorites[0]).toHaveLength(0);
  });

  it("finish 直接结束并结算翻卡与收藏数", () => {
    const { room, d } = newGame();
    act(room, 0, { type: "draw" });
    act(room, 0, { type: "fav" });
    expect(act(room, 1, { type: "finish" })).toBeNull();
    expect(d.phase).toBe("over");
    const s = talkCards.summary(room);
    expect(s.title).toBe("深夜聊天卡");
    expect(typeof s.detail).toBe("string");
    expect(s.detail).toContain("1 张卡");
    expect(s.detail).toContain("收藏了 1 张");
  });
});
