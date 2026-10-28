import { describe, it, expect } from "vitest";
import drawGuess from "../../server/games/draw-guess.mjs";
import { makeRoom, startGame } from "./_room.mjs";

// 固定词条，避免 shuffle 随机导致用例不确定
const WORDS = [
  { w: "火锅", lib: "日常", lvl: 1 },
  { w: "雨伞", lib: "日常", lvl: 1 },
  { w: "西瓜", lib: "日常", lvl: 1 },
];

function newGame(settings = {}) {
  const room = makeRoom({
    gameId: "draw-guess",
    settings: { "draw-guess": { rounds: 2, seconds: 80, libraries: ["日常", "恋爱"], ...settings } },
  });
  const d = startGame(room);
  d.choices = WORDS.map((w) => ({ ...w })); // 覆盖成确定的三个词
  return { room, d };
}

const choose = (room, seat, index, now = 1000) => drawGuess.action(room, seat, { type: "choose", index }, now);
const guess = (room, seat, text, now = 1000) => drawGuess.action(room, seat, { type: "guess", text }, now);

describe("你画我猜 · 初始状态", () => {
  it("开局是选词阶段，房主当画手", () => {
    const room = makeRoom({ gameId: "draw-guess" });
    const d = startGame(room);
    expect(d.rounds).toBe(6);
    expect(d.total).toBe(6);
    expect(d.round).toBe(0);
    expect(d.drawer).toBe(0);
    expect(d.phase).toBe("choose");
    expect(d.choices).toHaveLength(3);
    expect(d.answer).toBeNull();
    expect(d.score).toBe(0);
    expect(d.correctRounds).toBe(0);
    expect(d.deadline).toBeGreaterThan(0);
  });
});

describe("你画我猜 · 选词", () => {
  it("只有画手能选词，选完进入作画阶段", () => {
    const { room, d } = newGame();
    expect(choose(room, 1, 0)).toBe("轮到 TA 选词啦");
    expect(choose(room, 0, 9)).toBe("这个选项不存在");
    expect(choose(room, 0, 0, 1000)).toBeNull();
    expect(d.phase).toBe("drawing");
    expect(d.answer).toBe("火锅");
    expect(d.category).toBe("日常");
    expect(d.deadline).toBe(1000 + 80000);
    expect(d.used).toContain("日常:火锅");
    expect(d.strokes).toEqual([]);
    // 已经不在选词阶段
    expect(choose(room, 0, 1)).toBe("现在不用选词啦");
  });
});

describe("你画我猜 · 猜词计分", () => {
  it("猜中得分，越早猜分越高", () => {
    const early = newGame();
    choose(early.room, 0, 0, 1000);
    expect(guess(early.room, 1, "火锅", 1000)).toBeNull();

    const late = newGame();
    choose(late.room, 0, 0, 1000);
    const deadline = late.d.deadline;
    expect(guess(late.room, 1, "火锅", deadline)).toBeNull();

    expect(early.d.score).toBe(20);
    expect(late.d.score).toBe(10);
    expect(early.d.score).toBeGreaterThan(late.d.score);
    expect(early.d.correct).toBe(true);
    expect(early.d.correctSeat).toBe(1);
    expect(early.d.phase).toBe("reveal");
    expect(early.d.roundPoints).toBe(20);
    expect(early.d.correctRounds).toBe(1);
  });

  it("画手不能猜自己的画，猜错只留近似提示", () => {
    const { room, d } = newGame();
    choose(room, 0, 0, 1000);
    expect(guess(room, 0, "火锅", 1000)).toBe("画手不能猜自己的画哦");
    expect(guess(room, 1, "   ", 1000)).toBe("先写一个答案吧");
    expect(guess(room, 1, "火祸", 1000)).toBeNull(); // 差一个字，不算中
    expect(d.phase).toBe("drawing");
    expect(d.score).toBe(0);
    expect(d.guesses).toHaveLength(1);
    expect(d.guesses[0].correct).toBe(false);
    expect(d.guesses[0].near).toBe(true);
    // 同一答案不能重复猜
    expect(guess(room, 1, "火祸", 1000)).toBe("已经猜过这个啦");
  });

  it("撤销和清空只有画手能用", () => {
    const { room, d } = newGame();
    choose(room, 0, 0, 1000);
    d.strokes = [{ a: 1 }, { a: 2 }];
    expect(drawGuess.action(room, 1, { type: "undo" }, 1000)).toBe("现在还不能撤销");
    expect(drawGuess.action(room, 1, { type: "clear" }, 1000)).toBe("现在还不能清空");
    expect(d.strokes).toHaveLength(2);
    expect(drawGuess.action(room, 0, { type: "undo" }, 1000)).toBeNull();
    expect(d.strokes).toHaveLength(1);
    expect(drawGuess.action(room, 0, { type: "clear" }, 1000)).toBeNull();
    expect(d.strokes).toEqual([]);
  });
});

describe("你画我猜 · 轮次推进", () => {
  it("揭晓后 next 换画手，跑完所有轮次进入 over", () => {
    const { room, d } = newGame();
    choose(room, 0, 0, 1000);
    guess(room, 1, "火锅", 1000);
    expect(d.phase).toBe("reveal");
    expect(drawGuess.action(room, 1, { type: "next" }, 2000)).toBeNull();
    expect(d.round).toBe(1);
    expect(d.drawer).toBe(1);
    expect(d.phase).toBe("choose");

    d.choices = WORDS.map((w) => ({ ...w }));
    choose(room, 1, 1, 3000);
    expect(d.answer).toBe("雨伞");
    guess(room, 0, "雨伞", 3000);
    expect(d.phase).toBe("reveal");
    expect(drawGuess.action(room, 0, { type: "next" }, 4000)).toBeNull();
    expect(d.phase).toBe("over");
  });

  it("还没揭晓时不能 next", () => {
    const { room, d } = newGame();
    choose(room, 0, 0, 1000);
    expect(drawGuess.action(room, 0, { type: "next" }, 2000)).toBe("等这一轮揭晓吧");
  });
});

describe("你画我猜 · tick 计时", () => {
  it("选词超时自动选第一个，作画超时揭晓 0 分，之后自动推进", () => {
    const { room, d } = newGame();
    d.deadline = 500;
    expect(drawGuess.tick(room, 100)).toBe(false);
    expect(drawGuess.tick(room, 600)).toBe(true);
    expect(d.phase).toBe("drawing");
    expect(d.answer).toBe(d.choices[0].w); // 自动选第一个词

    d.deadline = 1000;
    const beforeScore = d.score;
    expect(drawGuess.tick(room, 2000)).toBe(true);
    expect(d.phase).toBe("reveal");
    expect(d.roundPoints).toBe(0);
    expect(d.score).toBe(beforeScore);
    expect(d.correctRounds).toBe(0);

    expect(drawGuess.tick(room, d.revealAt)).toBe(true);
    expect(d.phase).toBe("choose");
    expect(d.round).toBe(1);
  });
});

describe("你画我猜 · 结算", () => {
  it("summary 返回中文标题和非空说明", () => {
    const { room, d } = newGame();
    choose(room, 0, 0, 1000);
    guess(room, 1, "火锅", 1000);
    const s = drawGuess.summary(room);
    expect(s.title).toBe("你画我猜");
    expect(typeof s.detail).toBe("string");
    expect(s.detail.length).toBeGreaterThan(0);
    expect(s.data.score).toBe(d.score);
    expect(s.data.correctRounds).toBe(1);
  });
});
