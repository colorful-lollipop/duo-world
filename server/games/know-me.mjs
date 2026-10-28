import { questions } from "../content/questions.mjs";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickQuestions(settings) {
  const cats = settings.categories?.length ? settings.categories : ["吃喝", "习惯", "回忆", "恋爱", "假如", "未来"];
  const pool = questions.filter((q) => cats.includes(q.category));
  const picked = shuffle(pool).slice(0, Number(settings.count) || 10);
  return picked.map((q) => ({
    id: q.id,
    category: q.category,
    type: q.type,
    text: q.text,
    options: q.options || null,
    left: q.left || null,
    right: q.right || null,
  }));
}

function validAnswer(question, answer) {
  if (!question) return false;
  if (question.type === "choice") {
    return Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
  }
  if (question.type === "scale") {
    return typeof answer === "number" && Number.isFinite(answer) && answer >= 0 && answer <= 100;
  }
  if (question.type === "text") {
    return typeof answer === "string" && answer.trim().length > 0 && answer.trim().length <= 120;
  }
  return false;
}

function finishQuestion(d, score) {
  d.score += score;
  d.lastScore = score;
  d.history.push({ hero: d.hero, answers: d.answers, score, question: d.question });
  d.phase = "revealed";
}

export default {
  create(room) {
    const picked = pickQuestions(room.settings["know-me"] || {});
    return {
      idx: 0,
      total: picked.length,
      questions: picked,
      hero: 0,
      phase: "answer",
      question: picked[0],
      submitted: [false, false],
      answers: [null, null],
      revealAt: 0,
      score: 0,
      lastScore: null,
      history: [],
      autoDeadline: 0,
    };
  },

  action(room, seat, action, now) {
    const d = room.game.data;
    if (action?.type === "submit") {
      if (d.phase !== "answer") return "这道题已经揭晓啦";
      if (d.submitted[seat]) return "你已经锁定答案啦";
      if (!validAnswer(d.question, action.answer)) return "这个答案不太对";
      d.answers[seat] = action.answer;
      d.submitted[seat] = true;
      if (d.submitted[0] && d.submitted[1]) {
        d.phase = "reveal";
        d.revealAt = now + 900;
        d.autoDeadline = now + 45000;
      }
      return null;
    }
    if (action?.type === "grade") {
      if (d.phase !== "reveal") return "还不到给分的时候";
      if (seat !== d.hero) return "由主角来给分哦";
      if (now < d.revealAt) return "答案还没有翻开";
      const score = Number(action.score);
      if (![0, 5, 10].includes(score)) return "分数不太对";
      finishQuestion(d, score);
      return null;
    }
    if (action?.type === "next") {
      if (d.phase !== "revealed") return "先等主角给分吧";
      if (d.idx + 1 >= d.total) {
        d.phase = "over";
        return null;
      }
      d.idx++;
      d.hero = 1 - d.hero;
      d.question = d.questions[d.idx];
      d.phase = "answer";
      d.submitted = [false, false];
      d.answers = [null, null];
      d.revealAt = 0;
      d.autoDeadline = 0;
      d.lastScore = null;
      return null;
    }
    return "这个操作暂时不可以";
  },

  tick(room, now) {
    const d = room.game?.data;
    if (!d) return false;
    if (d.phase === "reveal" && d.autoDeadline > 0 && now >= d.autoDeadline) {
      finishQuestion(d, 5);
      return true;
    }
    return false;
  },

  summary(room) {
    const d = room.game.data;
    const pct = d.total ? Math.round((d.score / (d.total * 10)) * 100) : 0;
    return {
      title: "你懂我吗",
      detail: `默契指数 ${pct}% · ${d.score} / ${d.total * 10} 分`,
      data: { pct, score: d.score },
    };
  },
};
