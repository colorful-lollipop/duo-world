import { describe, it, expect } from "vitest";
import mindMeld from "../../server/games/mind-meld.mjs";
import { pickPrompts, prompts } from "../../server/games/_mind-meld.prompts.mjs";
import { makeRoom, startGame } from "./_room.mjs";

function newGame(settings = {}) {
  const room = makeRoom({ gameId: "mind-meld", settings: { "mind-meld": { rounds: 10, ...settings } } });
  const d = startGame(room);
  return { room, d };
}

const act = (room, seat, action, now = 1000) => mindMeld.action(room, seat, action, now);
const submit = (room, seat, word, now = 1000) => act(room, seat, { type: "submit", word }, now);

describe("心有灵犀 · 初始状态", () => {
  it("开局处于提交阶段，双方都还没写", () => {
    const { d } = newGame();
    expect(d.round).toBe(0);
    expect(d.maxRounds).toBe(10);
    expect(d.phase).toBe("submit");
    expect(d.submitted).toEqual([null, null]);
    expect(d.answers).toBeNull();
    expect(d.history).toEqual([]);
    expect(d.agrees).toEqual([false, false]);
    expect(d.roundMatched).toBe(false);
    expect(d.matched).toBe(0);
  });
});

describe("心有灵犀 · 提交与判定", () => {
  it("两人都交后揭晓，同词算灵犀", () => {
    const { room, d } = newGame();
    expect(submit(room, 0, "海")).toBeNull();
    expect(d.submitted[0]).toBe("海");
    expect(d.phase).toBe("submit");
    expect(submit(room, 0, "山")).toBe("你已经写好啦");
    expect(submit(room, 1, "海", 1000)).toBeNull();
    expect(d.phase).toBe("reveal");
    expect(d.answers).toEqual(["海", "海"]);
    expect(d.roundMatched).toBe(true);
    expect(d.matched).toBe(1);
    expect(d.lastGain).toBe(1);
    expect(d.revealAt).toBe(1000 + 900);
    expect(d.history).toHaveLength(1);
  });

  it("同词判定忽略大小写、空格和标点", () => {
    const a = newGame();
    submit(a.room, 0, "Apple ");
    submit(a.room, 1, "apple!");
    expect(a.d.roundMatched).toBe(true);

    const b = newGame();
    submit(b.room, 0, "海");
    submit(b.room, 1, "海，");
    expect(b.d.roundMatched).toBe(true);
  });

  it("空词和重复词被拒绝", () => {
    const { room, d } = newGame();
    expect(submit(room, 0, "   ")).toBe("先写一个词吧");
    expect(submit(room, 0, "海")).toBeNull();
    expect(submit(room, 1, "海")).toBeNull();
    // 进入下一轮后，之前出现过的词不能再写
    expect(act(room, 0, { type: "next" })).toBeNull();
    expect(d.phase).toBe("submit");
    expect(submit(room, 0, "海，")).toBe("这个词已经出现过啦，换一个");
    expect(d.submitted[0]).toBeNull();
  });

  it("只有双方都 agree 才算强行灵犀", () => {
    const { room, d } = newGame();
    submit(room, 0, "海");
    submit(room, 1, "山");
    expect(d.roundMatched).toBe(false);
    expect(d.matched).toBe(0);
    expect(act(room, 0, { type: "agree" })).toBeNull();
    expect(d.agrees).toEqual([true, false]);
    expect(d.roundMatched).toBe(false); // 只有一个人同意还不算
    expect(act(room, 1, { type: "agree" })).toBeNull();
    expect(d.agrees).toEqual([true, true]);
    expect(d.roundMatched).toBe(true);
    expect(d.matched).toBe(1);
    expect(d.lastGain).toBe(1);
    expect(d.history[d.history.length - 1].matched).toBe(true);
    // 已经匹配后不需要再确认
    expect(act(room, 0, { type: "agree" })).toBe("现在不用确认啦");
  });
});

describe("心有灵犀 · 轮次推进", () => {
  it("跑满轮数后 next 进入 over", () => {
    const { room, d } = newGame({ rounds: 2 });
    expect(d.maxRounds).toBe(2);
    submit(room, 0, "海");
    submit(room, 1, "海");
    expect(act(room, 1, { type: "next" })).toBeNull();
    expect(d.round).toBe(1);
    expect(d.phase).toBe("submit");
    expect(d.submitted).toEqual([null, null]);
    submit(room, 0, "山");
    submit(room, 1, "山");
    expect(d.matched).toBe(2);
    expect(act(room, 0, { type: "next" })).toBeNull();
    expect(d.phase).toBe("over");
  });

  it("还没揭晓时不能 next，揭晓后不能再提交", () => {
    const { room, d } = newGame();
    expect(act(room, 0, { type: "next" })).toBe("等两个人都写好吧");
    submit(room, 0, "海");
    expect(submit(room, 1, "海")).toBeNull();
    expect(d.phase).toBe("reveal");
    expect(submit(room, 0, "火")).toBe("这一轮已经揭晓啦");
  });
});

describe("心有灵犀 · 灵感词库", () => {
  it("词库不少于 120 个且互不重复", () => {
    expect(prompts.length).toBeGreaterThanOrEqual(120);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("pickPrompts 抽 count 个、互不重复，并排除历史词", () => {
    const history = prompts.slice(0, 10).map((p) => ({ a: p, b: p }));
    const picked = pickPrompts(history, 6, () => 0);
    expect(picked).toHaveLength(6);
    expect(new Set(picked).size).toBe(6);
    for (const p of picked) {
      const used = new Set(history.flatMap((h) => [h.a, h.b]));
      expect(used.has(p)).toBe(false);
    }
  });

  it("历史词用光后回退到全库，仍返回 count 个不重复的词", () => {
    const history = prompts.map((p) => ({ a: p, b: p }));
    const picked = pickPrompts(history, 6, () => 0);
    expect(picked).toHaveLength(6);
    expect(new Set(picked).size).toBe(6);
    expect(picked.every((p) => prompts.includes(p))).toBe(true);
  });

  it("开局下发 6 个灵感词，进入下一轮时刷新且不含词链里的词", () => {
    const { room, d } = newGame();
    expect(d.prompts).toHaveLength(6);
    expect(new Set(d.prompts).size).toBe(6);

    const [first, second] = d.prompts;
    submit(room, 0, first);
    submit(room, 1, second);
    expect(act(room, 0, { type: "next" })).toBeNull();

    expect(d.round).toBe(1);
    expect(d.prompts).toHaveLength(6);
    const used = new Set(d.history.flatMap((h) => [h.a, h.b]));
    expect(d.prompts.every((p) => !used.has(p))).toBe(true);
  });
});

describe("心有灵犀 · 结算", () => {
  it("summary 返回中文标题和非空说明", () => {
    const { room } = newGame();
    const s = mindMeld.summary(room);
    expect(s.title).toBe("心有灵犀");
    expect(typeof s.detail).toBe("string");
    expect(s.detail.length).toBeGreaterThan(0);
    expect(s.data.matched).toBe(0);
  });
});
