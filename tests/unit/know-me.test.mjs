import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import knowMe from "../../server/games/know-me.mjs";
import { questions } from "../../server/games/_know-me.questions.mjs";
import { makeRoom, startGame } from "./_room.mjs";

// 把 Math.random 固定成 0，让题目抽取顺序确定（否则 shuffle 随机，用例不确定）。
beforeAll(() => {
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterAll(() => {
  vi.restoreAllMocks();
});

function newGame(settings = {}) {
  // 题库扩大后，用 5 题的小样本覆盖完整的 5 轮流程；分类抽取单独用 8 题验证。
  const room = makeRoom({
    gameId: "know-me",
    settings: { "know-me": { count: 5, categories: ["吃喝"], ...settings } },
  });
  const d = startGame(room);
  return { room, d };
}

const act = (room, seat, action, now = 1000) => knowMe.action(room, seat, action, now);
const submit = (room, seat, answer, now = 1000) => act(room, seat, { type: "submit", answer }, now);

/** 当前题型对应的一个合法答案。 */
function pickAnswer(q) {
  if (q.type === "choice") return 0;
  if (q.type === "scale") return 50;
  return "我们的答案";
}

/** 两个人各交一个合法答案，断言进入 reveal。 */
function submitBoth(room, d, now = 1000) {
  const ans = pickAnswer(d.question);
  expect(submit(room, 0, ans, now)).toBeNull();
  expect(submit(room, 1, ans, now)).toBeNull();
  expect(d.phase).toBe("reveal");
}

describe("你懂我吗 · 初始状态", () => {
  it("房主先当主角，题目数量与分类正确", () => {
    const { d } = newGame();
    expect(d.idx).toBe(0);
    expect(d.total).toBe(5);
    expect(d.hero).toBe(0);
    expect(d.phase).toBe("answer");
    expect(d.submitted).toEqual([false, false]);
    expect(d.answers).toEqual([null, null]);
    expect(d.score).toBe(0);
    expect(d.lastScore).toBeNull();
    expect(d.questions.every((q) => q.category === "吃喝")).toBe(true);
    const types = new Set(d.questions.map((q) => q.type));
    expect(types.has("choice")).toBe(true);
    expect(types.has("scale")).toBe(true);
    expect(types.has("text")).toBe(true);
  });
});

describe("你懂我吗 · 三种题型答案校验", () => {
  it("choice：必须是在选项范围内的整数下标", () => {
    const { room, d } = newGame();
    d.question = d.questions.find((q) => q.type === "choice");
    const len = d.question.options.length;
    expect(submit(room, 0, len)).toBe("这个答案不太对");
    expect(submit(room, 0, -1)).toBe("这个答案不太对");
    expect(submit(room, 0, 1.5)).toBe("这个答案不太对");
    expect(d.submitted[0]).toBe(false);
    expect(submit(room, 0, 0)).toBeNull();
    expect(d.submitted[0]).toBe(true);
  });

  it("scale：必须是 0~100 的数字", () => {
    const { room, d } = newGame();
    d.question = d.questions.find((q) => q.type === "scale");
    expect(submit(room, 0, 101)).toBe("这个答案不太对");
    expect(submit(room, 0, -5)).toBe("这个答案不太对");
    expect(submit(room, 0, "50")).toBe("这个答案不太对");
    expect(submit(room, 0, 0)).toBeNull();
  });

  it("text：必须是 1~120 字的非空字符串", () => {
    const { room, d } = newGame();
    d.question = d.questions.find((q) => q.type === "text");
    expect(submit(room, 0, "")).toBe("这个答案不太对");
    expect(submit(room, 0, "   ")).toBe("这个答案不太对");
    expect(submit(room, 0, 42)).toBe("这个答案不太对");
    expect(submit(room, 0, "烤鱼")).toBeNull();
  });
});

describe("你懂我吗 · 时序", () => {
  it("先锁定答案的人不能重复交，揭晓后不能再交", () => {
    const { room, d } = newGame();
    expect(act(room, 0, { type: "next" }, 1000)).toBe("先等主角给分吧");
    expect(submit(room, 0, pickAnswer(d.question), 1000)).toBeNull();
    expect(submit(room, 0, pickAnswer(d.question), 1000)).toBe("你已经锁定答案啦");
    expect(submit(room, 1, pickAnswer(d.question), 1000)).toBeNull();
    expect(d.phase).toBe("reveal");
    expect(submit(room, 1, pickAnswer(d.question), 1000)).toBe("这道题已经揭晓啦");
    // 答案还没翻开时不能给分
    expect(act(room, 0, { type: "grade", score: 10 }, 1000)).toBe("答案还没有翻开");
  });
});

describe("你懂我吗 · 给分与推进", () => {
  it("双人提交 → 主角给分 → tick 自动 5 分 → 最后一题 over", () => {
    const { room, d } = newGame();
    const now = 1000;

    // 第 1 题：手动给分 5
    submitBoth(room, d, now);
    expect(d.revealAt).toBe(now + 900);
    expect(d.autoDeadline).toBe(now + 45000);
    expect(act(room, 1, { type: "grade", score: 10 }, now)).toBe("由主角来给分哦"); // 非主角
    expect(act(room, 0, { type: "grade", score: 10 }, now)).toBe("答案还没有翻开"); // 还没翻开
    expect(act(room, 0, { type: "grade", score: 7 }, d.revealAt)).toBe("分数不太对"); // 非法分数
    expect(act(room, 0, { type: "grade", score: 5 }, d.revealAt)).toBeNull();
    expect(d.phase).toBe("revealed");
    expect(d.score).toBe(5);
    expect(d.lastScore).toBe(5);
    expect(d.history).toHaveLength(1);
    expect(act(room, 0, { type: "next" }, 2000)).toBeNull();
    expect(d.idx).toBe(1);
    expect(d.hero).toBe(1);

    // 第 2 题：交给 tick 自动 5 分
    submitBoth(room, d, 2000);
    const before = d.score;
    expect(knowMe.tick(room, d.autoDeadline - 1)).toBe(false);
    expect(knowMe.tick(room, d.autoDeadline)).toBe(true);
    expect(d.phase).toBe("revealed");
    expect(d.score).toBe(before + 5);
    expect(d.lastScore).toBe(5);
    expect(act(room, 0, { type: "next" }, 3000)).toBeNull();
    expect(d.idx).toBe(2);

    // 第 3 题：主角给 10
    submitBoth(room, d, 3000);
    expect(act(room, d.hero, { type: "grade", score: 10 }, d.revealAt)).toBeNull();
    expect(act(room, 0, { type: "next" }, 4000)).toBeNull();
    expect(d.idx).toBe(3);

    // 第 4 题：主角给 0
    submitBoth(room, d, 4000);
    expect(act(room, d.hero, { type: "grade", score: 0 }, d.revealAt)).toBeNull();
    expect(act(room, 0, { type: "next" }, 5000)).toBeNull();
    expect(d.idx).toBe(4);

    // 第 5 题（最后一题）：给分后 next 直接结束
    submitBoth(room, d, 5000);
    expect(act(room, d.hero, { type: "grade", score: 10 }, d.revealAt)).toBeNull();
    expect(act(room, 0, { type: "next" }, 6000)).toBeNull();
    expect(d.phase).toBe("over");
    expect(d.score).toBe(30); // 5 + 5 + 10 + 0 + 10
    expect(d.history).toHaveLength(5);
  });
});

describe("你懂我吗 · 题库完整性", () => {
  const CATEGORIES = ["吃喝", "习惯", "回忆", "恋爱", "假如", "未来"];

  it("id 唯一，分类和题型合法", () => {
    expect(questions.length).toBeGreaterThanOrEqual(120);
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
    for (const q of questions) {
      expect(CATEGORIES).toContain(q.category);
      expect(["choice", "scale", "text"]).toContain(q.type);
      expect(typeof q.text).toBe("string");
      expect(q.text.length).toBeGreaterThan(0);
      expect(q.text.length).toBeLessThanOrEqual(120);
    }
  });

  it("每种题型字段完整", () => {
    for (const q of questions) {
      if (q.type === "choice") {
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.options.every((o) => typeof o === "string" && o.length > 0)).toBe(true);
      } else if (q.type === "scale") {
        expect(typeof q.left).toBe("string");
        expect(typeof q.right).toBe("string");
        expect(q.left.length).toBeGreaterThan(0);
        expect(q.right.length).toBeGreaterThan(0);
      } else {
        expect(q.options ?? null).toBeNull();
        expect(q.left ?? null).toBeNull();
        expect(q.right ?? null).toBeNull();
      }
    }
  });

  it("六个分类每类至少 18 道，题型比例大致均衡", () => {
    for (const cat of CATEGORIES) {
      const list = questions.filter((q) => q.category === cat);
      expect(list.length).toBeGreaterThanOrEqual(18);
      for (const type of ["choice", "scale", "text"]) {
        expect(list.filter((q) => q.type === type).length).toBeGreaterThan(0);
      }
    }
  });

  it("create 只抽设置里的分类，数量与设置一致", () => {
    const { d } = newGame({ count: 8, categories: ["吃喝", "习惯"] });
    expect(d.total).toBe(8);
    expect(d.questions).toHaveLength(8);
    expect(d.questions.every((q) => ["吃喝", "习惯"].includes(q.category))).toBe(true);
    expect(new Set(d.questions.map((q) => q.id)).size).toBe(8);
  });
});

describe("你懂我吗 · 结算", () => {
  it("summary 返回默契指数", () => {
    const { room, d } = newGame();
    const s = knowMe.summary(room);
    expect(s.title).toBe("你懂我吗");
    expect(typeof s.detail).toBe("string");
    expect(s.detail.length).toBeGreaterThan(0);
    expect(d.total * 10).toBe(50);
    expect(s.data.pct).toBe(0);
    expect(s.data.score).toBe(0);
  });
});
