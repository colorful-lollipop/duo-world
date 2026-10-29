// 一起拆弹：题库 / 数值 / 手册。
// 文件名以下划线开头，自动发现器会跳过；只被 server/games/bomb-squad.mjs 和测试 / 冒烟 import。
//
// 这里全部是纯函数：同样的 seed 一定生成同一颗炸弹，方便单测和冒烟直接算出正确答案。

const WIRE_COLORS = ["红", "蓝", "黄", "白", "黑"];

/** 符号优先级：从高到低。太阳最高，骷髅最低。 */
export const PRIORITY = [
  { key: "sun", label: "太阳", emoji: "☀️" },
  { key: "star", label: "星星", emoji: "⭐" },
  { key: "moon", label: "月亮", emoji: "🌙" },
  { key: "rain", label: "雨滴", emoji: "💧" },
  { key: "fire", label: "火焰", emoji: "🔥" },
  { key: "leaf", label: "叶子", emoji: "🍃" },
  { key: "heart", label: "爱心", emoji: "💗" },
  { key: "skull", label: "骷髅", emoji: "💀" },
];

export const SWITCH_LABELS = ["红", "蓝", "黄"];

/** 难度 → 时间与失误上限（秒）。 */
export const DIFFICULTY = {
  easy: { timeLimit: 300, maxStrikes: 4 },
  normal: { timeLimit: 210, maxStrikes: 3 },
  hard: { timeLimit: 150, maxStrikes: 2 },
};

/**
 * 专家手册。文案必须和 answerOf 的判定完全一致。
 * groups[].when 是这一组的条件，items 是「从上往下第一条符合的就照做」的具体步骤。
 */
export const MANUAL = {
  intro: "手册只在你手里。让拆弹员把颜色、符号、序列号念给你听，你负责找出对应的那一条。",
  sections: [
    {
      type: "wires",
      title: "剪线",
      icon: "✂️",
      note: "线从左到右编号，从 1 开始。从上往下读，第一条符合的就照做。",
      groups: [
        {
          when: "3 根线",
          items: ["没有红线 → 剪第 2 根", "否则，第 3 根是白线 → 剪第 3 根", "否则 → 剪第 1 根"],
        },
        {
          when: "4 根线",
          items: [
            "序列号最后一位是奇数，且第 1 根是红线 → 剪第 1 根",
            "否则，最后一根是黄线且没有红线 → 剪第 1 根",
            "否则，恰好一根蓝线 → 剪第 2 根",
            "否则 → 剪第 4 根",
          ],
        },
        {
          when: "5 根线",
          items: [
            "序列号最后一位是偶数，且第 2 根是蓝线 → 剪第 4 根",
            "否则，恰好一根红线且最后一根不是红线 → 剪第 1 根",
            "否则，第 3 根是白线 → 剪第 3 根",
            "否则 → 剪最后一根",
          ],
        },
      ],
    },
    {
      type: "symbols",
      title: "符号顺序",
      icon: "🔣",
      note: "面板上有 4 个符号，按优先级从高到低各按一次。",
      groups: [
        {
          when: "优先级（高 → 低）",
          items: ["☀️ 太阳 → ⭐ 星星 → 🌙 月亮 → 💧 雨滴 → 🔥 火焰 → 🍃 叶子 → 💗 爱心 → 💀 骷髅"],
        },
        {
          when: "序列号最后一位是偶数",
          items: ["整个顺序倒过来：先按优先级最低的，最后按最高的"],
        },
      ],
    },
    {
      type: "switches",
      title: "拨开关",
      icon: "🔀",
      note: "三个开关分别拨到目标位置（上 / 下），全部拨好后按「确认」。",
      groups: [
        {
          when: "红开关",
          items: ["序列号最后一位是奇数 → 朝上", "最后一位是偶数 → 朝下"],
        },
        {
          when: "蓝开关",
          items: ["电池数是奇数 → 朝上", "电池数是偶数 → 朝下"],
        },
        {
          when: "黄开关",
          items: ["剪线模块的电线是偶数根 → 朝上", "电线是奇数根 → 朝下"],
        },
      ],
    },
  ],
};

