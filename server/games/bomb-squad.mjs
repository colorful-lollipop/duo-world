// 一起拆弹：服务端规则（文件名 = 游戏 id）
// 会自动被 server/games/index.mjs 发现，不需要改任何中央文件。
// 题库、手册和判定细节都在旁边的 _bomb-squad.bomb.mjs（下划线开头不会被当成游戏）。
//
// 核心：拆弹员（defuser）能看到炸弹细节，专家只能拿到手册；
// 两个座位都拿不到 answers，规则以服务端为准。
import { makeBomb, answerOf, MANUAL, DIFFICULTY } from "./_bomb-squad.bomb.mjs";

const TOTAL_MODULES = 3;

function ctxOf(d) {
  return { serial: d.serial, batteries: d.batteries, modules: d.modules };
}

function end(d, result, now) {
  d.phase = "over";
  d.result = result;
  d.endedAt = now;
  d.lastEvent = { kind: result, at: now };
}

function markSolved(d, module, now) {
  module.done = true;
  d.solved += 1;
  d.lastEvent = { kind: "solved", moduleId: module.id, at: now };
  if (d.solved >= d.total) end(d, "defused", now);
}

function strike(d, module, now) {
  d.strikes += 1;
  d.lastEvent = { kind: "strike", moduleId: module.id, at: now };
  if (d.strikes >= d.maxStrikes) end(d, "boom", now);
}

export default {
  create(room) {
    const s = room.settings?.["bomb-squad"] || {};
    const difficulty = DIFFICULTY[s.difficulty] ? s.difficulty : "normal";
    const defuser = Number(s.defuser) === 1 ? 1 : 0;
    const limit = DIFFICULTY[difficulty];
    const bomb = makeBomb(Math.floor(Math.random() * 1e9), difficulty);
    const now = Date.now();
    return {
      phase: "playing",
      result: null,
      difficulty,
      defuser,
      serial: bomb.serial,
      batteries: bomb.batteries,
      modules: bomb.modules,
      answers: bomb.answers,
      strikes: 0,
      maxStrikes: limit.maxStrikes,
      solved: 0,
      total: TOTAL_MODULES,
      startedAt: now,
      deadline: now + limit.timeLimit * 1000,
      timeLimit: limit.timeLimit,
      endedAt: 0,
      lastEvent: null,
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (!d || d.phase !== "playing") return "这一局已经结束啦";
    if (seat !== d.defuser) return "手册在你手里，让 TA 来操作";

    const type = action?.type;
    if (type !== "cut" && type !== "press" && type !== "toggle" && type !== "submit") {
      return "这个操作暂时不可以";
    }
    const module = (d.modules || []).find((m) => m && m.id === action?.module);
    if (!module) return "找不到这个模块";
    if (module.done) return "这个模块已经拆完啦";

    if (type === "cut") {
      if (module.type !== "wires") return "这个模块不是剪线";
      const index = Number(action.index);
      const wires = module.wires || [];
      if (!Number.isInteger(index) || index < 0 || index >= wires.length) return "这根线不存在";
      const answer = answerOf(module, ctxOf(d));
      if (index === answer) markSolved(d, module, now);
      else strike(d, module, now);
      return null;
    }

    if (type === "press") {
      if (module.type !== "symbols") return "这个模块不是符号顺序";
      const key = String(action.symbol || "");
      if (!(module.symbols || []).some((s) => s.key === key)) return "面板上没有这个符号";
      const answer = answerOf(module, ctxOf(d));
      const step = (module.progress || []).length;
      if (key === answer[step]) {
        module.progress.push(key);
        if (module.progress.length >= answer.length) markSolved(d, module, now);
      } else {
        module.progress = [];
        strike(d, module, now);
      }
      return null;
    }

    if (type === "toggle") {
      if (module.type !== "switches") return "这个模块不是拨开关";
      const index = Number(action.index);
      const sw = (module.switches || [])[index];
      if (!sw) return "没有这个开关";
      sw.up = !sw.up;
      return null;
    }

    // submit
    if (module.type !== "switches") return "这个模块不是拨开关";
    const target = answerOf(module, ctxOf(d));
    const ok = (module.switches || []).every((sw) => Boolean(sw.up) === Boolean(target?.[sw.label]));
    if (ok) markSolved(d, module, now);
    else strike(d, module, now);
    return null;
  },

  // 按座位藏信息：谁都不能拿到 answers。
  // 拆弹员保留序列号 / 电池 / 完整模块；专家只拿手册和模块完成状态。
  view(data, seat) {
    if (seat === data.defuser) {
      return { ...data, answers: undefined, manual: null };
    }
    return {
      ...data,
      answers: undefined,
      serial: null,
      batteries: null,
      manual: MANUAL,
      modules: (data.modules || []).map((m) => ({
        id: m.id,
        type: m.type,
        title: m.title,
        done: !!m.done,
      })),
    };
  },

  tick(room, now) {
    const d = room.game?.data;
    if (!d || d.phase !== "playing") return false;
    if (d.deadline > 0 && now >= d.deadline) {
      end(d, "timeout", now);
      return true;
    }
    return false;
  },

  summary(room) {
    const d = room.game.data;
    const left = Math.max(0, Math.ceil((d.deadline - (d.endedAt || Date.now())) / 1000));
    const seconds = Math.max(0, Math.round(((d.endedAt || Date.now()) - d.startedAt) / 1000));
    let detail;
    if (d.result === "defused") {
      detail = `三个模块全部拆掉，还剩 ${left} 秒，失误 ${d.strikes} 次`;
    } else if (d.result === "boom") {
      detail = `拆到第 ${Math.min(d.solved + 1, d.total)} 个模块时炸弹爆炸了：一共拆掉 ${d.solved} / ${d.total} 个，失误 ${d.strikes} 次`;
    } else if (d.result === "timeout") {
      detail = `时间到，还有 ${Math.max(0, d.total - d.solved)} 个模块没拆完，失误 ${d.strikes} 次`;
    } else {
      detail = `已经拆掉 ${d.solved} / ${d.total} 个模块，失误 ${d.strikes} 次`;
    }
    return {
      title: "一起拆弹",
      detail,
      data: {
        result: d.result,
        solved: d.solved,
        total: d.total,
        strikes: d.strikes,
        seconds,
        difficulty: d.difficulty,
      },
    };
  },
};
