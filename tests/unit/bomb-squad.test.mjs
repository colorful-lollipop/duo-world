import { describe, it, expect } from "vitest";
import bombSquad from "../../server/games/bomb-squad.mjs";
import { makeBomb, answerOf, MANUAL, PRIORITY } from "../../server/games/_bomb-squad.bomb.mjs";
import { makeRoom, startGame } from "./_room.mjs";

const WIRE_COLORS = ["红", "蓝", "黄", "白", "黑"];
const SERIAL_RE = /^[A-Z]\d-\d\d$/;

function newGame(settings = {}) {
  const room = makeRoom({ gameId: "bomb-squad", settings: { "bomb-squad": settings } });
  const d = startGame(room);
  return { room, d };
}

/** 用固定 seed 的炸弹替换随机生成的那一颗，方便断言。 */
function seeded(seed, settings = {}) {
  const { room, d } = newGame(settings);
  const bomb = makeBomb(seed);
  Object.assign(d, {
    serial: bomb.serial,
    batteries: bomb.batteries,
    modules: bomb.modules,
    answers: bomb.answers,
  });
  return { room, d, bomb };
}

const act = (room, seat, action, now = 1000) => bombSquad.action(room, seat, action, now);
const modByType = (d, type) => d.modules.find((m) => m.type === type);
const ctxFor = (d) => ({ serial: d.serial, batteries: d.batteries, modules: d.modules });

/** 造一个只有 wires 的模块，直接测 answerOf。 */
function wireModule(wires) {
  return { id: "m1", type: "wires", title: "剪线", done: false, wires };
}

/** 造一个只有 symbols 的模块（传 key 列表，按面板显示顺序）。 */
function symbolModule(keys) {
  return {
    id: "m2",
    type: "symbols",
    title: "符号顺序",
    done: false,
    symbols: keys.map((k) => {
      const s = PRIORITY.find((p) => p.key === k);
      return { key: s.key, label: s.label, emoji: s.emoji };
    }),
    progress: [],
  };
}

describe("一起拆弹 · makeBomb", () => {
  it("同 seed 稳定，三个模块各一个且顺序随机", () => {
    const a = makeBomb(12345);
    const b = makeBomb(12345);
    expect(b).toEqual(a);
    expect(a.modules).toHaveLength(3);
    expect(a.modules.map((m) => m.type).sort()).toEqual(["switches", "symbols", "wires"]);
    expect(a.modules.map((m) => m.id).sort()).toEqual(["m1", "m2", "m3"]);
    expect(modByType({ modules: a.modules }, "wires").id).toBe("m1");
    expect(modByType({ modules: a.modules }, "symbols").id).toBe("m2");
    expect(modByType({ modules: a.modules }, "switches").id).toBe("m3");
  });

  it("序列号格式正确，最后一位一定是数字", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const bomb = makeBomb(seed);
      expect(bomb.serial).toMatch(SERIAL_RE);
      expect(/\d$/.test(bomb.serial)).toBe(true);
      expect(bomb.batteries).toBeGreaterThanOrEqual(1);
      expect(bomb.batteries).toBeLessThanOrEqual(3);
      expect(Number.isInteger(bomb.batteries)).toBe(true);
    }
  });

  it("剪线 3..5 根、符号 4 个不重复、开关三个", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { modules } = makeBomb(seed);
      const wires = modules.find((m) => m.type === "wires");
      expect(wires.wires.length).toBeGreaterThanOrEqual(3);
      expect(wires.wires.length).toBeLessThanOrEqual(5);
      for (const c of wires.wires) expect(WIRE_COLORS).toContain(c);

      const symbols = modules.find((m) => m.type === "symbols");
      expect(symbols.symbols).toHaveLength(4);
      expect(new Set(symbols.symbols.map((s) => s.key)).size).toBe(4);
      expect(symbols.progress).toEqual([]);
      for (const s of symbols.symbols) {
        const p = PRIORITY.find((x) => x.key === s.key);
        expect(p).toBeTruthy();
        expect(s.label).toBe(p.label);
      }

      const switches = modules.find((m) => m.type === "switches");
      expect(switches.switches.map((s) => s.label)).toEqual(["红", "蓝", "黄"]);
      for (const s of switches.switches) expect(typeof s.up).toBe("boolean");
    }
  });

  it("每个模块都有答案，符号答案是完整顺序", () => {
    const bomb = makeBomb(777);
    for (const m of bomb.modules) expect(bomb.answers[m.id]).toBeDefined();
    const symbols = bomb.modules.find((m) => m.type === "symbols");
    expect(bomb.answers[symbols.id]).toHaveLength(4);
  });
});

