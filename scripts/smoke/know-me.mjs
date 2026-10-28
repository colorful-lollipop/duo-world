// 你懂我吗 · 端到端：轮流答题、揭晓、主角给分、默契指数、结算。
// 单独跑：npm run smoke:game -- know-me
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert, sleep }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "know-me",
    settings: { count: 8, categories: ["吃喝", "习惯"] },
    ready: () => A.game()?.phase === "answer",
  });

  const total = A.game().total;
  for (let round = 0; round < total; round++) {
    const q = A.game().question;
    const answerFor = (offset) => {
      if (q.type === "choice") return (offset + round) % q.options.length;
      if (q.type === "scale") return 30 + offset * 20;
      return offset ? "猜猜" : "真实答案";
    };
    const hero = A.game().hero;
    const heroClient = hero === 0 ? A : B;
    const guessClient = hero === 0 ? B : A;
    heroClient.act({ type: "submit", answer: answerFor(1) });
    await sleep(70);
    assert(guessClient.game().submitted[hero], "hero submitted");
    guessClient.act({ type: "submit", answer: answerFor(2) });
    await waitUntil(() => heroClient.game().phase === "reveal", "know reveal");
    await sleep(950);
    heroClient.act({ type: "grade", score: 10 });
    await waitUntil(() => heroClient.game().phase === "revealed", "know graded");
    assert(heroClient.game().lastScore === 10, "know score");
    heroClient.act({ type: "next" });
    await waitUntil(
      () => (round + 1 >= total ? heroClient.game().phase === "over" : heroClient.game().idx === round + 1),
      "know next",
    );
  }

  const entry = await waitUntil(() => findJournal(A, "know-me"), "know journal");
  assert(entry.data.pct === 100, "know pct");
  console.log("done: know-me flow + grading + journal");
}