/** mulberry32：小而稳的确定性随机数。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function intBelow(rnd, n) {
  return Math.floor(rnd() * n);
}

function shuffleWith(rnd, list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = intBelow(rnd, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeSerial(rnd) {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const letter = letters[intBelow(rnd, letters.length)];
  const head = intBelow(rnd, 10);
  const a = intBelow(rnd, 10);
  const b = intBelow(rnd, 10);
  return `${letter}${head}-${a}${b}`;
}

function makeWires(rnd) {
  const count = 3 + intBelow(rnd, 3); // 3..5
  const wires = [];
  for (let i = 0; i < count; i++) wires.push(WIRE_COLORS[intBelow(rnd, WIRE_COLORS.length)]);
  return { id: "m1", type: "wires", title: "剪线", done: false, wires };
}

function makeSymbols(rnd) {
  const picked = shuffleWith(rnd, PRIORITY).slice(0, 4);
  return {
    id: "m2",
    type: "symbols",
    title: "符号顺序",
    done: false,
    symbols: picked.map((s) => ({ key: s.key, label: s.label, emoji: s.emoji })),
    progress: [],
  };
}

function makeSwitches(rnd) {
  return {
    id: "m3",
    type: "switches",
    title: "拨开关",
    done: false,
    switches: SWITCH_LABELS.map((label) => ({ label, up: rnd() < 0.5 })),
  };
}

function countColor(wires, color) {
  return wires.filter((w) => w === color).length;
}

/** 序列号最后一位数字（非法序列号按 0 处理）。 */
export function serialLastDigit(serial) {
  const s = String(serial || "");
  const n = Number(s[s.length - 1]);
  return Number.isFinite(n) ? n : 0;
}

function wiresAnswer(wires, odd) {
  const n = wires.length;
  if (n === 3) {
    if (countColor(wires, "红") === 0) return 1;
    if (wires[2] === "白") return 2;
    return 0;
  }
  if (n === 4) {
    if (odd && wires[0] === "红") return 0;
    if (wires[3] === "黄" && countColor(wires, "红") === 0) return 0;
    if (countColor(wires, "蓝") === 1) return 1;
    return 3;
  }
  if (n === 5) {
    if (!odd && wires[1] === "蓝") return 3;
    if (countColor(wires, "红") === 1 && wires[4] !== "红") return 0;
    if (wires[2] === "白") return 2;
    return 4;
  }
  return Math.max(0, n - 1);
}

/**
 * 算出模块的正确答案。
 * - 剪线：0-based 下标
 * - 符号：key 数组（完整按下顺序）
 * - 开关：{ 红: boolean, 蓝: boolean, 黄: boolean }（true = 朝上）
 * @param {object} module
 * @param {{ serial?: string, batteries?: number, modules?: object[] }} ctx
 */
export function answerOf(module, ctx = {}) {
  const odd = serialLastDigit(ctx.serial) % 2 === 1;
  if (module.type === "wires") return wiresAnswer(module.wires || [], odd);
  if (module.type === "symbols") {
    const present = new Set((module.symbols || []).map((s) => s.key));
    const order = PRIORITY.filter((s) => present.has(s.key)).map((s) => s.key);
    // 偶数 → 整个顺序倒过来
    return odd ? order : order.slice().reverse();
  }
  if (module.type === "switches") {
    const modules = ctx.modules || [];
    const wireModule = modules.find((m) => m.type === "wires");
    const wireCount = wireModule ? (wireModule.wires || []).length : 3;
    const batteries = Number(ctx.batteries) || 1;
    return {
      红: odd,
      蓝: batteries % 2 === 1,
      黄: wireCount % 2 === 0,
    };
  }
  return null;
}

/**
 * 生成一颗炸弹（纯函数，同 seed 结果完全一致）。
 * 三个模块固定各一个（m1 剪线 / m2 符号 / m3 开关），数组顺序随机。
 */
export function makeBomb(seed, difficulty = "normal") {
  const rnd = mulberry32(Number(seed) || 1);
  const serial = makeSerial(rnd);
  const batteries = 1 + intBelow(rnd, 3); // 1..3
  const modules = shuffleWith(rnd, [makeWires(rnd), makeSymbols(rnd), makeSwitches(rnd)]);
  const ctx = { serial, batteries, modules };
  const answers = {};
  for (const m of modules) answers[m.id] = answerOf(m, ctx);
  return {
    serial,
    batteries,
    modules,
    answers,
    difficulty: DIFFICULTY[difficulty] ? difficulty : "normal",
  };
}

export { WIRE_COLORS };
