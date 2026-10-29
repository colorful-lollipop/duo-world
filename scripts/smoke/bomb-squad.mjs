// 一起拆弹：端到端冒烟（npm run smoke:game -- bomb-squad 可单独跑）。
// 每个游戏一个文件，只改自己的，不要动 scripts/smoke.mjs。
import { enterGame, findJournal } from "./_harness.mjs";
import { answerOf } from "../../server/games/_bomb-squad.bomb.mjs";

export default async function run({ A, B, waitUntil, assert, sleep }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "bomb-squad",
    settings: { difficulty: "normal", defuser: 0 },
    ready: () => A.game()?.phase === "playing" && B.game()?.phase === "playing",
  });

  // ---------- 开局：两个座位看到的东西不一样 ----------
  const a = A.game();
  const b = B.game();
  assert(A.seat === 0 && B.seat === 1, "bomb seats");
  assert(a.defuser === 0, "bomb defuser seat 0");
  assert(a.difficulty === "normal" && a.timeLimit === 210 && a.maxStrikes === 3, "bomb difficulty normal");
  assert(typeof a.serial === "string" && a.serial.length >= 4, "defuser sees serial");
  assert(a.batteries >= 1 && a.batteries <= 3, "defuser sees batteries");
  assert(Array.isArray(a.modules) && a.modules.length === 3, "defuser sees 3 modules");
  assert(Array.isArray(a.modules.find((m) => m.type === "wires")?.wires), "defuser sees wire colors");
  assert(Array.isArray(a.modules.find((m) => m.type === "symbols")?.symbols), "defuser sees symbols");
  assert(a.manual === null || a.manual === undefined, "defuser has no manual");
  assert(a.answers === undefined, "defuser cannot see answers");

  assert(b.manual && Array.isArray(b.manual.sections) && b.manual.sections.length === 3, "expert sees manual");
  assert(b.serial === null && b.batteries === null, "expert cannot see serial / batteries");
  assert(b.answers === undefined, "expert cannot see answers");
  assert(
    b.modules.every((m) => !("wires" in m) && !("symbols" in m) && !("switches" in m) && !("progress" in m)),
    "expert modules have no details",
  );
  assert(b.solved === 0 && b.total === 3, "expert sees progress");

  // ---------- 专家不能动手 ----------
  const errorsBefore = B.errors.length;
  B.act({ type: "toggle", module: b.modules[0].id, index: 0 });
  await waitUntil(() => B.errors.length > errorsBefore, "expert action rejected");
  const lastError = B.errors[B.errors.length - 1];
  assert(typeof lastError === "string" && lastError.includes("手册"), "expert rejection is Chinese hint: " + lastError);
  assert(A.game().strikes === 0, "rejected action does not count a strike");
  console.log("done: bomb views split + expert rejected");

  // ---------- 故意剪错一次 ----------
  const wires = a.modules.find((m) => m.type === "wires");
  assert(wires, "wires module exists");
  const wiresAnswer = answerOf(wires, { serial: a.serial, batteries: a.batteries, modules: a.modules });
  const wrongIndex = (wiresAnswer + 1) % wires.wires.length;
  A.act({ type: "cut", module: wires.id, index: wrongIndex });
  await waitUntil(() => A.game().strikes === 1, "bomb strike counted");
  assert(A.game().phase === "playing", "still playing after one strike");
  console.log("done: bomb strike counted");

  // ---------- 按手册拆完三个模块 ----------
  const cutWires = A.game().modules.find((m) => m.id === wires.id);
  const cutAnswer = answerOf(cutWires, {
    serial: A.game().serial,
    batteries: A.game().batteries,
    modules: A.game().modules,
  });
  A.act({ type: "cut", module: cutWires.id, index: cutAnswer });
  await waitUntil(() => A.game().modules.find((m) => m.id === cutWires.id)?.done, "wires solved");
  assert(A.game().solved === 1, "solved 1 after wires");

  const sym = A.game().modules.find((m) => m.type === "symbols");
  const order = answerOf(sym, {
    serial: A.game().serial,
    batteries: A.game().batteries,
    modules: A.game().modules,
  });
  assert(Array.isArray(order) && order.length === 4, "symbol answer is full order");
  for (let i = 0; i < order.length; i++) {
    A.act({ type: "press", module: sym.id, symbol: order[i] });
    await waitUntil(() => {
      const m = A.game().modules.find((x) => x.id === sym.id);
      return !!m && (m.done || (m.progress || []).length === i + 1);
    }, "symbol step " + (i + 1));
  }
  assert(A.game().solved === 2, "solved 2 after symbols");

  const sw = A.game().modules.find((m) => m.type === "switches");
  const target = answerOf(sw, {
    serial: A.game().serial,
    batteries: A.game().batteries,
    modules: A.game().modules,
  });
  sw.switches.forEach((s, i) => {
    if (Boolean(s.up) !== Boolean(target[s.label])) A.act({ type: "toggle", module: sw.id, index: i });
  });
  A.act({ type: "submit", module: sw.id });

  await waitUntil(() => A.game().phase === "over", "bomb over");
  assert(A.game().result === "defused", "bomb defused");
  assert(A.game().solved === 3, "all three modules solved");
  console.log("done: bomb defused");

  const entry = await waitUntil(() => findJournal(A, "bomb-squad"), "bomb journal");
  assert(entry.data.result === "defused", "journal result");
  assert(entry.data.solved === 3 && entry.data.total === 3, "journal solved");
  assert(entry.data.strikes === 1, "journal strikes");
  assert(typeof entry.detail === "string" && entry.detail.includes("还剩"), "journal detail");
  console.log("done: bomb-squad flow + journal");
}
