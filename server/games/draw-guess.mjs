import { words } from "./_draw-guess.words.mjs";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\s，。,.!?！？、·~～'"“”‘’：:；;（）()【】[\]]/g, "");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickChoices(data, settings) {
  const libs = (settings.libraries || ["日常", "恋爱"]).filter((l) => l);
  const pool = words.filter((w) => libs.includes(w.lib) && !data.used.includes(w.lib + ":" + w.w));
  const source = pool.length >= 3 ? pool : words.filter((w) => libs.includes(w.lib));
  if (pool.length < 3) data.used = [];
  const picked = shuffle(source).slice(0, 3);
  return picked.map((w) => ({ w: w.w, lib: w.lib, lvl: w.lvl }));
}

function beginChoice(room, d, now) {
  d.phase = "choose";
  d.choices = pickChoices(d, room.settings["draw-guess"] || {});
  d.answer = null;
  d.category = "";
  d.deadline = now + 25000;
  d.revealAt = 0;
  d.strokes = [];
  d.guesses = [];
  d.roundPoints = 0;
  d.correct = false;
  d.correctSeat = null;
}

function beginDrawing(room, d, word, now) {
  d.answer = word.w;
  d.category = word.lib;
  d.phase = "drawing";
  d.deadline = now + (Number(d.seconds) || 80) * 1000;
  d.revealAt = 0;
  d.strokes = [];
  d.guesses = [];
  d.roundPoints = 0;
  d.correct = false;
  d.correctSeat = null;
}

function endRound(d, now, points) {
  d.phase = "reveal";
  d.roundPoints = points;
  d.revealAt = now + 4500;
  d.deadline = now + 4500;
  if (points > 0) d.correctRounds++;
}

function advance(room, d, now) {
  if (d.round + 1 >= d.rounds) {
    d.phase = "over";
    d.deadline = 0;
    return;
  }
  d.round++;
  d.drawer = 1 - d.drawer;
  beginChoice(room, d, now);
}

function near(a, b) {
  a = norm(a);
  b = norm(b);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  if (Math.abs(a.length - b.length) > 2) return false;
  // 简单编辑距离
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length] <= 1;
}

export default {
  create(room) {
    const s = room.settings["draw-guess"] || {};
    const d = {
      rounds: Number(s.rounds) || 6,
      seconds: Number(s.seconds) || 80,
      libraries: s.libraries?.length ? s.libraries : ["日常", "恋爱"],
      round: 0,
      total: Number(s.rounds) || 6,
      drawer: 0,
      phase: "choose",
      choices: [],
      answer: null,
      category: "",
      deadline: 0,
      revealAt: 0,
      score: 0,
      correctRounds: 0,
      guesses: [],
      strokes: [],
      used: [],
      roundPoints: 0,
      correct: false,
      correctSeat: null,
    };
    beginChoice(room, d, Date.now());
    return d;
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (action?.type === "choose") {
      if (d.phase !== "choose") return "现在不用选词啦";
      if (seat !== d.drawer) return "轮到 TA 选词啦";
      const index = Number(action.index);
      const word = d.choices[index];
      if (!word) return "这个选项不存在";
      d.used.push(word.lib + ":" + word.w);
      beginDrawing(room, d, word, now);
      return null;
    }
    if (action?.type === "guess") {
      if (d.phase !== "drawing") return "这一轮已经结束啦";
      if (seat === d.drawer) return "画手不能猜自己的画哦";
      const text = String(action.text || "").trim().slice(0, 30);
      if (!text) return "先写一个答案吧";
      if (d.guesses.some((g) => g.seat === seat && norm(g.text) === norm(text))) return "已经猜过这个啦";
      const isCorrect = norm(text) === norm(d.answer);
      d.guesses.push({ seat, text, correct: isCorrect, near: !isCorrect && near(text, d.answer), at: now });
      if (isCorrect) {
        const remain = Math.max(0, (d.deadline - now) / 1000);
        const points = 10 + Math.round(10 * Math.min(1, remain / d.seconds));
        d.correct = true;
        d.correctSeat = seat;
        d.score += points;
        endRound(d, now, points);
      }
      return null;
    }
    if (action?.type === "undo") {
      if (d.phase !== "drawing" || seat !== d.drawer) return "现在还不能撤销";
      d.strokes.pop();
      return null;
    }
    if (action?.type === "clear") {
      if (d.phase !== "drawing" || seat !== d.drawer) return "现在还不能清空";
      d.strokes = [];
      return null;
    }
    if (action?.type === "next") {
      if (d.phase !== "reveal") return "等这一轮揭晓吧";
      advance(room, d, now);
      return null;
    }
    return "这个操作暂时不可以";
  },

  // 按座位藏信息：猜的人永远拿不到候选词文本，答案要等揭晓。
  // seat === data.drawer 时返回完整数据（顺带补上 answerLength）。
  view(data, seat) {
    const answer = typeof data.answer === "string" ? data.answer : "";
    const answerLength = answer ? Array.from(answer).length : 0;
    if (seat === data.drawer) return { ...data, answerLength };
    const hiddenChoices = (data.choices || []).map(() => ({ w: null, lib: "", lvl: 0 }));
    const showAnswer = data.phase === "reveal" || data.phase === "over";
    return {
      ...data,
      choices: hiddenChoices,
      answer: showAnswer ? data.answer : null,
      answerLength,
    };
  },

  tick(room, now) {
    const d = room.game?.data;
    if (!d) return false;
    if (d.phase === "choose" && d.deadline > 0 && now >= d.deadline) {
      const word = d.choices[0];
      if (word) {
        d.used.push(word.lib + ":" + word.w);
        beginDrawing(room, d, word, now);
      }
      return true;
    }
    if (d.phase === "drawing" && now >= d.deadline) {
      endRound(d, now, 0);
      return true;
    }
    if (d.phase === "reveal" && d.revealAt > 0 && now >= d.revealAt) {
      advance(room, d, now);
      return true;
    }
    return false;
  },

  summary(room) {
    const d = room.game.data;
    return {
      title: "你画我猜",
      detail: `${d.rounds} 轮一起拿到 ${d.score} 分，猜中 ${d.correctRounds} 轮`,
      data: { score: d.score, correctRounds: d.correctRounds },
    };
  },
};