describe("一起拆弹 · 手册规则：剪线", () => {
  it("3 根线：没红线剪第 2 根", () => {
    expect(answerOf(wireModule(["蓝", "黄", "黑"]), { serial: "K7-41" })).toBe(1);
  });

  it("3 根线：第 3 根是白线剪第 3 根", () => {
    expect(answerOf(wireModule(["红", "蓝", "白"]), { serial: "K7-42" })).toBe(2);
  });

  it("3 根线：其余剪第 1 根", () => {
    expect(answerOf(wireModule(["红", "蓝", "黄"]), { serial: "K7-41" })).toBe(0);
  });

  it("4 根线：奇数序列号 + 第 1 根红线剪第 1 根", () => {
    expect(answerOf(wireModule(["红", "蓝", "黄", "白"]), { serial: "K7-41" })).toBe(0);
  });

  it("4 根线：最后一根黄线且没红线剪第 1 根", () => {
    expect(answerOf(wireModule(["蓝", "蓝", "白", "黄"]), { serial: "K7-42" })).toBe(0);
  });

  it("4 根线：恰好一根蓝线剪第 2 根", () => {
    expect(answerOf(wireModule(["红", "白", "蓝", "白"]), { serial: "K7-42" })).toBe(1);
  });

  it("4 根线：其余剪第 4 根", () => {
    expect(answerOf(wireModule(["红", "红", "白", "白"]), { serial: "K7-42" })).toBe(3);
  });

  it("5 根线：偶数序列号 + 第 2 根蓝线剪第 4 根（优先于红线规则）", () => {
    expect(answerOf(wireModule(["红", "蓝", "黄", "白", "黑"]), { serial: "K7-42" })).toBe(3);
  });

  it("5 根线：恰好一根红线且最后一根不是红线剪第 1 根", () => {
    expect(answerOf(wireModule(["红", "蓝", "蓝", "黄", "白"]), { serial: "K7-41" })).toBe(0);
  });

  it("5 根线：第 3 根白线剪第 3 根", () => {
    expect(answerOf(wireModule(["蓝", "黄", "白", "黄", "黄"]), { serial: "K7-42" })).toBe(2);
  });

  it("5 根线：其余剪最后一根", () => {
    expect(answerOf(wireModule(["蓝", "黄", "蓝", "黄", "黄"]), { serial: "K7-42" })).toBe(4);
  });
});

describe("一起拆弹 · 手册规则：符号顺序", () => {
  const display = ["moon", "sun", "skull", "star"];

  it("奇数序列号：按优先级从高到低", () => {
    expect(answerOf(symbolModule(display), { serial: "K7-41" })).toEqual(["sun", "star", "moon", "skull"]);
  });

  it("偶数序列号：整个顺序倒过来", () => {
    expect(answerOf(symbolModule(display), { serial: "K7-42" })).toEqual(["skull", "moon", "star", "sun"]);
  });
});

describe("一起拆弹 · 手册规则：拨开关", () => {
  const switches = { id: "m3", type: "switches", title: "拨开关", done: false, switches: [] };

  it("红看序列号奇偶、蓝看电池奇偶、黄看电线数奇偶", () => {
    const ctx = {
      serial: "K7-41", // 奇数
      batteries: 1, // 奇数
      modules: [wireModule(["红", "蓝", "白"])], // 3 根（奇数）
    };
    expect(answerOf(switches, ctx)).toEqual({ 红: true, 蓝: true, 黄: false });
  });

  it("偶数序列号 / 偶数电池 / 偶数根线", () => {
    const ctx = {
      serial: "K7-42",
      batteries: 2,
      modules: [wireModule(["红", "蓝", "白", "黑"])],
    };
    expect(answerOf(switches, ctx)).toEqual({ 红: false, 蓝: false, 黄: true });
  });
});

describe("一起拆弹 · 手册内容", () => {
  it("手册覆盖三个模块，文案与规则一致", () => {
    expect(MANUAL.sections.map((s) => s.type)).toEqual(["wires", "symbols", "switches"]);
    const text = JSON.stringify(MANUAL);
    expect(text).toContain("没有红线");
    expect(text).toContain("顺序倒过来");
    expect(text).toContain("电池数是奇数");
  });
});

