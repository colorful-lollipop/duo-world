// 深夜聊天卡 · 端到端：抽卡、收藏、换一张、聊天、结束。
// 单独跑：npm run smoke:game -- talk-cards
import { enterGame, findJournal } from "./_harness.mjs";

export default async function run({ A, B, waitUntil, assert, sleep }) {
  await enterGame({ A, B, waitUntil, gameId: "talk-cards", settings: { deck: "轻松" }, ready: () => A.game()?.phase === "draw" });

  const turn = A.game().turn;
  const turnClient = turn === 0 ? A : B;
  const otherClient = turn === 0 ? B : A;
  otherClient.act({ type: "draw" });
  await sleep(150);
  assert(turnClient.game().phase === "draw", "wrong turn rejected");

  turnClient.act({ type: "draw" });
  await waitUntil(() => turnClient.game().phase === "shown" && turnClient.game().card, "talk drawn");
  assert(turnClient.game().flipAt > Date.now() - 1000, "flip timestamp");
  turnClient.act({ type: "fav" });
  await waitUntil(() => turnClient.game().favorites[turn].length === 1, "talk favorite");

  const firstCardId = turnClient.game().card.id;
  turnClient.act({ type: "reroll" });
  await waitUntil(() => turnClient.game().card.id !== firstCardId && turnClient.game().phase === "shown", "talk reroll");

  const idxAfterReroll = turnClient.game().idx;
  turnClient.act({ type: "next" });
  await waitUntil(() => turnClient.game().idx === idxAfterReroll + 1 && turnClient.game().phase === "draw", "talk next");

  const nextTurnClient = turn === 0 ? B : A;
  nextTurnClient.act({ type: "draw" });
  await waitUntil(() => nextTurnClient.game().phase === "shown", "talk second draw");
  nextTurnClient.act({ type: "finish" });
  await waitUntil(() => nextTurnClient.game().phase === "over", "talk over");
  await waitUntil(() => findJournal(A, "talk-cards"), "talk journal");
  console.log("done: talk-cards draw / favorite / turn guard / finish");
}
