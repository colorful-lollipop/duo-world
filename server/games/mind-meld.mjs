import { pickPrompts } from "./_mind-meld.prompts.mjs";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s，。,.!?！？、·~～'"“”‘’：:；;（）()【】[\]-]/g, "");
}

function cleanWord(word) {
  return String(word || "")
    .replace(/\s+/g, "")
    .slice(0, 12);
}

export default {
  create(room) {
    const maxRounds = Number(room.settings["mind-meld"]?.rounds) || 10;
    return {
      round: 0,
      maxRounds,
      phase: "submit",
      history: [],
      submitted: [null, null],
      answers: null,
      revealAt: 0,
      agrees: [false, false],
      roundMatched: false,
      matched: 0,
      lastGain: 0,
      prompts: pickPrompts([], 6),
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (action?.type === "submit") {
      if (d.phase !== "submit") return "这一轮已经揭晓啦";
      if (d.submitted[seat]) return "你已经写好啦";
      const word = cleanWord(action.word);
      if (!word) return "先写一个词吧";
      const used = new Set(d.history.flatMap((h) => [norm(h.a), norm(h.b)]));
      if (used.has(norm(word))) return "这个词已经出现过啦，换一个";
      d.submitted[seat] = word;
      if (d.submitted[0] && d.submitted[1]) {
        d.phase = "reveal";
        d.answers = [d.submitted[0], d.submitted[1]];
        d.revealAt = now + 900;
        d.roundMatched = norm(d.answers[0]) === norm(d.answers[1]);
        d.history.push({ a: d.answers[0], b: d.answers[1], matched: d.roundMatched });
        d.lastGain = d.roundMatched ? 1 : 0;
        if (d.roundMatched) d.matched++;
      }
      return null;
    }
    if (action?.type === "agree") {
      if (d.phase !== "reveal" || d.roundMatched) return "现在不用确认啦";
      d.agrees[seat] = true;
      if (d.agrees[0] && d.agrees[1]) {
        d.roundMatched = true;
        d.lastGain = 1;
        d.matched++;
        const last = d.history[d.history.length - 1];
        if (last) last.matched = true;
      }
      return null;
    }
    if (action?.type === "next") {
      if (d.phase !== "reveal") return "等两个人都写好吧";
      if (d.round + 1 >= d.maxRounds) {
        d.phase = "over";
        return null;
      }
      d.round++;
      d.phase = "submit";
      d.submitted = [null, null];
      d.answers = null;
      d.revealAt = 0;
      d.agrees = [false, false];
      d.roundMatched = false;
      d.lastGain = 0;
      d.prompts = pickPrompts(d.history, 6);
      return null;
    }
    return "这个操作暂时不可以";
  },

  summary(room) {
    const d = room.game.data;
    const total = d.history.length;
    return {
      title: "心有灵犀",
      detail:
        total > 0
          ? `${total} 轮里 ${d.matched} 次说出同一个词${d.matched === total ? "，简直是同一个人" : ""}`
          : "词链还空着，下次再来",
      data: { chain: d.history, matched: d.matched },
    };
  },
};