describe("一起拆弹 · 视图裁切", () => {
  it("拆弹员拿不到 answers / manual，但有完整模块细节", () => {
    const { d } = seeded(2024, { defuser: 0 });
    const view = bombSquad.view(d, 0);
    expect(view.answers).toBeUndefined();
    expect(view.manual).toBeNull();
    expect(view.serial).toBe(d.serial);
    expect(view.batteries).toBe(d.batteries);
    const wires = view.modules.find((m) => m.type === "wires");
    expect(Array.isArray(wires.wires)).toBe(true);
    const symbols = view.modules.find((m) => m.type === "symbols");
    expect(symbols.symbols).toHaveLength(4);
  });

  it("专家拿到手册，但没有序列号 / 电池 / answers / 模块细节", () => {
    const { d } = seeded(2024, { defuser: 0 });
    const view = bombSquad.view(d, 1);
    expect(view.answers).toBeUndefined();
    expect(view.manual).toBe(MANUAL);
    expect(view.serial).toBeNull();
    expect(view.batteries).toBeNull();
    for (const m of view.modules) {
      expect(Object.keys(m).sort()).toEqual(["done", "id", "title", "type"]);
    }
  });

  it("拆弹员是座位 1 时同样按座位裁切", () => {
    const { d } = seeded(2024, { defuser: 1 });
    const defuserView = bombSquad.view(d, 1);
    const expertView = bombSquad.view(d, 0);
    expect(defuserView.manual).toBeNull();
    expect(defuserView.serial).toBe(d.serial);
    expect(expertView.manual).toBe(MANUAL);
    expect(expertView.serial).toBeNull();
  });
});

describe("一起拆弹 · 动作", () => {
  it("只有拆弹员能操作", () => {
    const { room } = seeded(11, { defuser: 0 });
    const err = act(room, 1, { type: "cut", module: "m1", index: 0 });
    expect(typeof err).toBe("string");
    expect(err).toContain("手册");
  });

  it("剪对完成模块，剪错记失误", () => {
    const { room, d } = seeded(11, { defuser: 0 });
    const wires = modByType(d, "wires");
    const answer = answerOf(wires, ctxFor(d));
    expect(act(room, 0, { type: "cut", module: wires.id, index: answer })).toBeNull();
    expect(wires.done).toBe(true);
    expect(d.solved).toBe(1);
    expect(d.strikes).toBe(0);
    expect(d.lastEvent.kind).toBe("solved");

    // 已完成的模块不能再动
    expect(act(room, 0, { type: "cut", module: wires.id, index: answer })).toContain("已经拆完");

    const symbols = modByType(d, "symbols");
    const right = answerOf(symbols, ctxFor(d))[0];
    const wrong = symbols.symbols.map((s) => s.key).find((k) => k !== right);
    expect(act(room, 0, { type: "press", module: symbols.id, symbol: wrong })).toBeNull();
    expect(d.strikes).toBe(1);
    expect(d.lastEvent.kind).toBe("strike");
  });

  it("符号按对推进，按错清空进度并记失误", () => {
    const { room, d } = seeded(11, { defuser: 0 });
    const symbols = modByType(d, "symbols");
    const order = answerOf(symbols, ctxFor(d));

    expect(act(room, 0, { type: "press", module: symbols.id, symbol: order[0] })).toBeNull();
    expect(symbols.progress).toEqual([order[0]]);
    expect(d.strikes).toBe(0);

    const wrong = symbols.symbols.map((s) => s.key).find((k) => k !== order[1]);
    expect(act(room, 0, { type: "press", module: symbols.id, symbol: wrong })).toBeNull();
    expect(symbols.progress).toEqual([]);
    expect(d.strikes).toBe(1);

    // 重新按完整顺序，模块完成
    for (const key of order) {
      expect(act(room, 0, { type: "press", module: symbols.id, symbol: key })).toBeNull();
    }
    expect(symbols.done).toBe(true);
    expect(d.solved).toBe(1);

    // 面板上没有的符号不会记失误
    const before = d.strikes;
    expect(act(room, 0, { type: "press", module: symbols.id, symbol: "nope" })).toContain("已经拆完");
    expect(d.strikes).toBe(before);
  });

  it("开关提交错记失误，全部拨对后提交完成", () => {
    const { room, d } = seeded(11, { defuser: 0 });
    const sw = modByType(d, "switches");
    const target = answerOf(sw, ctxFor(d));

    // 先翻一次，确保和答案相反
    const firstLabel = sw.switches[0].label;
    if (Boolean(sw.switches[0].up) === Boolean(target[firstLabel])) {
      expect(act(room, 0, { type: "toggle", module: sw.id, index: 0 })).toBeNull();
    }
    expect(act(room, 0, { type: "submit", module: sw.id })).toBeNull();
    expect(sw.done).toBe(false);
    expect(d.strikes).toBe(1);
    expect(d.lastEvent.kind).toBe("strike");

    // 逐个拨到目标位置
    sw.switches.forEach((s, i) => {
      if (Boolean(s.up) !== Boolean(target[s.label])) {
        expect(act(room, 0, { type: "toggle", module: sw.id, index: i })).toBeNull();
      }
    });
    expect(act(room, 0, { type: "submit", module: sw.id })).toBeNull();
    expect(sw.done).toBe(true);
    expect(d.solved).toBe(1);
  });

  it("失误达到上限就爆炸，之后拒绝动作", () => {
    const { room, d } = seeded(11, { defuser: 0 });
    const wires = modByType(d, "wires");
    const answer = answerOf(wires, ctxFor(d));
    const wrong = (answer + 1) % wires.wires.length;

    expect(act(room, 0, { type: "cut", module: wires.id, index: wrong })).toBeNull();
    expect(d.strikes).toBe(1);
    expect(act(room, 0, { type: "cut", module: wires.id, index: wrong })).toBeNull();
    expect(d.strikes).toBe(2);
    expect(d.phase).toBe("playing");
    expect(act(room, 0, { type: "cut", module: wires.id, index: wrong })).toBeNull();
    expect(d.strikes).toBe(3);
    expect(d.phase).toBe("over");
    expect(d.result).toBe("boom");
    expect(d.lastEvent.kind).toBe("boom");

    expect(act(room, 0, { type: "cut", module: wires.id, index: answer })).toContain("结束");
  });

  it("拆完三个模块就成功，并且不再接受动作", () => {
    const { room, d } = seeded(11, { defuser: 0 });
    const wires = modByType(d, "wires");
    const symbols = modByType(d, "symbols");
    const sw = modByType(d, "switches");

    expect(act(room, 0, { type: "cut", module: wires.id, index: answerOf(wires, ctxFor(d)) })).toBeNull();
    for (const key of answerOf(symbols, ctxFor(d))) {
      expect(act(room, 0, { type: "press", module: symbols.id, symbol: key })).toBeNull();
    }
    const target = answerOf(sw, ctxFor(d));
    sw.switches.forEach((s, i) => {
      if (Boolean(s.up) !== Boolean(target[s.label])) {
        expect(act(room, 0, { type: "toggle", module: sw.id, index: i })).toBeNull();
      }
    });
    expect(act(room, 0, { type: "submit", module: sw.id })).toBeNull();

    expect(d.phase).toBe("over");
    expect(d.result).toBe("defused");
    expect(d.solved).toBe(3);
    expect(act(room, 0, { type: "toggle", module: sw.id, index: 0 })).toContain("结束");
  });

  it("tick 到点判超时，重复 tick 不再触发", () => {
    const { room, d } = seeded(11, { defuser: 0 });
    d.deadline = 5000;
    expect(bombSquad.tick(room, 4999)).toBe(false);
    expect(bombSquad.tick(room, 5000)).toBe(true);
    expect(d.phase).toBe("over");
    expect(d.result).toBe("timeout");
    expect(bombSquad.tick(room, 9000)).toBe(false);
  });

  it("难度决定时间与失误上限", () => {
    const easy = newGame({ difficulty: "easy", defuser: 0 });
    expect(easy.d.timeLimit).toBe(300);
    expect(easy.d.maxStrikes).toBe(4);
    const hard = newGame({ difficulty: "hard", defuser: 1 });
    expect(hard.d.timeLimit).toBe(150);
    expect(hard.d.maxStrikes).toBe(2);
    expect(hard.d.defuser).toBe(1);
  });
});

