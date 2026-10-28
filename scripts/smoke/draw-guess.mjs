// 你画我猜 · 端到端：选词、画布 ink 通道、猜错/猜中、计分、换画手。
// 单独跑：npm run smoke:game -- draw-guess
import { enterGame } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert }) {
  await enterGame({
    A,
    B,
    waitUntil,
    gameId: "draw-guess",
    settings: { rounds: 4, seconds: 60, libraries: ["日常"] },
    ready: () => A.game()?.phase === "choose" && B.game()?.phase === "choose",
  });

  assert(A.game().choices.length === 3, "three words");
  // 猜的人拿不到候选词文本
  assert(B.game().choices.length === 3, "guesser sees three placeholders");
  assert(
    B.game().choices.every((c) => !c.w),
    "guesser cannot see candidate words",
  );
  assert(B.game().answer === null, "guesser cannot see answer before drawing");

  A.act({ type: "choose", index: 0 });
  await waitUntil(() => A.game().phase === "drawing" && B.game().phase === "drawing", "drawing started");
  const answer = A.game().answer;
  assert(!!answer, "drawer sees answer");
  assert(B.game().answer === null, "guesser still cannot see answer while drawing");
  assert(
    B.game().choices.every((c) => !c.w),
    "guesser still cannot see candidate words while drawing",
  );
  assert(
    B.game().answerLength === Array.from(answer).length,
    "guesser only gets answer length",
  );

  const strokeId = "test-stroke-1";
  A.send({ type: "ink", run: A.state.game.run, data: { op: "start", id: strokeId, color: "#F05267", size: 10 } });
  A.send({
    type: "ink",
    run: A.state.game.run,
    data: { op: "points", id: strokeId, points: [100, 100, 200, 200, 300, 150] },
  });
  A.send({ type: "ink", run: A.state.game.run, data: { op: "end", id: strokeId } });
  await waitUntil(() => B.ink.some((d) => d.op === "points" && d.points.length === 6), "ink streamed");

  B.act({ type: "guess", text: "nope" });
  await waitUntil(() => B.game().guesses.length === 1, "wrong guess");
  B.act({ type: "guess", text: answer });
  await waitUntil(() => A.game().phase === "reveal" && B.game().answer === answer, "draw reveal");
  assert(A.game().score > 0 && A.game().correct === true, "draw score");
  assert(A.game().guesses.some((g) => g.correct), "correct guess recorded");
  assert(B.game().answer === answer, "guesser sees answer after reveal");

  A.act({ type: "next" });
  await waitUntil(() => A.game().round === 1 && A.game().phase === "choose", "draw round 2");
  assert(A.game().drawer === 1, "drawer alternates");
  B.act({ type: "choose", index: 0 });
  await waitUntil(() => A.game().phase === "drawing" && A.game().drawer === 1, "draw second round");
  console.log("done: draw-guess choose / ink / guess / score");
}