describe("一起拆弹 · 结算", () => {
  it("success 的 summary 有中文标题和剩余秒数", () => {
    const { room, d } = seeded(11, { defuser: 0 });
    const wires = modByType(d, "wires");
    act(room, 0, { type: "cut", module: wires.id, index: answerOf(wires, ctxFor(d)) });
    d.solved = 3;
    d.total = 3;
    d.strikes = 1;
    d.phase = "over";
    d.result = "defused";
    d.endedAt = d.startedAt + 90000;
    const summary = bombSquad.summary(room);
    expect(summary.title).toBe("一起拆弹");
    expect(summary.detail).toContain("还剩");
    expect(summary.data).toMatchObject({ result: "defused", solved: 3, total: 3, strikes: 1, difficulty: "normal" });
    expect(summary.data.seconds).toBe(90);
  });

  it("爆炸和超时也有对应文案", () => {
    const boom = seeded(11, { defuser: 0 });
    boom.d.phase = "over";
    boom.d.result = "boom";
    boom.d.solved = 1;
    boom.d.strikes = 3;
    boom.d.endedAt = boom.d.startedAt + 30000;
    const boomSummary = bombSquad.summary(boom.room);
    expect(boomSummary.detail).toContain("爆炸");
    expect(boomSummary.data).toMatchObject({ result: "boom", solved: 1, strikes: 3 });

    const timeout = seeded(11, { defuser: 0 });
    timeout.d.phase = "over";
    timeout.d.result = "timeout";
    timeout.d.solved = 2;
    timeout.d.endedAt = timeout.d.startedAt + 210000;
    const timeoutSummary = bombSquad.summary(timeout.room);
    expect(timeoutSummary.detail).toContain("还有");
    expect(timeoutSummary.data.result).toBe("timeout");
  });
});
